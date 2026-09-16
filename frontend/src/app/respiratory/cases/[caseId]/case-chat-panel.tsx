"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Sender = { id: string; name: string; department: string; role: string };
type ChatMessage = { id: string; case_id: string; sender: Sender; body: string; created_at: string };
type History = { results?: ChatMessage[]; next_cursor?: string | null };

const realtimeBaseUrl = (process.env.NEXT_PUBLIC_REALTIME_WS_URL?.trim() || "ws://127.0.0.1:8001").replace(/\/+$/, "");

function errorDetail(value: unknown, fallback: string) {
  return value && typeof value === "object" && "detail" in value && typeof value.detail === "string" ? value.detail : fallback;
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function CaseChatPanel({ caseId, authorizedFetch }: { caseId: string; authorizedFetch: AuthorizedFetch }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"connecting" | "connected" | "offline">("offline");
  const [error, setError] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const mergeMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
  }, []);

  const loadHistory = useCallback(async (cursor?: string | null) => {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await authorizedFetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"}/api/chat/cases/${caseId}/messages/${suffix}`);
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorDetail(payload, "채팅 기록을 불러오지 못했습니다."));
    const history = payload as History;
    const incoming = Array.isArray(history.results) ? history.results : [];
    setMessages((current) => cursor ? [...incoming.reverse(), ...current] : incoming.reverse());
    setNextCursor(typeof history.next_cursor === "string" ? history.next_cursor : null);
  }, [authorizedFetch, caseId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this is an asynchronous REST failure callback.
    void loadHistory().catch((cause) => !cancelled && setError(cause instanceof Error ? cause.message : "채팅 기록을 불러오지 못했습니다."));
    return () => { cancelled = true; };
  }, [loadHistory, open]);

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
          const payload = JSON.parse(event.data) as { type?: string; message?: ChatMessage; detail?: string };
          if (payload.type === "chat.message.created" && payload.message) mergeMessage(payload.message);
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
    if (!trimmed || trimmed.length > 2000) return;
    if (socketRef.current?.readyState !== WebSocket.OPEN) { setError("실시간 채팅 서버에 연결되지 않았습니다."); return; }
    socketRef.current.send(JSON.stringify({ type: "chat.message.create", client_message_id: crypto.randomUUID(), body: trimmed }));
    setBody("");
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
        {messages.map((message) => <article key={message.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2"><div className="mb-1 flex items-center justify-between gap-2 text-[10px]"><span className="font-semibold text-slate-700">{message.sender.name} · {message.sender.department}</span><time className="text-slate-400">{dateLabel(message.created_at)}</time></div><p className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{message.body}</p></article>)}
      </div>
      {error && <p className="border-t border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{error}</p>}
      <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3"><input value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="메시지를 입력하세요" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" /><button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300" disabled={!body.trim() || status !== "connected"}>전송</button></form>
    </section>}
    <button type="button" onClick={() => setOpen((value) => !value)} className="rounded-full bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-blue-700">{open ? "채팅 닫기" : "Case 채팅"}</button>
  </div>;
}
