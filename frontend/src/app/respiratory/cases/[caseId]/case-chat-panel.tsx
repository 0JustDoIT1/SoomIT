"use client";

import {
  FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Sender = { id: string; name: string; department: string; role: string };
type ChatMessage = { id: string; case_id: string; sender: Sender; body: string; is_private?: boolean; recipient_ids?: string[]; read_by?: Array<{ id: string; name: string; read_at: string }>; created_at: string };
type History = { results?: ChatMessage[]; next_cursor?: string | null };
type Recipient = { id: string; name: string; department: string; role: string };

type Consultation = {
  id: string;
  recipient_name?: string | null;
  question: string;
  priority: string;
  status: string;
  response_note?: string | null;
  responded_at?: string | null;
  created_at: string;
};

type ChatPosition = {
  x: number;
  y: number;
};

type ChatDragState = {
  pointerX: number;
  pointerY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

const realtimeBaseUrl = (process.env.NEXT_PUBLIC_REALTIME_WS_URL?.trim() || "ws://127.0.0.1:8001").replace(/\/+$/, "");

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const consultationStatusLabel: Record<string, string> = {
  REQUESTED: "요청됨",
  ACKNOWLEDGED: "확인됨",
  RESPONDED: "회신됨",
  CANCELLED: "취소됨",
};


const CHAT_POSITION_KEY = "respiratory-case-chat-position";
const CHAT_DRAG_THRESHOLD = 4;
const CHAT_VIEWPORT_MARGIN = 12;

function errorDetail(value: unknown, fallback: string) {
  return value && typeof value === "object" && "detail" in value && typeof value.detail === "string" ? value.detail : fallback;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function CaseChatPanel({ caseId, authorizedFetch, initiallyOpen = false, focusMessageId }: { caseId: string; authorizedFetch: AuthorizedFetch; initiallyOpen?: boolean; focusMessageId?: string | null }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [composerMode, setComposerMode] = useState<"PUBLIC" | "PRIVATE" | "CONSULTATION">("PUBLIC");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [consultationRecipients, setConsultationRecipients] = useState<Recipient[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [consultationRecipientId, setConsultationRecipientId] = useState("");
  const [consultationQuestion, setConsultationQuestion] = useState("");
  const [consultationPriority, setConsultationPriority] = useState("NORMAL");
  const [consultationBusy, setConsultationBusy] = useState(false);
  const [consultationError, setConsultationError] = useState("");

  const isPrivate = composerMode === "PRIVATE";
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("offline");
  const [error, setError] = useState("");

  // Case 채팅만 워크스테이션 고정 레이아웃의 예외로 이동 가능하게 둔다.
  const [chatPosition, setChatPosition] = useState<ChatPosition>({ x: 0, y: 0 });
  const [isDraggingChat, setIsDraggingChat] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatPositionRef = useRef<ChatPosition>({ x: 0, y: 0 });
  const suppressNextToggleRef = useRef(false);
  const dragStateRef = useRef<ChatDragState>({
    pointerX: 0,
    pointerY: 0,
    startX: 0,
    startY: 0,
    moved: false,
  });

  const mergeMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
  }, []);


  const clampChatPosition = useCallback((position: ChatPosition): ChatPosition => {
    if (typeof window === "undefined") return position;

    const container = chatContainerRef.current;
    const width = container?.offsetWidth ?? 160;
    const height = container?.offsetHeight ?? 52;

    // 기준 위치가 right:20 / bottom:20이므로 양수 방향은 화면 밖으로 나간다.
    const minX = Math.min(0, -(window.innerWidth - width - CHAT_VIEWPORT_MARGIN * 2));
    const minY = Math.min(0, -(window.innerHeight - height - 60 - CHAT_VIEWPORT_MARGIN * 2));

    return {
      x: Math.min(0, Math.max(minX, position.x)),
      y: Math.min(0, Math.max(minY, position.y)),
    };
  }, []);

  const saveChatPosition = useCallback((position: ChatPosition) => {
    try {
      window.localStorage.setItem(CHAT_POSITION_KEY, JSON.stringify(position));
    } catch {
      // localStorage를 사용할 수 없어도 현재 세션의 drag 동작은 유지한다.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(CHAT_POSITION_KEY);
        if (!saved) return;

        const parsed = JSON.parse(saved) as Partial<ChatPosition>;
        if (
          typeof parsed.x !== "number" ||
          typeof parsed.y !== "number" ||
          !Number.isFinite(parsed.x) ||
          !Number.isFinite(parsed.y)
        ) {
          return;
        }

        const next = clampChatPosition({ x: parsed.x, y: parsed.y });
        chatPositionRef.current = next;
        setChatPosition(next);
      } catch {
        // 잘못 저장된 위치 값은 무시한다.
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [clampChatPosition]);

  useEffect(() => {
    // 닫힌 버튼에서 열린 패널로 크기가 바뀌면 새 크기에 맞춰 화면 안으로 보정한다.
    const timer = window.setTimeout(() => {
      const next = clampChatPosition(chatPositionRef.current);
      chatPositionRef.current = next;
      setChatPosition(next);
      saveChatPosition(next);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [clampChatPosition, open, saveChatPosition]);

  useEffect(() => {
    const handleResize = () => {
      const next = clampChatPosition(chatPositionRef.current);
      chatPositionRef.current = next;
      setChatPosition(next);
      saveChatPosition(next);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampChatPosition, saveChatPosition]);

  function startChatDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest('[data-chat-no-drag="true"]')) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    dragStateRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: chatPositionRef.current.x,
      startY: chatPositionRef.current.y,
      moved: false,
    };

    suppressNextToggleRef.current = false;
    setIsDraggingChat(true);
  }

  function moveChat(event: ReactPointerEvent<HTMLElement>) {
    if (!isDraggingChat) return;

    const deltaX = event.clientX - dragStateRef.current.pointerX;
    const deltaY = event.clientY - dragStateRef.current.pointerY;

    if (
      !dragStateRef.current.moved &&
      Math.hypot(deltaX, deltaY) >= CHAT_DRAG_THRESHOLD
    ) {
      dragStateRef.current.moved = true;
    }

    const next = clampChatPosition({
      x: dragStateRef.current.startX + deltaX,
      y: dragStateRef.current.startY + deltaY,
    });

    chatPositionRef.current = next;
    setChatPosition(next);
  }

  function endChatDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!isDraggingChat) return;

    setIsDraggingChat(false);
    suppressNextToggleRef.current = dragStateRef.current.moved;

    const next = clampChatPosition(chatPositionRef.current);
    chatPositionRef.current = next;
    setChatPosition(next);
    saveChatPosition(next);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 이미 capture가 해제된 경우 무시한다.
    }
  }

  function toggleChat() {
    // drag 직후 발생하는 click 때문에 채팅창이 열리거나 닫히는 것을 막는다.
    if (suppressNextToggleRef.current) {
      suppressNextToggleRef.current = false;
      return;
    }

    setOpen((value) => !value);
  }

  function resetChatPosition() {
    const next = { x: 0, y: 0 };
    chatPositionRef.current = next;
    setChatPosition(next);
    saveChatPosition(next);
  }

  const loadConsultations = useCallback(async () => {
    const response = await authorizedFetch(
      `${apiBaseUrl}/api/doctor/cases/${caseId}/consultations/`,
    );

    const payload: unknown = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(
        errorDetail(payload, "협진 요청 내역을 불러오지 못했습니다."),
      );
    }

    setConsultations(Array.isArray(payload) ? (payload as Consultation[]) : []);
  }, [authorizedFetch, caseId]);

  const refreshUnreadCount = useCallback(async () => {
    const response = await authorizedFetch(`${apiBaseUrl}/api/chat/cases/${caseId}/messages/unread-count/`);
    const payload: unknown = await response.json().catch(() => ({}));
    if (response.ok && payload && typeof payload === "object" && "unread_count" in payload && typeof payload.unread_count === "number") {
      setUnreadCount(payload.unread_count);
    }
  }, [authorizedFetch, caseId]);

  const loadHistory = useCallback(async (cursor?: string | null) => {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await authorizedFetch(`${apiBaseUrl}/api/chat/cases/${caseId}/messages/${suffix}`);
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorDetail(payload, "채팅 기록을 불러오지 못했습니다."));
    const history = payload as History;
    const incoming = Array.isArray(history.results) ? history.results : [];
    setMessages((current) => cursor ? [...incoming.reverse(), ...current] : incoming.reverse());
    setNextCursor(typeof history.next_cursor === "string" ? history.next_cursor : null);
    if (incoming.length) {
      void authorizedFetch(`${apiBaseUrl}/api/chat/cases/${caseId}/messages/read/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_ids: incoming.map((message) => message.id) }),
      }).then(() => void refreshUnreadCount());
    }
  }, [authorizedFetch, caseId, refreshUnreadCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asynchronous unread-count synchronization.
    void refreshUnreadCount();
    const timer = window.setInterval(() => void refreshUnreadCount(), 30000);
    return () => window.clearInterval(timer);
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!open) return;

    let disposed = false;

    const refresh = async () => {
      try {
        await loadConsultations();
        if (!disposed) setConsultationError("");
      } catch (cause) {
        if (!disposed) {
          setConsultationError(
            cause instanceof Error
              ? cause.message
              : "협진 요청 내역을 불러오지 못했습니다.",
          );
        }
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [loadConsultations, open]);

  useEffect(() => {
    if (!focusMessageId || !messages.some((message) => message.id === focusMessageId)) return;
    document.getElementById(`case-chat-message-${focusMessageId}`)?.scrollIntoView({ block: "center" });
  }, [focusMessageId, messages]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this is an asynchronous REST failure callback.
    void loadHistory().catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : "채팅 기록을 불러오지 못했습니다."));
    return () => { cancelled = true; };
  }, [loadHistory, open]);

  useEffect(() => {
    if (!open) return;

    let disposed = false;

    const loadRecipients = async () => {
      try {
        const [chatResponse, consultationResponse] = await Promise.all([
          authorizedFetch(`${apiBaseUrl}/api/chat/cases/${caseId}/recipients/`),
          authorizedFetch(
            `${apiBaseUrl}/api/chat/cases/${caseId}/recipients/?purpose=consultation`,
          ),
        ]);

        const [chatPayload, consultationPayload] = await Promise.all([
          chatResponse.json().catch(() => []),
          consultationResponse.json().catch(() => []),
        ]);

        if (disposed) return;

        setRecipients(
          chatResponse.ok && Array.isArray(chatPayload)
            ? (chatPayload as Recipient[])
            : [],
        );

        setConsultationRecipients(
          consultationResponse.ok && Array.isArray(consultationPayload)
            ? (consultationPayload as Recipient[])
            : [],
        );
      } catch {
        if (!disposed) {
          setRecipients([]);
          setConsultationRecipients([]);
        }
      }
    };

    void loadRecipients();

    return () => {
      disposed = true;
    };
  }, [authorizedFetch, caseId, open]);

  useEffect(() => {
    if (!open) return;
    const token = window.sessionStorage.getItem("accessToken");
    if (!token) return;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      const socket = new WebSocket(`${realtimeBaseUrl}/ws/chat/${encodeURIComponent(caseId)}?token=${encodeURIComponent(token)}`);
      socketRef.current = socket;
      socket.onopen = () => !disposed && setStatus("connected");
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; message?: ChatMessage; read?: { message_id: string; reader: { id: string; name: string; read_at: string } }; detail?: string };
          if (payload.type === "chat.message.created" && payload.message) {
            mergeMessage(payload.message);
            socket.send(JSON.stringify({ type: "chat.message.read", message_id: payload.message.id }));
          }
          if (payload.type === "chat.message.read" && payload.read) {
            setMessages((current) => current.map((message) => message.id !== payload.read?.message_id ? message : {
              ...message,
              read_by: message.read_by?.some((reader) => reader.id === payload.read?.reader.id)
                ? message.read_by
                : [...(message.read_by || []), payload.read.reader],
            }));
          }
          if (payload.type === "chat.error") setError(payload.detail || "메시지를 전송하지 못했습니다.");
        } catch { setError("채팅 이벤트를 해석하지 못했습니다."); }
      };
      socket.onclose = (event) => {
        if (disposed) return;
        setStatus("offline");
        if (event.code === 4401) setError("로그인이 만료되었습니다.");
        else if (event.code === 4403) setError("이 Case 채팅 권한이 없습니다.");
        else reconnectTimerRef.current = window.setTimeout(connect, 3000);
      };
      socket.onerror = () => setStatus("offline");
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [caseId, mergeMessage, open]);

  const submitConsultation = async () => {
    const trimmed = consultationQuestion.trim();

    if (!consultationRecipientId) {
      setConsultationError("협진을 요청할 호흡기내과 의사를 선택하세요.");
      return;
    }

    if (!trimmed || consultationBusy) return;

    setConsultationBusy(true);
    setConsultationError("");

    try {
      const response = await authorizedFetch(
        `${apiBaseUrl}/api/doctor/cases/${caseId}/consultations/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient_user_id: consultationRecipientId,
            question: trimmed,
            priority: consultationPriority,
          }),
        },
      );

      const payload: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(errorDetail(payload, "협진 요청에 실패했습니다."));
      }

      setConsultationQuestion("");
      setConsultationRecipientId("");
      setConsultationPriority("NORMAL");
      setComposerMode("PUBLIC");

      await loadConsultations();
    } catch (cause) {
      setConsultationError(
        cause instanceof Error ? cause.message : "협진 요청에 실패했습니다.",
      );
    } finally {
      setConsultationBusy(false);
    }
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 2000 || isPrivate && recipientIds.length === 0) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) { setError("실시간 채팅 서버에 연결되지 않았습니다."); return; }
    socketRef.current.send(JSON.stringify({ type: "chat.message.create", client_message_id: crypto.randomUUID(), body: trimmed, is_private: isPrivate, recipient_ids: isPrivate ? recipientIds : [] }));
    setBody("");
    if (isPrivate) setRecipientIds([]);
  };

  const timeline = [
    ...messages.map((message) => ({
      kind: "message" as const,
      id: `message-${message.id}`,
      createdAt: message.created_at,
      value: message,
    })),
    ...consultations.map((consultation) => ({
      kind: "consultation" as const,
      id: `consultation-${consultation.id}`,
      createdAt: consultation.created_at,
      value: consultation,
    })),
  ].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <div
      ref={chatContainerRef}
      className="fixed bottom-5 right-5 z-40"
      style={{
        transform: `translate3d(${chatPosition.x}px, ${chatPosition.y}px, 0)`,
      }}
    >
      {open && (
        <section className="mb-3 flex h-[560px] w-[400px] flex-col overflow-hidden rounded-[20px] border border-slate-200/90 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.18)]">
          {/* Header / drag handle */}
          <header
            onPointerDown={startChatDrag}
            onPointerMove={moveChat}
            onPointerUp={endChatDrag}
            onPointerCancel={endChatDrag}
            className={`flex touch-none select-none items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 ${
              isDraggingChat ? "cursor-grabbing" : "cursor-grab"
            }`}
            title="상단을 드래그하여 채팅창 이동"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M7.5 18.5 4 20l1.1-3.4A8 8 0 1 1 20 12a8 8 0 0 1-12.5 6.5Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8 11.5h.01M12 11.5h.01M16 11.5h.01"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[13px] font-bold tracking-[-0.01em] text-slate-900">
                    Case Communication
                  </h2>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                      status === "connected"
                        ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                        : status === "connecting"
                          ? "border-amber-100 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        status === "connected"
                          ? "bg-emerald-500"
                          : status === "connecting"
                            ? "bg-amber-500"
                            : "bg-slate-400"
                      }`}
                    />
                    {status === "connected"
                      ? "실시간 연결"
                      : status === "connecting"
                        ? "연결 중"
                        : "오프라인"}
                  </span>
                </div>

                <p className="mt-0.5 truncate text-[10px] text-slate-400">
                  Case 기반 의료진 협업 · 채팅 · 개인 메시지 · 협진
                </p>
              </div>
            </div>

            <div
              data-chat-no-drag="true"
              className="flex shrink-0 items-center gap-1"
            >
              <button
                type="button"
                onClick={resetChatPosition}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                title="위치 초기화"
                aria-label="채팅 위치 초기화"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M4 8V4h4M20 16v4h-4M5.5 18.5A9 9 0 0 1 5 6l3-2M18.5 5.5A9 9 0 0 1 19 18l-3 2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <button
                type="button"
                onClick={toggleChat}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                title="채팅 닫기"
                aria-label="채팅 닫기"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </header>

          {/* Timeline */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#F8FAFC] px-3.5 py-3">
            {nextCursor && (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={() =>
                    void loadHistory(nextCursor).catch((cause) =>
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "채팅 기록을 불러오지 못했습니다.",
                      ),
                    )
                  }
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700"
                >
                  이전 메시지 불러오기
                </button>
              </div>
            )}

            {!timeline.length && (
              <div className="flex h-full min-h-[210px] flex-col items-center justify-center px-8 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M7.5 18.5 4 20l1.1-3.4A8 8 0 1 1 20 12a8 8 0 0 1-12.5 6.5Z"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                <p className="mt-3 text-xs font-semibold text-slate-700">
                  아직 Case 대화가 없습니다.
                </p>
                <p className="mt-1 text-[10px] leading-4 text-slate-400">
                  공용 메시지, 개인 메시지 또는 협진 요청으로
                  <br />
                  의료진 간 커뮤니케이션을 시작할 수 있습니다.
                </p>
              </div>
            )}

            <div className="space-y-3">
              {timeline.map((item) => {
                if (item.kind === "consultation") {
                  const consultation = item.value;
                  const urgent = consultation.priority === "URGENT";

                  return (
                    <article
                      key={item.id}
                      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                        urgent
                          ? "border-rose-200"
                          : "border-violet-200"
                      }`}
                    >
                      <div
                        className={`flex items-center justify-between gap-3 border-b px-3 py-2 ${
                          urgent
                            ? "border-rose-100 bg-rose-50/70"
                            : "border-violet-100 bg-violet-50/70"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              urgent
                                ? "bg-rose-100 text-rose-700"
                                : "bg-violet-100 text-violet-700"
                            }`}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M8 12h8M12 8v8M5 20h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3l-1-2H9L8 5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2Z"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`text-[10px] font-bold ${
                                  urgent
                                    ? "text-rose-800"
                                    : "text-violet-800"
                                }`}
                              >
                                협진 요청
                              </span>

                              {urgent && (
                                <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[8px] font-bold text-white">
                                  긴급
                                </span>
                              )}

                              <span className="rounded-full border border-white/80 bg-white/80 px-1.5 py-0.5 text-[8px] font-semibold text-slate-600">
                                {consultationStatusLabel[consultation.status] ??
                                  consultation.status}
                              </span>
                            </div>

                            <p className="mt-0.5 truncate text-[9px] text-slate-500">
                              수신 ·{" "}
                              {consultation.recipient_name ||
                                "수신 의사 정보 없음"}
                            </p>
                          </div>
                        </div>

                        <time className="shrink-0 text-[9px] text-slate-400">
                          {dateLabel(consultation.created_at)}
                        </time>
                      </div>

                      <div className="px-3 py-2.5">
                        <p className="whitespace-pre-wrap break-words text-[11px] leading-[1.65] text-slate-700">
                          {consultation.question}
                        </p>

                        {consultation.response_note && (
                          <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              <p className="text-[9px] font-bold text-emerald-700">
                                협진 회신
                              </p>
                            </div>

                            <p className="mt-1 whitespace-pre-wrap break-words text-[10px] leading-5 text-emerald-900">
                              {consultation.response_note}
                            </p>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                }

                const message = item.value;

                return (
                  <article
                    id={`case-chat-message-${message.id}`}
                    key={item.id}
                    className={`rounded-2xl border bg-white px-3 py-2.5 shadow-sm transition ${
                      message.id === focusMessageId
                        ? "border-blue-300 ring-2 ring-blue-100"
                        : message.is_private
                          ? "border-violet-200"
                          : "border-slate-200"
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                            message.is_private
                              ? "bg-violet-100 text-violet-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {message.sender.name?.slice(0, 1) || "의"}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[10px] font-bold text-slate-700">
                              {message.sender.name}
                            </span>

                            {message.is_private && (
                              <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[8px] font-bold text-violet-700">
                                개인
                              </span>
                            )}
                          </div>

                          <p className="truncate text-[8px] text-slate-400">
                            {message.sender.department} · {message.sender.role}
                          </p>
                        </div>
                      </div>

                      <time className="shrink-0 text-[9px] text-slate-400">
                        {dateLabel(message.created_at)}
                      </time>
                    </div>

                    <p className="whitespace-pre-wrap break-words pl-9 text-[11px] leading-[1.65] text-slate-700">
                      {message.body}
                    </p>

                    {message.read_by && message.read_by.length > 0 && (
                      <p className="mt-1.5 pl-9 text-[8px] font-medium text-emerald-600">
                        읽음 ·{" "}
                        {message.read_by.map((reader) => reader.name).join(", ")}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="border-t border-amber-100 bg-amber-50 px-3.5 py-2 text-[10px] leading-4 text-amber-700">
              {error}
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-slate-200 bg-white">
            <div className="grid grid-cols-3 border-b border-slate-100 px-3 pt-2.5">
              <button
                type="button"
                onClick={() => {
                  setComposerMode("PUBLIC");
                  setRecipientIds([]);
                  setConsultationError("");
                }}
                className={`relative px-2 pb-2 text-[10px] font-semibold transition ${
                  composerMode === "PUBLIC"
                    ? "text-blue-700"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                공용 메시지
                {composerMode === "PUBLIC" && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-blue-600" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setComposerMode("PRIVATE");
                  setConsultationError("");
                }}
                className={`relative px-2 pb-2 text-[10px] font-semibold transition ${
                  composerMode === "PRIVATE"
                    ? "text-violet-700"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                개인 메시지
                {composerMode === "PRIVATE" && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-violet-600" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setComposerMode("CONSULTATION");
                  setRecipientIds([]);
                  setConsultationError("");
                }}
                className={`relative px-2 pb-2 text-[10px] font-semibold transition ${
                  composerMode === "CONSULTATION"
                    ? "text-violet-700"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                협진 요청
                {composerMode === "CONSULTATION" && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-violet-600" />
                )}
              </button>
            </div>

            <div className="p-3">
              {composerMode === "CONSULTATION" ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-[1fr_108px] gap-2">
                    <div>
                      <label className="mb-1 block text-[9px] font-semibold text-slate-500">
                        협진 의사
                      </label>
                      <select
                        value={consultationRecipientId}
                        onChange={(event) =>
                          setConsultationRecipientId(event.target.value)
                        }
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                      >
                        <option value="">의사 선택</option>
                        {consultationRecipients.map((recipient) => (
                          <option key={recipient.id} value={recipient.id}>
                            {recipient.name} · {recipient.role}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[9px] font-semibold text-slate-500">
                        우선순위
                      </label>
                      <select
                        value={consultationPriority}
                        onChange={(event) =>
                          setConsultationPriority(event.target.value)
                        }
                        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                      >
                        <option value="NORMAL">일반</option>
                        <option value="URGENT">긴급</option>
                      </select>
                    </div>
                  </div>

                  {consultationRecipients.length === 0 && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50/70 px-2.5 py-2">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <p className="text-[9px] leading-4 text-amber-700">
                        현재 선택 가능한 다른 호흡기내과 의사가 없습니다.
                      </p>
                    </div>
                  )}

                  <textarea
                    value={consultationQuestion}
                    onChange={(event) =>
                      setConsultationQuestion(event.target.value)
                    }
                    maxLength={2000}
                    placeholder="협진 요청 내용을 입력하세요."
                    className="h-20 w-full resize-none rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-2.5 text-[11px] leading-5 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-100"
                  />

                  {consultationError && (
                    <p className="text-[9px] leading-4 text-rose-700">
                      {consultationError}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[8px] leading-4 text-slate-400">
                      선택한 의사에게 공식 협진 업무와 알림이 전달됩니다.
                    </p>

                    <button
                      type="button"
                      disabled={
                        consultationBusy ||
                        !consultationRecipientId ||
                        !consultationQuestion.trim() ||
                        consultationRecipients.length === 0
                      }
                      onClick={() => void submitConsultation()}
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 px-3.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                      {consultationBusy ? "요청 중..." : "협진 요청"}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={send}>
                  {composerMode === "PRIVATE" && (
                    <div className="mb-2.5 max-h-24 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-1.5">
                      {recipients.length ? (
                        recipients.map((recipient) => {
                          const selected = recipientIds.includes(recipient.id);

                          return (
                            <label
                              key={recipient.id}
                              className={`flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-[10px] transition ${
                                selected
                                  ? "bg-violet-100 text-violet-900"
                                  : "text-slate-600 hover:bg-white"
                              }`}
                            >
                              <span className="flex min-w-0 items-center">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() =>
                                    setRecipientIds((current) =>
                                      selected
                                        ? current.filter(
                                            (id) => id !== recipient.id,
                                          )
                                        : [...current, recipient.id],
                                    )
                                  }
                                  className="mr-2 accent-violet-600"
                                />
                                <span className="truncate">
                                  {recipient.name} · {recipient.department}
                                </span>
                              </span>

                              <span className="ml-2 shrink-0 text-[8px] text-slate-400">
                                {recipient.role}
                              </span>
                            </label>
                          );
                        })
                      ) : (
                        <p className="px-2 py-2 text-center text-[9px] text-slate-400">
                          선택 가능한 수신자가 없습니다.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <textarea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      maxLength={2000}
                      rows={2}
                      placeholder={
                        composerMode === "PRIVATE"
                          ? "개인 메시지를 입력하세요."
                          : "Case 메시지를 입력하세요."
                      }
                      className="max-h-24 min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-2.5 text-[11px] leading-5 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />

                    <button
                      type="submit"
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 ${
                        composerMode === "PRIVATE"
                          ? "bg-violet-600 hover:bg-violet-700"
                          : "bg-blue-600 hover:bg-blue-700"
                      }`}
                      disabled={
                        !body.trim() ||
                        status !== "connected" ||
                        (composerMode === "PRIVATE" &&
                          recipientIds.length === 0)
                      }
                      title="메시지 전송"
                      aria-label="메시지 전송"
                    >
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="m4 4 16 8-16 8 3-8-3-8Z"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M7 12h13"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-[8px] text-slate-400">
                      {composerMode === "PRIVATE"
                        ? "선택한 의료진에게만 표시됩니다."
                        : "현재 Case에 접근 가능한 의료진이 함께 확인합니다."}
                    </p>
                    <span className="text-[8px] tabular-nums text-slate-300">
                      {body.length}/2000
                    </span>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        onPointerDown={!open ? startChatDrag : undefined}
        onPointerMove={!open ? moveChat : undefined}
        onPointerUp={!open ? endChatDrag : undefined}
        onPointerCancel={!open ? endChatDrag : undefined}
        onClick={toggleChat}
        className={`group relative inline-flex h-12 items-center gap-2 rounded-2xl border border-blue-500/20 bg-blue-600 px-4 text-[12px] font-bold text-white shadow-[0_10px_30px_rgba(37,99,235,0.25)] transition hover:bg-blue-700 ${
          !open
            ? isDraggingChat
              ? "cursor-grabbing touch-none select-none"
              : "cursor-grab touch-none select-none"
            : ""
        }`}
        title={
          open
            ? "Case 채팅 닫기"
            : "클릭하여 열기 · 드래그하여 이동"
        }
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="opacity-90"
        >
          <path
            d="M7.5 18.5 4 20l1.1-3.4A8 8 0 1 1 20 12a8 8 0 0 1-12.5 6.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span>{open ? "채팅 닫기" : "Case 채팅"}</span>

        {!open && unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full border-2 border-white bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
