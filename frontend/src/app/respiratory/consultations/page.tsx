"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useRespiratoryAuth } from "../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../_lib/respiratory-api";
import { requestCaseNavigation } from "../_lib/case-navigation-guard";

type CaseItem = { id: string; case_code: string; patient_name: string };
type Consultation = { id: string; case_id: string; case_code: string; patient_name: string; requested_by?: string; recipient_name?: string | null; question: string; priority: string; status: string; created_at: string; response_note?: string | null; direction: "received" | "sent" };

const STATUS_LABELS: Record<string, string> = { REQUESTED: "응답 대기", ACKNOWLEDGED: "진행", RESPONDED: "완료", CANCELLED: "취소" };

function asList<T>(value: unknown): T[] { if (Array.isArray(value)) return value as T[]; if (value && typeof value === "object" && "results" in value && Array.isArray(value.results)) return value.results as T[]; return []; }

export default function RespiratoryConsultationsPage() {
  const router = useRouter();
  const { authorizedFetch } = useRespiratoryAuth();
  const [items, setItems] = useState<Consultation[]>([]);
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [respondingId, setRespondingId] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const [caseResponse, receivedResponse] = await Promise.all([
        authorizedFetch(`${API_BASE_URL}/api/doctor/cases/`, { signal }),
        authorizedFetch(`${API_BASE_URL}/api/doctor/cases/consultations/me/`, { signal }),
      ]);
      if (!caseResponse.ok || !receivedResponse.ok) throw new Error("협진 목록을 불러오지 못했습니다.");
      const cases = asList<CaseItem>(await caseResponse.json());
      const received = asList<Omit<Consultation, "direction">>(await receivedResponse.json()).map((item) => ({ ...item, direction: "received" as const }));
      const sentGroups = await Promise.all(cases.map(async (caseItem) => {
        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseItem.id}/consultations/`, { signal });
        if (!response.ok) return [];
        return asList<Omit<Consultation, "case_id" | "case_code" | "patient_name" | "direction">>(await response.json()).map((item) => ({ ...item, case_id: caseItem.id, case_code: caseItem.case_code, patient_name: caseItem.patient_name, direction: "sent" as const }));
      }));
      setItems([...received, ...sentGroups.flat()]);
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(loadError instanceof Error ? loadError.message : "협진 목록을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, [authorizedFetch]);

  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void load(controller.signal), 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [load]);

  const visibleItems = useMemo(() => items.filter((item) => item.direction === tab).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [items, tab]);
  const uniqueItems = useMemo(() => [...new Map(items.map((item) => [item.id, item])).values()], [items]);
  const counts = { waiting: uniqueItems.filter((item) => item.status === "REQUESTED").length, progressing: uniqueItems.filter((item) => item.status === "ACKNOWLEDGED").length, completed: uniqueItems.filter((item) => item.status === "RESPONDED").length };

  function openCase(caseId: string) { if (!requestCaseNavigation(caseId)) return; window.localStorage.setItem("respiratory-last-case-id", caseId); router.push(`/respiratory/cases/${caseId}`); }

  async function respond(item: Consultation) {
    if (!responseNote.trim() || submitting) return;
    setSubmitting(true);
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${item.case_id}/consultations/${item.id}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "RESPONDED", response_note: responseNote.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "협진 회신에 실패했습니다.");
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "RESPONDED", response_note: responseNote.trim() } : entry));
      setRespondingId(""); setResponseNote("");
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "협진 회신에 실패했습니다."); }
    finally { setSubmitting(false); }
  }

  return <div className="h-full overflow-auto bg-slate-50 px-5 py-5 xl:px-7"><div className="mx-auto max-w-[1440px]">
    <header className="mb-5"><p className="text-xs font-semibold text-teal-700">호흡기내과</p><h1 className="mt-1 text-xl font-semibold text-slate-900">협진</h1><p className="mt-1 text-sm text-slate-500">Case에 연결된 수신·발신 협진과 회신 상태를 확인합니다.</p></header>
    <section className="grid gap-3 sm:grid-cols-3"><Metric label="응답 대기" value={counts.waiting} /><Metric label="진행" value={counts.progressing} /><Metric label="완료" value={counts.completed} /></section>
    <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div className="flex gap-2">{(["received", "sent"] as const).map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === value ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}>{value === "received" ? "받은 협진" : "보낸 협진"}</button>)}</div><span className="text-xs text-slate-400">{visibleItems.length}건</span></div>
      {loading ? <State text="협진 목록을 불러오는 중입니다." /> : error && !items.length ? <State text={error} error /> : <div className="divide-y divide-slate-100">{error && <p className="bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}{visibleItems.map((item) => <article key={`${item.direction}-${item.id}`} className="grid gap-3 px-4 py-4 lg:grid-cols-[190px_minmax(0,1fr)_160px]">
        <div><p className="text-sm font-semibold text-slate-900">{item.patient_name || "환자"}</p><p className="mt-1 text-xs text-slate-500">{item.case_code}</p><button type="button" onClick={() => openCase(item.case_id)} className="mt-2 text-xs font-semibold text-teal-700 hover:underline">Case 바로가기</button></div>
        <div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.priority === "URGENT" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{item.priority === "URGENT" ? "긴급" : "일반"}</span><span className="text-xs text-slate-500">{tab === "received" ? `요청자 ${item.requested_by || "-"}` : `수신자 ${item.recipient_name || "호흡기내과 전체"}`}</span></div><p className="mt-2 text-sm leading-6 text-slate-700">{item.question}</p>{item.response_note && <p className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">회신: {item.response_note}</p>}{tab === "received" && ["REQUESTED", "ACKNOWLEDGED"].includes(item.status) && (respondingId === item.id ? <div className="mt-3 flex gap-2"><textarea value={responseNote} onChange={(event) => setResponseNote(event.target.value)} className="min-h-20 flex-1 resize-none rounded-lg border border-slate-300 p-2 text-sm" placeholder="회신 내용을 입력하세요." /><button type="button" disabled={submitting || !responseNote.trim()} onClick={() => void respond(item)} className="self-end rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">회신</button></div> : <button type="button" onClick={() => { setRespondingId(item.id); setResponseNote(""); }} className="mt-3 rounded-lg border border-teal-200 px-3 py-2 text-xs font-semibold text-teal-700">회신 작성</button>)}</div>
        <div className="lg:text-right"><span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{STATUS_LABELS[item.status] || item.status}</span><p className="mt-2 text-xs text-slate-400">{new Date(item.created_at).toLocaleString("ko-KR")}</p></div>
      </article>)}{!visibleItems.length && <State text="표시할 협진이 없습니다." />}</div>}
    </section>
  </div></div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}<span className="ml-1 text-sm font-medium text-slate-400">건</span></p></div>; }
function State({ text, error = false }: { text: string; error?: boolean }) { return <p className={`px-5 py-10 text-center text-sm ${error ? "text-rose-700" : "text-slate-400"}`}>{text}</p>; }
