"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Sender = { id: string; name: string; department: string; role: string };
type ChatMessage = { id: string; case_id: string; sender: Sender; body: string; is_private?: boolean; recipient_ids?: string[]; read_by?: Array<{ id: string; name: string; read_at: string }>; created_at: string };
type History = { results?: ChatMessage[]; next_cursor?: string | null };
type Recipient = { id: string; name: string; department: string; role: string };

const realtimeBaseUrl = (process.env.NEXT_PUBLIC_REALTIME_WS_URL?.trim() || "ws://127.0.0.1:8001").replace(/\/+$/, "");

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
  const [isPrivate, setIsPrivate] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("offline");
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const mergeMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
  }, []);

  const refreshUnreadCount = useCallback(async () => {
    const response = await authorizedFetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"}/api/chat/cases/${caseId}/messages/unread-count/`);
    const payload: unknown = await response.json().catch(() => ({}));
    if (response.ok && payload && typeof payload === "object" && "unread_count" in payload && typeof payload.unread_count === "number") {
      setUnreadCount(payload.unread_count);
    }
  }, [authorizedFetch, caseId]);

  const loadHistory = useCallback(async (cursor?: string | null) => {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await authorizedFetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"}/api/chat/cases/${caseId}/messages/${suffix}`);
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorDetail(payload, "채팅 기록을 불러오지 못했습니다."));
    const history = payload as History;
    const incoming = Array.isArray(history.results) ? history.results : [];
    setMessages((current) => cursor ? [...incoming.reverse(), ...current] : incoming.reverse());
    setNextCursor(typeof history.next_cursor === "string" ? history.next_cursor : null);
    if (incoming.length) {
      void authorizedFetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"}/api/chat/cases/${caseId}/messages/read/`, {
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
    void authorizedFetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"}/api/chat/cases/${caseId}/recipients/`)
      .then(async (response) => response.ok ? response.json() : [])
      .then((payload: unknown) => setRecipients(Array.isArray(payload) ? payload as Recipient[] : []))
      .catch(() => setRecipients([]));
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

  const send = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 2000 || isPrivate && recipientIds.length === 0) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) { setError("실시간 채팅 서버에 연결되지 않았습니다."); return; }
    socketRef.current.send(JSON.stringify({ type: "chat.message.create", client_message_id: crypto.randomUUID(), body: trimmed, is_private: isPrivate, recipient_ids: isPrivate ? recipientIds : [] }));
    setBody("");
    if (isPrivate) setRecipientIds([]);
  };

  return <div className="fixed bottom-5 right-5 z-40">
    {open && <section className="mb-3 flex h-[430px] w-[340px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div><h2 className="text-sm font-bold text-slate-900">Case 실시간 채팅</h2><p className="mt-0.5 text-[11px] text-slate-400">영상의학과 · 호흡기내과</p></div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${status === "connected" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{status === "connected" ? "연결됨" : status === "connecting" ? "연결 중" : "연결 대기"}</span>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
        {nextCursor && <button type="button" onClick={() => void loadHistory(nextCursor).catch((cause) => setError(cause instanceof Error ? cause.message : "채팅 기록을 불러오지 못했습니다."))} className="w-full text-xs text-blue-600">이전 메시지 불러오기</button>}
        {!messages.length && <p className="py-12 text-center text-xs text-slate-400">아직 대화가 없습니다.</p>}
        {messages.map((message) => <article id={`case-chat-message-${message.id}`} key={message.id} className={`rounded-xl border px-3 py-2 ${message.id === focusMessageId ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200" : message.is_private ? "border-violet-200 bg-violet-50/50" : "border-slate-100 bg-white"}`}><div className="mb-1 flex items-center justify-between gap-2 text-[10px]"><span className="font-semibold text-slate-700">{message.sender.name} · {message.sender.department}{message.is_private && <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700">개인</span>}</span><time className="text-slate-400">{dateLabel(message.created_at)}</time></div><p className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{message.body}</p>{message.read_by && message.read_by.length > 0 && <p className="mt-1 text-[10px] text-emerald-600">읽음 · {message.read_by.map((reader) => reader.name).join(", ")}</p>}</article>)}
      </div>
      {error && <p className="border-t border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{error}</p>}
      <form onSubmit={send} className="border-t border-slate-100 p-3"><div className="mb-2 flex items-center gap-3 text-[11px]"><label className="flex items-center gap-1.5 font-semibold text-slate-700"><input type="checkbox" checked={isPrivate} onChange={(event) => { setIsPrivate(event.target.checked); if (!event.target.checked) setRecipientIds([]); }} /> 개인 메시지</label>{isPrivate && <span className="text-slate-500">선택한 의료진만 본문을 볼 수 있습니다.</span>}</div>{isPrivate && <div className="mb-2 max-h-28 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-1.5" aria-label="개인 메시지 수신자">{recipients.length ? recipients.map((recipient) => { const selected = recipientIds.includes(recipient.id); return <label key={recipient.id} className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs transition ${selected ? "bg-violet-100 text-violet-900" : "text-slate-700 hover:bg-white"}`}><span><input type="checkbox" checked={selected} onChange={() => setRecipientIds((current) => selected ? current.filter((id) => id !== recipient.id) : [...current, recipient.id])} className="mr-2 accent-violet-600" />{recipient.name} · {recipient.department}</span><span className="text-[10px] text-slate-400">{recipient.role}</span></label>; }) : <p className="px-2 py-2 text-xs text-slate-400">선택 가능한 수신자가 없습니다.</p>}</div>}<div className="flex gap-2"><input value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder={isPrivate ? "개인 메시지를 입력하세요" : "공용 메시지를 입력하세요"} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" /><button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300" disabled={!body.trim() || status !== "connected" || isPrivate && recipientIds.length === 0}>전송</button></div></form>
    </section>}
    <button type="button" onClick={() => setOpen((value) => !value)} className="relative rounded-full bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-blue-700">{open ? "채팅 닫기" : "Case 채팅"}{!open && unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full border-2 border-white bg-rose-500 px-1 text-center text-[10px] leading-5 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}</button>
  </div>;
}
