"use client";

import { useEffect, useRef, useState } from "react";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Source = { document: string; chunk_index: number; distance: number; excerpt?: string; source_uri?: string | null };

function safeHttpUri(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch { return null; }
}

export function KnowledgeRagPanel({ apiBaseUrl, authorizedFetch }: { apiBaseUrl: string; authorizedFetch: AuthorizedFetch }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const hasSlowResponse = loading && elapsedSeconds >= 8;

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    const controller = new AbortController(); controllerRef.current = controller;
    setLoading(true); setElapsedSeconds(0); setError(""); setAnswer(""); setSources([]);
    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/knowledge/ask/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmed, top_k: 5 }), signal: controller.signal });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : "지식 근거를 불러오지 못했습니다.");
      if (!body || typeof body !== "object" || !("answer" in body) || typeof body.answer !== "string") throw new Error("RAG 응답 형식이 올바르지 않습니다.");
      setAnswer(body.answer);
      const rawSources = "sources" in body ? body.sources : [];
      setSources(Array.isArray(rawSources) ? rawSources.filter((source): source is Source => Boolean(source) && typeof source === "object" && "document" in source && typeof source.document === "string" && "chunk_index" in source && typeof source.chunk_index === "number" && "distance" in source && typeof source.distance === "number") : []);
    } catch (cause) { setError(controller.signal.aborted ? "질의를 취소했습니다." : cause instanceof Error ? cause.message : "지식 근거 질의 중 오류가 발생했습니다."); }
    finally { controllerRef.current = null; setLoading(false); }
  };

  return <section className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-[10px] font-semibold text-blue-600">MedGemma · RAG</p><h2 className="mt-1 text-sm font-bold text-slate-900">지식 근거 질의</h2>
    <p className="mt-0.5 text-[11px] leading-4 text-slate-600">지식 문서 검색 결과를 근거로 답변합니다. 의료진 판단을 대체하지 않습니다.</p>
    <div className="mt-2 flex items-center gap-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void ask(); }} maxLength={1000} placeholder="예: EGFR 변이 치료 근거를 요약해줘" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs" /><button type="button" disabled={!question.trim() || loading} onClick={() => void ask()} className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300">{loading ? `질의 중 ${elapsedSeconds}초` : "질의"}</button>{loading && <button type="button" onClick={() => controllerRef.current?.abort()} className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600">취소</button>}</div>
    {hasSlowResponse && <p role="status" className="mt-2 text-[11px] text-amber-700">근거 검색과 답변 생성에 시간이 더 필요합니다. 기다리거나 취소할 수 있습니다.</p>}
    {error && <div role="alert" className="mt-3 flex items-center justify-between gap-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700"><span>{error}</span><button type="button" onClick={() => void ask()} disabled={loading} className="shrink-0 rounded border border-rose-200 bg-white px-2 py-1 font-semibold text-rose-700 disabled:text-slate-400">다시 시도</button></div>}
    {answer && <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/40 p-3"><p className="whitespace-pre-wrap text-xs leading-5 text-slate-700">{answer}</p>{sources.length > 0 && <ul aria-label="답변 근거 문서" className="mt-3 border-t border-blue-100 pt-2 text-[10px] text-slate-500">{sources.map((source, sourceOrder) => <li key={`${source.document}-${source.chunk_index}`} className="py-1"><details><summary className="cursor-pointer">[{sourceOrder + 1}] {source.document} <span className="text-slate-400">(문서 조각 {source.chunk_index + 1})</span></summary>{source.excerpt && <p className="mt-1 whitespace-pre-wrap rounded bg-white px-2 py-1 text-slate-600">{source.excerpt}</p>}{safeHttpUri(source.source_uri) && <a href={safeHttpUri(source.source_uri) ?? undefined} target="_blank" rel="noreferrer" className="mt-1 inline-block text-blue-700 underline">원본 출처 열기</a>}</details></li>)}</ul>}</div>}
  </section>;
}
