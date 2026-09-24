"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthorizedFetch, RegimenCandidate, TreatmentDecision } from "./treatment-prescription-types";
import { DecisionModal, DecisionMethodSelect, DecisionStatus, decisionTriggerClass } from "./decision-ui";
import { TreatmentEvidencePanel } from "./treatment-evidence-panel";
import { TreatmentOpinionPanel } from "./treatment-opinion-panel";

import { showToast } from "@/components/ui/toast/toast";

type Props = { actionable?: boolean; waitingMessage?: string; caseId: string; apiBaseUrl: string; authorizedFetch: AuthorizedFetch; onTreatmentChanged?: (decision: TreatmentDecision, confirmed: boolean) => void; onTreatmentConfirmed?: (decision: TreatmentDecision) => void };
const TYPES = [["CHEMOTHERAPY", "항암화학요법"], ["TARGETED_THERAPY", "표적치료"], ["IMMUNOTHERAPY", "면역치료"], ["COMBINATION", "병합치료"], ["RADIATION", "방사선치료"], ["SURGERY", "수술"], ["SUPPORTIVE_CARE", "완화치료"], ["OBSERVATION", "경과관찰"], ["OTHER", "기타"]] as const;
const REGIMEN_REQUIRED_TYPES = new Set(["CHEMOTHERAPY", "TARGETED_THERAPY", "IMMUNOTHERAPY", "COMBINATION"]);

export function TreatmentDecisionPanel({ actionable = true, waitingMessage, caseId, apiBaseUrl, authorizedFetch, onTreatmentChanged, onTreatmentConfirmed }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [decisionStatus, setDecisionStatus] = useState<string | undefined>();
  const [candidates, setCandidates] = useState<RegimenCandidate[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedRegimenDetail, setSelectedRegimenDetail] = useState<TreatmentDecision["selected_regimen_detail"]>(null);
  const [treatmentType, setTreatmentType] = useState("");
  const [aiAction, setAiAction] = useState("NOT_USED");
  const [plan, setPlan] = useState("");
  const [targetedPlan, setTargetedPlan] = useState("");
  const [rationale, setRationale] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [candidateResponse, decisionResponse] = await Promise.all([
          authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/regimen-candidates/`),
          authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/`),
        ]);
        if (!candidateResponse.ok) throw new Error("치료요법 후보를 불러오지 못했습니다.");
        const nextCandidates = await candidateResponse.json() as RegimenCandidate[];
        const nextDecision = decisionResponse.ok ? await decisionResponse.json() as TreatmentDecision : null;
        if (!active) return;
        setCandidates(nextCandidates);
        setConfirmed(nextDecision?.decision_status === "CONFIRMED");
        setDecisionStatus(nextDecision?.decision_status ?? undefined);
        setSelected(nextDecision?.selected_regimen ?? "");
        setSelectedRegimenDetail(nextDecision?.selected_regimen_detail ?? null);
        const nextTreatmentType = nextDecision?.treatment_type ?? "";
        setTreatmentType(nextTreatmentType);
        if (REGIMEN_REQUIRED_TYPES.has(nextTreatmentType)) setEvidenceOpen(true);
        setAiAction(nextDecision?.ai_recommendation_action ?? "NOT_USED"); setPlan(nextDecision?.treatment_plan ?? "");
        setTargetedPlan(nextDecision?.targeted_therapy_plan ?? ""); setRationale(nextDecision?.rationale ?? "");
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "치료결정 정보를 불러오지 못했습니다."); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [apiBaseUrl, authorizedFetch, caseId]);

  const saveAndConfirm = async () => {
    if (!actionable || confirmed || submittingRef.current || !treatmentType || !plan.trim()) return;
    submittingRef.current = true;
    setBusy(true); setError("");
    const toastId = `case-treatment-confirm-${caseId}`;
    let saved = false;
    showToast.info("치료계획을 저장하고 있습니다.", { id: toastId });
    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_regimen: selected || null, treatment_type: treatmentType, ai_recommendation_action: aiAction, treatment_plan: plan.trim(), targeted_therapy_plan: targetedPlan.trim() || null, rationale: rationale.trim() || null }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "치료결정 처리에 실패했습니다.");
      saved = true;
      const confirmResponse = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/confirm/`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const confirmedPayload = await confirmResponse.json().catch(() => ({}));
      if (!confirmResponse.ok) throw new Error(confirmedPayload.detail || "치료계획 확정에 실패했습니다.");
      const confirmedDecision = confirmedPayload as TreatmentDecision;
      setConfirmed(true);
      setDecisionStatus("CONFIRMED");
      setOpen(false);
      showToast.success("치료계획이 확정되었습니다.", { id: toastId });
      if (onTreatmentConfirmed) onTreatmentConfirmed(confirmedDecision);
      else onTreatmentChanged?.(confirmedDecision, true);
    } catch (caught) {
      console.error(caught);
      const message = saved ? "치료계획은 저장되었지만 확정에 실패했습니다." : "치료계획 저장에 실패했습니다.";
      setError(message);
      showToast.error(message, { id: toastId });
    }
    finally { submittingRef.current = false; setBusy(false); }
  };

  if (loading) return <section className="rounded-lg bg-white p-4 text-sm text-slate-500">치료결정 정보를 불러오는 중입니다.</section>;
  const regimenRequired = REGIMEN_REQUIRED_TYPES.has(treatmentType);
  const canSave = Boolean(treatmentType && plan.trim() && (!regimenRequired || selected));
  return <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)] gap-3" data-treatment-workspace>
    <div className="flex min-h-0 min-w-0 flex-col">
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3">
      <header className="shrink-0"><p className="text-xs font-semibold text-emerald-600">호흡기내과 치료 결정</p><h2 className="mt-1 text-lg font-bold text-slate-800">최종 치료계획</h2><p className="mt-1 text-xs text-slate-500">{confirmed ? "최종 확정" : decisionStatus === "DRAFT" ? "작성 중" : "작성 대기"} · 치료 유형 및 Regimen 검토</p></header>
      <div className="min-h-0 flex-1 overflow-y-auto py-2" aria-label="치료계획 및 Regimen 후보"><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{plan || (actionable ? "등록된 치료계획이 없습니다." : "현재 치료계획을 작성할 수 없습니다.")}</p>
      {(treatmentType || selectedRegimenDetail || targetedPlan || rationale) && <TreatmentDecisionDetails treatmentType={nextLabel(treatmentType, TYPES)} aiAction={aiAction} regimen={selectedRegimenDetail} targetedPlan={targetedPlan} rationale={rationale} />}
      {!confirmed && <section className="mt-3 border-t border-slate-200 pt-3"><h3 className="text-sm font-semibold">Regimen 후보</h3>{candidates.length ? candidates.map(candidate => <div key={candidate.id} className="border-b border-slate-100 py-2 text-xs"><p className="font-semibold text-slate-800">{candidate.regimen_detail.regimen_name}</p><p className="mt-1 text-slate-600">{candidate.match_reasons.join(" · ") || "매칭 근거 없음"}</p><p className="mt-1 text-[10px] text-slate-400">{candidate.evidence_source ?? "근거 출처 정보 없음"}</p></div>) : <p className="py-2 text-xs text-slate-500">현재 조건과 일치하는 치료요법 후보가 없습니다.</p>}</section>}</div><div className="shrink-0 border-t border-slate-200 pt-2"><DecisionStatus error={!open ? error : undefined} message={confirmed ? "치료계획 확정 완료" : undefined} />
      {actionable && !confirmed && <button type="button" onClick={() => setOpen(true)} className={decisionTriggerClass + " mt-2 w-full"}>결과 입력 및 처리</button>}</div>
      {open && <DecisionModal title="치료계획 입력 및 처리" description="확정 임상 결과를 근거로 치료계획을 입력하세요. 저장 후 확정하여 처방 단계로 진행합니다." busy={busy} error={error} primaryLabel="치료계획 확정 및 처방 진행" disabled={!actionable || !canSave || confirmed} onSubmit={() => void saveAndConfirm()} onClose={() => { if (!submittingRef.current) setOpen(false); }}>

      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">치료 유형<select value={treatmentType} disabled={busy} onChange={(event) => { const nextTreatmentType = event.target.value; setTreatmentType(nextTreatmentType); if (REGIMEN_REQUIRED_TYPES.has(nextTreatmentType)) setEvidenceOpen(true); }} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm"><option value="">선택</option>{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold text-slate-700">AI 추천 반영<select value={aiAction} disabled={busy} onChange={(event) => setAiAction(event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm"><option value="NOT_USED">미사용</option><option value="ACCEPTED">수용</option><option value="MODIFIED">수정</option><option value="REJECTED">거부</option></select></label></div>
      <label className="mt-3 block text-xs font-semibold text-slate-700">치료 계획<textarea value={plan} disabled={busy} onChange={(event) => setPlan(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm" /></label>
      {regimenRequired && !selected && <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">선택한 치료 유형은 Regimen을 선택한 후 치료계획을 확정할 수 있습니다.</p>}
      <DecisionMethodSelect value="CONFIRM" onChange={() => undefined} options={[{ value: "CONFIRM", label: "치료계획 확정 및 처방 진행" }]} />
      <details open={evidenceOpen} onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}><summary className="cursor-pointer text-xs text-slate-600">치료요법 후보 및 추가 근거{regimenRequired ? " · Regimen 선택 필수" : ""}</summary>
      <div className="mt-4 space-y-2"><p className="text-xs font-semibold text-slate-700">치료요법 후보</p>{candidates.length === 0 ? <p className="rounded bg-slate-50 p-3 text-xs text-slate-500">현재 조건과 일치하는 치료요법 후보가 없습니다.</p> : candidates.map((candidate) => <button type="button" key={candidate.id} disabled={busy} onClick={() => setSelected(candidate.regimen_detail.id)} className={`block w-full rounded border p-3 text-left ${selected === candidate.regimen_detail.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}><p className="text-sm font-semibold">{candidate.regimen_detail.regimen_name} <span className="font-normal text-slate-500">({candidate.regimen_detail.regimen_code})</span></p><p className="mt-1 text-xs text-slate-500">{candidate.match_reasons.join(" · ") || "매칭 근거 없음"}</p><p className="mt-1 text-[11px] text-slate-400">{candidate.evidence_source ?? "근거 출처 정보 없음"}</p></button>)}</div>
      <label className="mt-3 block text-xs font-semibold text-slate-700">표적치료 계획 <span className="font-normal text-slate-400">(선택)</span><textarea value={targetedPlan} disabled={busy} onChange={(event) => setTargetedPlan(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm" /></label>
      <label className="mt-3 block text-xs font-semibold text-slate-700">결정 근거 <span className="font-normal text-slate-400">(선택)</span><textarea value={rationale} disabled={busy} onChange={(event) => setRationale(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm" /></label>
      </details>

      </DecisionModal>}
    </section>

    </div>
    <aside className="min-h-0 overflow-y-auto space-y-3" aria-label="치료 근거 및 의료진 판단">{!actionable && !confirmed && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{waitingMessage || "선행 결과 확정 후 치료계획 작성 가능"}</p>}<TreatmentEvidencePanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} /><TreatmentOpinionPanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} /></aside>
  </div>;
}

function nextLabel(value: string, options: readonly (readonly [string, string])[]) {
  return (options.find(([key]) => key === value)?.[1] ?? value) || "-";
}

function TreatmentDecisionDetails({ treatmentType, aiAction, regimen, targetedPlan, rationale }: { treatmentType: string; aiAction: string; regimen: TreatmentDecision["selected_regimen_detail"]; targetedPlan: string; rationale: string }) {
  const rows = [["치료 유형", treatmentType], ["AI 추천 반영", aiAction], ["선택 Regimen", regimen ? `${regimen.regimen_name} (${regimen.regimen_code})` : "미선택"], ["표적치료 계획", targetedPlan || "-"], ["결정 근거", rationale || "-"]];
  return <div className="mt-2 text-xs"><dl className="grid grid-cols-2 gap-2">{rows.filter(([label]) => label === "치료 유형" || label === "선택 Regimen").map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 font-medium text-slate-800">{value}</dd></div>)}</dl><details className="mt-2 border-t border-slate-100 pt-2"><summary className="cursor-pointer text-slate-500">AI 반영 · 표적치료 계획 · 결정 근거</summary><dl className="mt-2 space-y-2">{rows.filter(([label]) => label !== "치료 유형" && label !== "선택 Regimen").map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="whitespace-pre-wrap text-slate-700">{value}</dd></div>)}</dl></details></div>;
}
