"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthorizedFetch, RegimenCandidate, TreatmentDecision } from "./treatment-prescription-types";
import { TreatmentEvidencePanel } from "./treatment-evidence-panel";
import { TreatmentOpinionPanel } from "./treatment-opinion-panel";

type Props = { caseId: string; apiBaseUrl: string; authorizedFetch: AuthorizedFetch; onTreatmentChanged?: (decision: TreatmentDecision) => void };
const TYPES = [["CHEMOTHERAPY", "항암화학요법"], ["TARGETED_THERAPY", "표적치료"], ["IMMUNOTHERAPY", "면역치료"], ["COMBINATION", "병합치료"], ["RADIATION", "방사선치료"], ["SURGERY", "수술"], ["SUPPORTIVE_CARE", "완화치료"], ["OBSERVATION", "경과관찰"], ["OTHER", "기타"]] as const;

export function TreatmentDecisionPanel({ caseId, apiBaseUrl, authorizedFetch, onTreatmentChanged }: Props) {
  const [candidates, setCandidates] = useState<RegimenCandidate[]>([]);
  const [decision, setDecision] = useState<TreatmentDecision | null>(null);
  const [selected, setSelected] = useState("");
  const [treatmentType, setTreatmentType] = useState("");
  const [aiAction, setAiAction] = useState("NOT_USED");
  const [plan, setPlan] = useState("");
  const [targetedPlan, setTargetedPlan] = useState("");
  const [rationale, setRationale] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const [candidateResponse, decisionResponse] = await Promise.all([
        authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/regimen-candidates/`),
        authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/`),
      ]);
      if (!candidateResponse.ok) throw new Error("치료요법 후보를 불러오지 못했습니다.");
      const nextCandidates = await candidateResponse.json() as RegimenCandidate[];
      const nextDecision = decisionResponse.ok ? await decisionResponse.json() as TreatmentDecision : null;
      setCandidates(nextCandidates); setDecision(nextDecision);
      setSelected(nextDecision?.selected_regimen ?? ""); setTreatmentType(nextDecision?.treatment_type ?? "");
      setAiAction(nextDecision?.ai_recommendation_action ?? "NOT_USED"); setPlan(nextDecision?.treatment_plan ?? "");
      setTargetedPlan(nextDecision?.targeted_therapy_plan ?? ""); setRationale(nextDecision?.rationale ?? "");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "치료결정 정보를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [apiBaseUrl, authorizedFetch, caseId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const save = async (confirm = false) => {
    setBusy(true); setError("");
    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/${confirm ? "confirm/" : ""}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: confirm ? undefined : JSON.stringify({ selected_regimen: selected || null, treatment_type: treatmentType, ai_recommendation_action: aiAction, treatment_plan: plan.trim(), targeted_therapy_plan: targetedPlan.trim() || null, rationale: rationale.trim() || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "치료결정 처리에 실패했습니다.");
      setDecision(payload as TreatmentDecision); onTreatmentChanged?.(payload as TreatmentDecision);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "치료결정 처리에 실패했습니다."); }
    finally { setBusy(false); }
  };

  if (loading) return <section className="rounded-lg bg-white p-4 text-sm text-slate-500">치료결정 정보를 불러오는 중입니다.</section>;
  const canSave = Boolean(treatmentType && plan.trim());
  return <div className="space-y-4">
    <section className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
      <header><p className="text-xs font-semibold text-emerald-600">호흡기내과 치료 결정</p><h2 className="mt-1 text-lg font-bold text-slate-800">최종 치료계획</h2><p className="mt-1 text-xs text-slate-500">확정 임상 결과와 치료요법 후보를 검토한 뒤 담당의가 저장·확정합니다.</p></header>
      {error && <p role="alert" className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <div className="mt-4 space-y-2"><p className="text-xs font-semibold text-slate-700">치료요법 후보</p>{candidates.length === 0 ? <p className="rounded bg-slate-50 p-3 text-xs text-slate-500">현재 조건과 일치하는 치료요법 후보가 없습니다.</p> : candidates.map((candidate) => <button type="button" key={candidate.id} disabled={busy} onClick={() => setSelected(candidate.regimen_detail.id)} className={`block w-full rounded border p-3 text-left ${selected === candidate.regimen_detail.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}><p className="text-sm font-semibold">{candidate.regimen_detail.regimen_name} <span className="font-normal text-slate-500">({candidate.regimen_detail.regimen_code})</span></p><p className="mt-1 text-xs text-slate-500">{candidate.match_reasons.join(" · ") || "매칭 근거 없음"}</p><p className="mt-1 text-[11px] text-slate-400">{candidate.evidence_source ?? "근거 출처 정보 없음"}</p></button>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">치료 유형<select value={treatmentType} disabled={busy} onChange={(event) => setTreatmentType(event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm"><option value="">선택</option>{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold text-slate-700">AI 추천 반영<select value={aiAction} disabled={busy} onChange={(event) => setAiAction(event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm"><option value="NOT_USED">미사용</option><option value="ACCEPTED">수용</option><option value="MODIFIED">수정</option><option value="REJECTED">거부</option></select></label></div>
      <label className="mt-3 block text-xs font-semibold text-slate-700">치료 계획<textarea value={plan} disabled={busy} onChange={(event) => setPlan(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm" /></label>
      <label className="mt-3 block text-xs font-semibold text-slate-700">표적치료 계획 <span className="font-normal text-slate-400">(선택)</span><textarea value={targetedPlan} disabled={busy} onChange={(event) => setTargetedPlan(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm" /></label>
      <label className="mt-3 block text-xs font-semibold text-slate-700">결정 근거 <span className="font-normal text-slate-400">(선택)</span><textarea value={rationale} disabled={busy} onChange={(event) => setRationale(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm" /></label>
      <div className="mt-4 flex justify-end gap-2"><button type="button" disabled={!canSave || busy} onClick={() => void save()} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">{busy ? "처리 중..." : "임시 저장"}</button><button type="button" disabled={!decision || busy} onClick={() => void save(true)} className="rounded bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">{busy ? "처리 중..." : "최종 확정"}</button></div>
    </section>
    <TreatmentEvidencePanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} />
    <TreatmentOpinionPanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} />
  </div>;
}
