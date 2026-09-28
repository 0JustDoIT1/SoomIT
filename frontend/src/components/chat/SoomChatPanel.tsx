"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Participant = { id: string; name: string; department: string; role: string; unread_count: number };
type Message = {
  id: string;
  body: string;
  sender: { id: string; name: string; department: string; role: string };
  recipient_id: string;
  created_at: string;
};

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const WS = (process.env.NEXT_PUBLIC_REALTIME_WS_URL?.trim() || "ws://127.0.0.1:8001").replace(/\/+$/, "");

function roleLabel(role: string) {
  return ({ DOCTOR: "의사", TECHNOLOGIST: "검사자", MEDICAL_STAFF: "진료지원" } as Record<string, string>)[role] ?? role;
}

function departmentLabel(department: string) {
  return ({ PULMONOLOGY: "호흡기내과", RADIOLOGY: "영상의학과", PATHOLOGY: "병리과", ADMINISTRATION: "진료지원" } as Record<string, string>)[department] ?? department;
}

export function SoomChatPanel({ authorizedFetch }: { authorizedFetch: AuthorizedFetch }) {
  const [open, setOpen] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [next, setNext] = useState<string | null>(null);
  const [status, setStatus] = useState<"offline" | "connecting" | "connected">("offline");
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const timeline = useRef<HTMLDivElement | null>(null);
  const reconnect = useRef<number | null>(null);
  const disposed = useRef(false);
  const selectedIdRef = useRef(selectedId);

  const unread = participants.reduce((total, participant) => total + participant.unread_count, 0);
  const selected = participants.find((participant) => participant.id === selectedId);

  const merge = useCallback((incoming: Message[]) => {
    setMessages((current) => Array.from(
      new Map([...current, ...incoming].map((message) => [message.id, message])).values(),
    ).sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()));
  }, []);

  const loadParticipants = useCallback(async () => {
    const response = await authorizedFetch(`${API}/api/chat/global/participants/`);
    const payload = await response.json().catch(() => []);
    if (!response.ok) throw new Error(payload.detail || "대화 상대를 불러오지 못했습니다.");
    const nextParticipants = Array.isArray(payload) ? payload as Participant[] : [];
    setParticipants(nextParticipants);
    setSelectedId((current) => current && nextParticipants.some((item) => item.id === current)
      ? current
      : nextParticipants.find((item) => item.unread_count > 0)?.id ?? nextParticipants[0]?.id ?? "");
  }, [authorizedFetch]);

  const markRead = useCallback(async (items: Message[], participantId: string) => {
    const incomingIds = items.filter((message) => message.sender.id === participantId).map((message) => message.id);
    if (!incomingIds.length) return;
    await authorizedFetch(`${API}/api/chat/global/messages/read/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_ids: incomingIds.slice(0, 50) }),
    });
  }, [authorizedFetch]);

  const loadMessages = useCallback(async (participantId: string, cursor?: string | null, replace = false) => {
    const query = new URLSearchParams({ participant_id: participantId });
    if (cursor) query.set("cursor", cursor);
    const response = await authorizedFetch(`${API}/api/chat/global/messages/?${query}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "메시지를 불러오지 못했습니다.");
    const incoming = Array.isArray(payload.results) ? payload.results as Message[] : [];
    if (replace) setMessages([]);
    merge(incoming);
    setNext(typeof payload.next_cursor === "string" ? payload.next_cursor : null);
    await markRead(incoming, participantId);
    await loadParticipants();
  }, [authorizedFetch, loadParticipants, markRead, merge]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadParticipants()).catch(() => undefined);
    const timer = window.setInterval(() => void loadParticipants().catch(() => undefined), 30000);
    return () => window.clearInterval(timer);
  }, [loadParticipants]);

  useEffect(() => {
    if (!open || !selectedId) return;
    void Promise.resolve().then(() => {
      setMessages([]);
      setNext(null);
      setError("");
      return loadMessages(selectedId, null, true);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "메시지를 불러오지 못했습니다."));
  }, [loadMessages, open, selectedId]);

  useEffect(() => {
    if (!open) return;
    disposed.current = false;
    const connect = () => {
      const token = window.sessionStorage.getItem("accessToken");
      if (!token || disposed.current) return;
      setStatus("connecting");
      const connection = new WebSocket(`${WS}/ws/chat/global`, ["soomit-chat", token]);
      socket.current = connection;
      connection.onopen = () => { setStatus("connected"); setError(""); };
      connection.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; message?: Message; detail?: string };
          if (payload.type === "chat.message.created" && payload.message) {
            const message = payload.message;
            const activeParticipant = selectedIdRef.current;
            const belongsToOpenConversation = message.sender.id === activeParticipant || message.recipient_id === activeParticipant;
            if (belongsToOpenConversation) {
              merge([message]);
              if (message.sender.id === activeParticipant) {
                connection.send(JSON.stringify({ type: "chat.message.read", message_id: message.id }));
              }
            }
            void loadParticipants().catch(() => undefined);
          }
          if (payload.type === "chat.error") setError(payload.detail || "메시지를 처리하지 못했습니다.");
        } catch {
          setError("채팅 이벤트를 해석하지 못했습니다.");
        }
      };
      connection.onclose = () => {
        if (!disposed.current) {
          setStatus("offline");
          reconnect.current = window.setTimeout(connect, 1500);
        }
      };
    };
    connect();
    return () => {
      disposed.current = true;
      if (reconnect.current) window.clearTimeout(reconnect.current);
      socket.current?.close();
      socket.current = null;
      setStatus("offline");
    };
  }, [loadParticipants, merge, open]);

  useEffect(() => {
    if (open && timeline.current) timeline.current.scrollTop = timeline.current.scrollHeight;
  }, [messages, open]);

  function send(event: FormEvent) {
    event.preventDefault();
    const value = body.trim();
    if (!value || !selectedId || !socket.current || socket.current.readyState !== WebSocket.OPEN) return;
    socket.current.send(JSON.stringify({
      type: "chat.message.create",
      client_message_id: crypto.randomUUID(),
      recipient_id: selectedId,
      body: value,
    }));
    setBody("");
  }

  return (
    <div className="fixed bottom-8 right-8 z-50" data-chat-no-drag="true">
      {open ? (
        <section className="flex h-[min(620px,calc(100vh-40px))] w-[min(620px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl" aria-label="숨챗">
          <header className="flex h-14 shrink-0 items-center justify-between bg-gradient-to-r from-blue-700 to-blue-500 px-4 text-white">
            <div>
              <p className="text-sm font-bold">숨챗</p>
              <p className="text-[11px] text-blue-100">1:1 의료진 채팅 · {status === "connected" ? "실시간 연결됨" : status === "connecting" ? "연결 중" : "연결 대기"}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="숨챗 닫기" className="rounded-lg px-2 py-1 text-xl hover:bg-white/10">×</button>
          </header>

          <div className="flex min-h-0 flex-1">
            <aside className="w-44 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50/80 sm:w-52" aria-label="대화 상대 목록">
              <div className="border-b border-slate-200 px-3 py-2.5"><p className="text-xs font-bold text-slate-800">대화</p><p className="mt-0.5 text-[10px] text-slate-400">상대를 선택하세요</p></div>
              {participants.length ? participants.map((participant) => (
                <button key={participant.id} type="button" onClick={() => setSelectedId(participant.id)} className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-3 text-left transition ${selectedId === participant.id ? "bg-blue-50" : "hover:bg-white"}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selectedId === participant.id ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>{participant.name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-800">{participant.name}</span><span className="block truncate text-[10px] text-slate-400">{departmentLabel(participant.department)} · {roleLabel(participant.role)}</span></span>
                  {participant.unread_count > 0 && <span className="min-w-5 rounded-full bg-rose-500 px-1.5 text-center text-[10px] font-bold leading-5 text-white">{participant.unread_count > 99 ? "99+" : participant.unread_count}</span>}
                </button>
              )) : <p className="p-4 text-center text-xs text-slate-400">대화 가능한 의료진이 없습니다.</p>}
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              {selected ? (
                <>
                  <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 px-3"><span className="text-sm font-bold text-slate-800">{selected.name}</span><span className="text-[10px] text-slate-400">{departmentLabel(selected.department)} · {roleLabel(selected.role)}</span></div>
                  <div ref={timeline} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3">
                    {next && <button type="button" onClick={() => void loadMessages(selected.id, next)} className="mx-auto block rounded-full bg-white px-3 py-1.5 text-[11px] text-slate-500 shadow-sm hover:text-blue-600">이전 메시지 불러오기</button>}
                    {!messages.length && <div className="flex h-full items-center justify-center"><p className="text-center text-xs leading-5 text-slate-400">아직 대화가 없습니다.<br />첫 메시지를 보내보세요.</p></div>}
                    {messages.map((message) => {
                      const incoming = message.sender.id === selected.id;
                      return <article key={message.id} className={`flex ${incoming ? "justify-start" : "justify-end"}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 shadow-sm ${incoming ? "rounded-tl-md border border-slate-200 bg-white text-slate-700" : "rounded-tr-md bg-blue-600 text-white"}`}><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p><p className={`mt-1 text-right text-[9px] ${incoming ? "text-slate-400" : "text-blue-100"}`}>{new Date(message.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</p></div></article>;
                    })}
                  </div>
                  <form onSubmit={send} className="shrink-0 border-t border-slate-200 bg-white p-3">
                    {error && <p role="alert" className="mb-2 text-xs text-rose-600">{error}</p>}
                    <div className="flex gap-2"><textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-10 min-w-0 flex-1 resize-none rounded-xl border border-slate-200 p-2.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder={`${selected.name}님에게 메시지 보내기`} maxLength={2000} /><button type="submit" disabled={!body.trim() || status !== "connected"} className="self-end rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white disabled:bg-slate-300">전송</button></div>
                  </form>
                </>
              ) : <div className="flex flex-1 items-center justify-center"><p className="text-sm text-slate-400">왼쪽에서 대화 상대를 선택하세요.</p></div>}
            </div>
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label="숨챗 열기" className="relative rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          <Image src="/images/AIchat숨이.png" alt="" width={92} height={92} className="h-[5.75rem] w-[5.75rem] object-contain drop-shadow-[0_5px_10px_rgba(76,65,150,0.32)]" />
          <span className="absolute bottom-16 left-10 whitespace-nowrap rounded-full border border-violet-300 bg-white px-3 py-2 text-sm font-bold leading-none text-violet-600 shadow-sm">숨챗</span>
          {unread > 0 && <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-rose-500 px-1.5 text-center text-[10px] leading-5 text-white">{unread > 99 ? "99+" : unread}</span>}
        </button>
      )}
    </div>
  );
}
