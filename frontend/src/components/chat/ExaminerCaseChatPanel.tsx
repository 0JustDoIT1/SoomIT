"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Message = { id: string; body: string; sender: { id: string; name: string; department: string; role: string }; is_private?: boolean; created_at: string };
type History = { results?: Message[]; next_cursor?: string | null };
type Recipient = { id: string; name: string; department: string; role: string };

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const REALTIME_BASE_URL = (process.env.NEXT_PUBLIC_REALTIME_WS_URL?.trim() || "ws://127.0.0.1:8001").replace(/\/+$/, "");

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function errorDetail(value: unknown, fallback: string) {
  return value && typeof value === "object" && "detail" in value && typeof value.detail === "string" ? value.detail : fallback;
}

export function ExaminerCaseChatPanel({ caseId, authorizedFetch }: { caseId?: string | null; authorizedFetch: AuthorizedFetch }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [body, setBody] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<"offline" | "connecting" | "connected">("offline");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const merge = useCallback((incoming: Message[]) => {
    setMessages((current) => Array.from(new Map([...current, ...incoming].map((message) => [message.id, message])).values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
  }, []);

  const refreshUnread = useCallback(async () => {
    if (!caseId) return;
    const response = await authorizedFetch(`${API_BASE_URL}/api/chat/cases/${caseId}/messages/unread-count/`);
    const payload = await response.json().catch(() => ({}));
    if (response.ok && typeof payload.unread_count === "number") setUnreadCount(payload.unread_count);
  }, [authorizedFetch, caseId]);

  const loadHistory = useCallback(async (cursor?: string | null) => {
    if (!caseId) return;
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await authorizedFetch(`${API_BASE_URL}/api/chat/cases/${caseId}/messages/${suffix}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorDetail(payload, "채팅 기록을 불러오지 못했습니다."));
    const history = payload as History;
    const incoming = Array.isArray(history.results) ? history.results : [];
    merge(incoming);
    setNextCursor(typeof history.next_cursor === "string" ? history.next_cursor : null);
    if (incoming.length) {
      await authorizedFetch(`${API_BASE_URL}/api/chat/cases/${caseId}/messages/read/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message_ids: incoming.map((message) => message.id) }) });
      await refreshUnread();
    }
  }, [authorizedFetch, caseId, merge, refreshUnread]);

  useEffect(() => {
    if (!open || !caseId) return;
    let cancelled = false;
    void Promise.resolve().then(() => Promise.all([loadHistory(), authorizedFetch(`${API_BASE_URL}/api/chat/cases/${caseId}/recipients/`).then(async (response) => response.ok ? response.json() : [])])).then(([, list]) => { if (!cancelled) setRecipients(Array.isArray(list) ? list : []); }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "채팅을 불러오지 못했습니다."); });
    return () => { cancelled = true; };
  }, [authorizedFetch, caseId, loadHistory, open]);

  useEffect(() => {
    if (!caseId) return;
    void Promise.resolve().then(() => refreshUnread()).catch(() => undefined);
    const timer = window.setInterval(() => void refreshUnread().catch(() => undefined), 30000);
    return () => window.clearInterval(timer);
  }, [caseId, refreshUnread]);

  useEffect(() => {
    if (!open || !caseId) return;
    disposedRef.current = false;
    const connect = () => {
      if (disposedRef.current) return;
      setStatus("connecting");
      const token = window.sessionStorage.getItem("accessToken");
      if (!token) return;
      const socket = new WebSocket(`${REALTIME_BASE_URL}/ws/chat/${encodeURIComponent(caseId)}`, ["soomit-chat", token]);
      socketRef.current = socket;
      socket.onopen = () => { if (socketRef.current === socket) { setStatus("connected"); setError(""); } };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { type?: string; message?: Message; read?: { message_id: string } };
          if (payload.type === "chat.message.created" && payload.message) {
            merge([payload.message]);
            socket.send(JSON.stringify({ type: "chat.message.read", message_id: payload.message.id }));
            void refreshUnread();
          }
          if (payload.type === "chat.error") setError("메시지를 전송하지 못했습니다.");
        } catch { setError("채팅 이벤트를 해석하지 못했습니다."); }
      };
      socket.onclose = () => { if (!disposedRef.current) { setStatus("offline"); reconnectRef.current = window.setTimeout(connect, 1500); } };
    };
    connect();
    return () => { disposedRef.current = true; if (reconnectRef.current) window.clearTimeout(reconnectRef.current); socketRef.current?.close(); socketRef.current = null; setMessages([]); setStatus("offline"); };
  }, [caseId, merge, open, refreshUnread]);

  useEffect(() => { if (open && timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight; }, [messages, open]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    setSending(true);
    socketRef.current.send(JSON.stringify({ type: "chat.message.create", client_message_id: crypto.randomUUID(), body: trimmed, is_private: Boolean(recipientId), recipient_ids: recipientId ? [recipientId] : [] }));
    setBody("");
    setRecipientId("");
    window.setTimeout(() => setSending(false), 1000);
  }

  return <div className="fixed bottom-5 right-5 z-50" data-chat-no-drag="true">
    {open ? <section className="flex h-[min(620px,calc(100vh-40px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-2xl" aria-label="Case 채팅">
      <header className="flex items-center justify-between bg-gradient-to-r from-blue-700 to-blue-500 px-4 py-3 text-white"><div><p className="text-sm font-bold">Case 채팅</p><p className="mt-0.5 text-[11px] text-blue-100">{status === "connected" ? "실시간 연결됨" : status === "connecting" ? "연결 중" : "연결 대기"}</p></div><button type="button" onClick={() => setOpen(false)} className="px-2 text-xl leading-none" aria-label="채팅 닫기">×</button></header>
      <div ref={timelineRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">{nextCursor ? <button type="button" onClick={() => void loadHistory(nextCursor)} className="mx-auto block text-xs font-medium text-slate-500 underline underline-offset-2">이전 메시지 불러오기</button> : null}{messages.length ? messages.map((message) => <article key={message.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-baseline justify-between gap-2"><span className="text-xs font-semibold text-blue-800">{message.sender.name}</span><span className="text-[10px] text-slate-400">{timeLabel(message.created_at)}</span></div><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{message.body}</p></article>) : <p className="py-8 text-center text-xs text-slate-400">아직 메시지가 없습니다.</p>}</div>
      <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-3">{error && <p className="mb-2 text-xs text-rose-600" role="alert">{error}</p>}<div className="mb-2 flex gap-2"><select value={recipientId} onChange={(event) => setRecipientId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600"><option value="">Case 전체</option>{recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} · {recipient.role}</option>)}</select></div><div className="flex gap-2"><textarea value={body} onChange={(event) => setBody(event.target.value)} className="min-h-10 min-w-0 flex-1 resize-none rounded-lg border border-slate-200 p-2 text-xs outline-none focus:border-blue-400" placeholder="메시지를 입력하세요." maxLength={2000} /><button type="submit" disabled={!body.trim() || sending || status !== "connected"} className="self-end rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">전송</button></div></form>
    </section> : <button type="button" onClick={() => { if (caseId) setOpen(true); }} disabled={!caseId} title={!caseId ? "환자를 선택하면 채팅을 사용할 수 있습니다." : undefined} className={`relative rounded-full px-5 py-3 text-sm font-bold text-white shadow-lg transition ${caseId ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-blue-600 opacity-50"}`} aria-label="Case 채팅 열기">Case 채팅{caseId && unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-500 px-1.5 text-center text-[10px] leading-5 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}</button>}
  </div>;
}
