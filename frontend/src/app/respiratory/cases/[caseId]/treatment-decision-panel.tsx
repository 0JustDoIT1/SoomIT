"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthorizedFetch, RegimenCandidate, TreatmentDecision } from "./treatment-prescription-types";
import { DecisionModal, DecisionMethodSelect, DecisionStatus, decisionTriggerClass } from "./decision-ui";
import { TreatmentEvidencePanel } from "./treatment-evidence-panel";
import { TreatmentOpinionPanel } from "./treatment-opinion-panel";
import { showToast } from "@/components/ui/toast/toast";
import { LoadingIndicator } from "@/components/common/loading-indicator";

type Props = { actionable?: boolean; waitingMessage?: string; noCandidateMessage?: string; caseId: string; apiBaseUrl: string; authorizedFetch: AuthorizedFetch; onTreatmentChanged?: (decision: TreatmentDecision, confirmed: boolean) => void; onTreatmentConfirmed?: (decision: TreatmentDecision) => void; onOpenPrescription?: () => void };
type ModalStep = 1 | 2;
type Draft = { selected: string; detail: TreatmentDecision["selected_regimen_detail"]; type: string; action: string; plan: string; targetedPlan: string; rationale: string; evidenceOpen: boolean };
const TYPES = [["CHEMOTHERAPY", "항암화학요법"], ["TARGETED_THERAPY", "표적치료"], ["IMMUNOTHERAPY", "면역치료"], ["COMBINATION", "병합치료"], ["RADIATION", "방사선치료"], ["SURGERY", "수술"], ["SUPPORTIVE_CARE", "완화치료"], ["OBSERVATION", "경과관찰"], ["OTHER", "기타"]] as const;
const DRUG_TYPES = new Set(["CHEMOTHERAPY", "TARGETED_THERAPY", "IMMUNOTHERAPY", "COMBINATION"]);

export function TreatmentDecisionPanel({ actionable = true, waitingMessage, noCandidateMessage, caseId, apiBaseUrl, authorizedFetch, onTreatmentChanged, onTreatmentConfirmed, onOpenPrescription }: Props) {
  const [open, setOpen] = useState(false); const [step, setStep] = useState<ModalStep>(1);
  const [confirmed, setConfirmed] = useState(false); const [decisionStatus, setDecisionStatus] = useState<string>();
  const [requiresPrescription, setRequiresPrescription] = useState(false);
  const [candidates, setCandidates] = useState<RegimenCandidate[]>([]); const [selected, setSelected] = useState("");
  const [candidateError, setCandidateError] = useState(""); const [candidateLoading, setCandidateLoading] = useState(false);
  const [detail, setDetail] = useState<TreatmentDecision["selected_regimen_detail"]>(null); const [type, setType] = useState("");
  const [action, setAction] = useState("NOT_USED"); const [plan, setPlan] = useState(""); const [targetedPlan, setTargetedPlan] = useState(""); const [rationale, setRationale] = useState(""); const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const submitting = useRef(false); const saved = useRef<Draft>({ selected: "", detail: null, type: "", action: "NOT_USED", plan: "", targetedPlan: "", rationale: "", evidenceOpen: false });
  const apply = (draft: Draft) => { setSelected(draft.selected); setDetail(draft.detail); setType(draft.type); setAction(draft.action); setPlan(draft.plan); setTargetedPlan(draft.targetedPlan); setRationale(draft.rationale); setEvidenceOpen(draft.evidenceOpen); };

  useEffect(() => { let active = true; void (async () => {
    try {
      const [candidateRequest, decisionRequest] = await Promise.allSettled([authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/regimen-candidates/`), authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/`)]);
      const candidateResponse = candidateRequest.status === "fulfilled" ? candidateRequest.value : null;
      const candidateBody: unknown = candidateResponse?.ok ? await candidateResponse.json().catch(() => null) : null;
      const nextCandidates = Array.isArray(candidateBody) ? candidateBody as RegimenCandidate[] : null;
      if (!active) return;
      setCandidates(nextCandidates ?? []); setCandidateError(nextCandidates === null ? "Regimen 후보를 불러오지 못했습니다." : "");
      if (decisionRequest.status === "rejected") throw decisionRequest.reason;
      const decisionResponse = decisionRequest.value;
      if (!decisionResponse.ok && decisionResponse.status !== 404) throw new Error("치료결정 정보를 불러오지 못했습니다.");
      const decision = decisionResponse.ok ? await decisionResponse.json() as TreatmentDecision : null;
      if (!active) return;
      setConfirmed(decision?.decision_status === "CONFIRMED"); setDecisionStatus(decision?.decision_status ?? undefined);
      const nextType = decision?.treatment_type ?? "";
      setRequiresPrescription(decision?.requires_prescription ?? DRUG_TYPES.has(nextType));
      const draft = { selected: decision?.selected_regimen ?? "", detail: decision?.selected_regimen_detail ?? null, type: nextType, action: decision?.ai_recommendation_action ?? "NOT_USED", plan: decision?.treatment_plan ?? "", targetedPlan: decision?.targeted_therapy_plan ?? "", rationale: decision?.rationale ?? "", evidenceOpen: false };
      saved.current = draft; apply(draft);
    } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "치료결정 정보를 불러오지 못했습니다."); }
    finally { if (active) setLoading(false); }
  })(); return () => { active = false; }; }, [apiBaseUrl, authorizedFetch, caseId]);

  const regimenRequired = DRUG_TYPES.has(type); const nonDrug = Boolean(type) && !regimenRequired;
  const hasSelectedCandidate = !candidateError && !candidateLoading && candidates.some((candidate) => candidate.regimen_detail.id === selected);
  const planLocked = regimenRequired && !hasSelectedCandidate;
  const canSave = Boolean(type && plan.trim() && !planLocked); const canProceed = Boolean(canSave && (!regimenRequired || selected)); const readOnly = confirmed || !actionable;
  const payload = () => ({ selected_regimen: regimenRequired ? selected || null : null, treatment_type: type, ai_recommendation_action: action, treatment_plan: plan.trim(), targeted_therapy_plan: targetedPlan.trim() || null, rationale: rationale.trim() || null });
  const saveRequest = async (notify: boolean) => {
    const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
    const result = await response.json().catch(() => ({})) as TreatmentDecision & { detail?: string };
    if (!response.ok) throw new Error(result.detail || "치료계획 저장에 실패했습니다.");
    setDecisionStatus(result.decision_status ?? "DRAFT"); const nextType = result.treatment_type ?? type; setRequiresPrescription(result.requires_prescription ?? DRUG_TYPES.has(nextType));
    const draft = { selected: result.selected_regimen ?? "", detail: result.selected_regimen_detail ?? null, type: nextType, action: result.ai_recommendation_action ?? "NOT_USED", plan: result.treatment_plan ?? "", targetedPlan: result.targeted_therapy_plan ?? "", rationale: result.rationale ?? "", evidenceOpen };
    saved.current = draft; apply(draft); if (notify) onTreatmentChanged?.(result, false); return result;
  };
  const refreshCandidates = async () => {
    setCandidateLoading(true);
    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/regimen-candidates/`);
      const body: unknown = response.ok ? await response.json() : null;
      if (!Array.isArray(body)) throw new Error("Regimen 후보를 불러오지 못했습니다.");
      setCandidates(body as RegimenCandidate[]); setCandidateError("");
    } catch { setCandidates([]); setCandidateError("Regimen 후보를 불러오지 못했습니다."); }
    finally { setCandidateLoading(false); }
  };
  const saveOnly = async () => { if (!actionable || confirmed || submitting.current || !canSave) return; submitting.current = true; setBusy(true); setError(""); try { await saveRequest(true); await refreshCandidates(); setMessage("치료계획 DRAFT가 저장되었습니다."); } catch (caught) { setError(caught instanceof Error ? caught.message : "치료계획 저장에 실패했습니다."); } finally { submitting.current = false; setBusy(false); } };
  const saveAndContinue = async () => { if (!actionable || confirmed || submitting.current || !canProceed) return; submitting.current = true; setBusy(true); setError(""); try { await saveRequest(true); await refreshCandidates(); setStep(2); setMessage("치료계획을 저장했습니다. 치료 소견을 검토하세요."); } catch (caught) { setError(caught instanceof Error ? caught.message : "치료계획 저장에 실패했습니다."); } finally { submitting.current = false; setBusy(false); } };
  const confirm = async () => { if (!actionable || confirmed || submitting.current || !canProceed) return; submitting.current = true; setBusy(true); setError(""); let savedDecision: TreatmentDecision | null = null; try { savedDecision = await saveRequest(false); const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/confirm/`, { method: "POST", headers: { "Content-Type": "application/json" } }); const result = await response.json().catch(() => ({})) as TreatmentDecision & { detail?: string }; if (!response.ok) throw new Error(result.detail || "치료계획 확정에 실패했습니다."); setConfirmed(true); setDecisionStatus("CONFIRMED"); setRequiresPrescription(result.requires_prescription ?? regimenRequired); setOpen(false); showToast.success("치료계획을 확정했습니다.", { id: `case-treatment-confirm-${caseId}` }); if (onTreatmentConfirmed) onTreatmentConfirmed(result); else onTreatmentChanged?.(result, true); } catch (caught) { if (savedDecision) onTreatmentChanged?.(savedDecision, false); setError(caught instanceof Error ? caught.message : "치료계획 확정에 실패했습니다."); } finally { submitting.current = false; setBusy(false); } };
  const close = () => { if (submitting.current) return; apply(saved.current); setError(""); setMessage(""); setStep(1); setOpen(false); };
  if (loading) return <LoadingIndicator label="치료결정 정보를 불러오는 중입니다." />;
  const openDecision = () => { setError(""); setMessage(""); setEvidenceOpen(false); setStep(readOnly ? 2 : 1); setOpen(true); };
  const decisionButtonLabel = confirmed ? "확정된 치료계획 보기" : decisionStatus === "DRAFT" ? "치료계획 계속 작성 →" : "치료계획 검토하기 →";

  return <div className="flex h-full min-h-0 min-w-0 flex-col gap-3" data-treatment-workspace>
    <WorkflowProgress actionable={actionable} hasDecision={Boolean(decisionStatus)} hasRegimen={Boolean(selected) || nonDrug} confirmed={confirmed} requiresPrescription={requiresPrescription} />
    <div className="grid min-h-0 flex-1 min-w-0 grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)] gap-3">
      <section className="flex min-h-0 min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div><p className="text-xs font-semibold text-emerald-600">호흡기내과 치료 결정</p><h2 className="mt-1 text-lg font-bold text-slate-900">{confirmed ? "확정된 치료계획" : "치료계획"}</h2></div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${confirmed ? "bg-emerald-100 text-emerald-700" : decisionStatus === "DRAFT" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{confirmed ? "최종 확정" : decisionStatus === "DRAFT" ? "작성 중" : "작성 대기"}</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto py-4">
          <TreatmentPlanOverview treatmentType={type} regimen={detail} plan={plan} targetedPlan={targetedPlan} rationale={rationale} aiAction={action} />
        </div>
        <footer className="shrink-0 border-t border-slate-200 pt-3">
          <DecisionStatus error={!open ? error || (!confirmed ? candidateError : undefined) : undefined} message={confirmed ? "치료계획 확정 완료" : undefined} />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            {(actionable || decisionStatus) && <button type="button" onClick={openDecision} className={confirmed ? "rounded-lg border border-blue-200 bg-white px-4 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50" : decisionTriggerClass}>{decisionButtonLabel}</button>}
            {confirmed && requiresPrescription && onOpenPrescription && <button type="button" onClick={onOpenPrescription} className={decisionTriggerClass}>처방 작성으로 이동 →</button>}
          </div>
        </footer>

        {open && <DecisionModal title={readOnly ? "치료 결정 조회" : step === 1 ? "치료요법 선택 및 계획" : "치료 소견 및 최종 확정"} busy={busy} error={error || (step === 2 && !nonDrug ? candidateError : undefined)} message={message} primaryLabel={readOnly ? undefined : step === 1 ? "저장하고 다음 단계" : "치료계획 확정"} disabled={readOnly || !canProceed} onSubmit={readOnly ? undefined : () => void (step === 1 ? saveAndContinue() : confirm())} secondaryLabel={readOnly ? undefined : step === 1 ? "임시 저장" : "이전"} secondaryDisabled={step === 1 ? !canSave : false} onSecondary={readOnly ? undefined : () => { if (step === 1) void saveOnly(); else { setError(""); setMessage(""); setStep(1); } }} onClose={close} wide>
          {!readOnly && <Progress step={step} />}
          {readOnly ? <><Summary regimen={detail} treatmentType={type} plan={plan} rationale={rationale} /><TreatmentOpinionPanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} readOnly selectedRegimenId={selected} treatmentType={type} treatmentPlan={plan} /></> : step === 1 ? <StepOne type={type} action={action} plan={plan} targetedPlan={targetedPlan} rationale={rationale} candidates={candidates} selected={selected} regimenRequired={regimenRequired} nonDrug={nonDrug} evidenceOpen={evidenceOpen} busy={busy} noCandidateMessage={noCandidateMessage} candidateError={candidateError} candidateLoading={candidateLoading} planLocked={planLocked} hasSavedDecision={Boolean(decisionStatus)} onType={(next) => { setType(next); setEvidenceOpen(false); if (!DRUG_TYPES.has(next)) { setSelected(""); setDetail(null); } }} onAction={setAction} onPlan={setPlan} onTargetedPlan={setTargetedPlan} onRationale={setRationale} onEvidence={setEvidenceOpen} onSelect={(candidate) => { setSelected(candidate.regimen_detail.id); setDetail(candidate.regimen_detail); }} /> : <><Summary regimen={detail} treatmentType={type} plan={plan} rationale={rationale} /><TreatmentOpinionPanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} selectedRegimenId={selected} treatmentType={type} treatmentPlan={plan} /></>}
        </DecisionModal>}
      </section>
      <aside className="min-h-0 space-y-3 overflow-y-auto" aria-label="치료 근거">
        {!actionable && !confirmed && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{waitingMessage || "선행 결과 확정 후 치료계획을 작성할 수 있습니다."}</p>}
        <TreatmentEvidencePanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} candidates={candidates} selectedRegimen={detail} />
      </aside>
    </div>
  </div>;
}

function WorkflowProgress({ actionable, hasDecision, hasRegimen, confirmed, requiresPrescription }: { actionable: boolean; hasDecision: boolean; hasRegimen: boolean; confirmed: boolean; requiresPrescription: boolean }) {
  const current = !actionable && !hasDecision ? 0 : !hasRegimen ? 1 : !confirmed ? 2 : 3;
  const steps = [
    { label: "치료 근거 확인", complete: actionable || hasDecision },
    { label: "Regimen 선택", complete: hasRegimen || confirmed },
    { label: "치료계획 확정", complete: confirmed },
    { label: requiresPrescription ? "처방" : "후속 진료", complete: false },
  ];
  return <ol aria-label="치료계획·처방 진행 상태" className="flex shrink-0 items-center overflow-x-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
    {steps.map((item, index) => <li key={item.label} aria-current={index === current ? "step" : undefined} className="flex min-w-max items-center"><span className={`rounded-full px-2.5 py-1 font-semibold ${item.complete ? "bg-emerald-50 text-emerald-700" : index === current ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200" : "text-slate-400"}`}>{item.complete ? "✓ " : ""}{item.label}</span>{index < steps.length - 1 && <span aria-hidden="true" className="mx-1.5 text-slate-300">→</span>}</li>)}
  </ol>;
}

function TreatmentPlanOverview({ treatmentType, regimen, plan, targetedPlan, rationale, aiAction }: { treatmentType: string; regimen: TreatmentDecision["selected_regimen_detail"]; plan: string; targetedPlan: string; rationale: string; aiAction: string }) {
  return <dl className="space-y-4 text-sm">
    <div className="grid gap-1 sm:grid-cols-[120px_1fr]"><dt className="text-xs font-semibold text-slate-500">치료 유형</dt><dd className="font-semibold text-slate-800">{label(treatmentType)}</dd></div>
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3"><dt className="text-xs font-semibold text-blue-600">선택 Regimen</dt><dd className="mt-1 text-base font-bold text-slate-900">{regimen ? `${regimen.regimen_name} (${regimen.regimen_code})` : "아직 선택되지 않았습니다."}</dd></div>
    <PlanRow label="치료계획 요약" value={plan} />
    {targetedPlan && <PlanRow label="표적치료 계획" value={targetedPlan} />}
    <PlanRow label="결정 근거" value={rationale} />
    <PlanRow label="AI 추천 반영" value={aiActionLabel(aiAction)} />
  </dl>;
}

function PlanRow({ label: rowLabel, value }: { label: string; value: string }) {
  return <div className="grid gap-1 sm:grid-cols-[120px_1fr]"><dt className="text-xs font-semibold text-slate-500">{rowLabel}</dt><dd className="whitespace-pre-wrap leading-6 text-slate-700">{value || "-"}</dd></div>;
}

function Progress({ step }: { step: ModalStep }) { return <ol className="mb-3 grid grid-cols-2 gap-2 text-xs" aria-label="치료 결정 진행 단계">{[[1, "치료요법 선택 및 계획"], [2, "치료 소견 및 확정"]].map(([value, text]) => <li key={value} className={`rounded border px-3 py-2 ${step === value ? "border-blue-600 bg-blue-50 font-semibold text-blue-800" : "border-slate-200 text-slate-500"}`}>{value}. {text}</li>)}</ol>; }
function StepOne({ type, action, plan, targetedPlan, rationale, candidates, selected, regimenRequired, nonDrug, evidenceOpen, busy, noCandidateMessage, candidateError, candidateLoading, planLocked, hasSavedDecision, onType, onAction, onPlan, onTargetedPlan, onRationale, onEvidence, onSelect }: { type: string; action: string; plan: string; targetedPlan: string; rationale: string; candidates: RegimenCandidate[]; selected: string; regimenRequired: boolean; nonDrug: boolean; evidenceOpen: boolean; busy: boolean; noCandidateMessage?: string; candidateError: string; candidateLoading: boolean; planLocked: boolean; hasSavedDecision: boolean; onType: (value: string) => void; onAction: (value: string) => void; onPlan: (value: string) => void; onTargetedPlan: (value: string) => void; onRationale: (value: string) => void; onEvidence: (value: boolean) => void; onSelect: (candidate: RegimenCandidate) => void }) {
  const selectedCandidate = !candidateError && !candidateLoading ? candidates.find((candidate) => candidate.regimen_detail.id === selected) : undefined;
  const canOpenExtras = Boolean(selectedCandidate || nonDrug || hasSavedDecision);
  const hasExtraContent = Boolean(targetedPlan.trim() || rationale.trim() || action !== "NOT_USED");
  const ruleCodes = [...new Set(candidates.map((candidate) => candidate.rule_code))];
  const matchReasons = [...new Set(candidates.flatMap((candidate) => candidate.match_reasons))];
  return <section aria-label="치료요법 선택 및 계획">
    <label className="block text-xs font-semibold text-slate-700">치료 유형<select value={type} disabled={busy} onChange={(event) => onType(event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm"><option value="">선택</option>{TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    {!nonDrug && !candidateError && !candidateLoading && (ruleCodes.length > 0 || matchReasons.length > 0) && <p className="mt-3 text-xs leading-5 text-slate-500"><span className="font-semibold">치료 결정 근거</span> · {ruleCodes.join(", ")}{matchReasons.length > 0 ? ` · ${matchReasons.join(" · ")}` : ""}</p>}
    <div className="mt-3 space-y-2" role="group" aria-label="Regimen 후보">
      <h3 className="text-xs font-semibold text-slate-700">Regimen 후보{regimenRequired ? " · 선택 필수" : ""}</h3>
      {nonDrug ? <p className="rounded bg-slate-50 p-3 text-xs text-slate-500">선택한 비약물 치료는 Regimen과 약물 처방이 필요하지 않습니다.</p> : candidateLoading ? <LoadingIndicator label="Regimen 후보를 불러오는 중입니다." /> : candidateError ? <div role="alert" className="rounded bg-rose-50 p-3 text-xs text-rose-700"><p>{candidateError}</p><p className="mt-1">화면을 새로고침하여 다시 조회해주세요.</p></div> : candidates.length === 0 ? <div className="rounded bg-slate-50 p-3 text-xs text-slate-500"><p className="font-semibold">현재 선택 가능한 Regimen 후보가 없습니다.</p><p className="mt-1">{noCandidateMessage || "현재 조건과 일치하는 치료요법 후보가 없습니다."}</p><p className="mt-1">{noCandidateMessage?.includes("변이") ? "조직/유전자 최종 검토에서 상세 변이를 확인해주세요." : "치료 결정 근거에서 필요한 임상 결과와 치료 조건을 확인해주세요."}</p></div> : candidates.map((candidate) => <button type="button" key={candidate.id} disabled={busy} aria-pressed={selected === candidate.regimen_detail.id} onClick={() => onSelect(candidate)} className={`block w-full rounded border p-3 text-left ${selected === candidate.regimen_detail.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}><p className="text-sm font-semibold">{candidate.regimen_detail.regimen_name} <span className="font-normal text-slate-500">({candidate.regimen_detail.regimen_code})</span></p><p className="mt-1 text-xs text-slate-500">{candidate.match_reasons.join(" · ") || "매칭 근거 없음"}</p><p className="mt-1 text-xs text-slate-500">적용 Rule: {candidate.rule_code}{candidate.evidence_source ? ` · ${candidate.evidence_source}` : ""}</p></button>)}
    </div>
    {!nonDrug && !candidateError && !candidateLoading && candidates.length > 0 && <p role="status" className={`mt-3 rounded border px-3 py-2 text-xs ${selectedCandidate ? "border-emerald-500 bg-emerald-50 font-semibold text-slate-800" : "border-slate-200 text-slate-500"}`}>{selectedCandidate ? `선택된 Regimen: ${selectedCandidate.regimen_detail.regimen_code} ${selectedCandidate.regimen_detail.regimen_name}` : "Regimen을 선택해주세요"}</p>}
    {planLocked && <p id="treatment-plan-help" className="mt-3 text-xs text-slate-500">Regimen을 선택하면 치료계획을 작성할 수 있습니다.</p>}
    <label className="mt-3 block text-xs font-semibold text-slate-700">치료 계획<textarea value={plan} disabled={busy || planLocked} aria-describedby={planLocked ? "treatment-plan-help" : undefined} onChange={(event) => onPlan(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm disabled:bg-slate-100 disabled:text-slate-400" /></label>
    <details open={canOpenExtras && evidenceOpen} onToggle={(event) => {
      if (!canOpenExtras && event.currentTarget.open) event.currentTarget.open = false;
      onEvidence(canOpenExtras && event.currentTarget.open);
    }} className="mt-3">
      <summary aria-disabled={!canOpenExtras || busy} onClick={(event) => { if (!canOpenExtras || busy) event.preventDefault(); }} className="cursor-pointer text-xs text-slate-600 aria-disabled:cursor-not-allowed aria-disabled:text-slate-400">추가 계획 및 결정 근거 (선택){hasExtraContent ? " · 작성됨" : ""}</summary>
      <fieldset disabled={busy || planLocked} className="space-y-3">
        <label className="mt-3 block text-xs font-semibold text-slate-700">표적치료 계획 <span className="font-normal text-slate-400">(선택)</span><textarea value={targetedPlan} onChange={(event) => onTargetedPlan(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm disabled:bg-slate-100 disabled:text-slate-400" /></label>
        <label className="mt-3 block text-xs font-semibold text-slate-700">결정 근거 <span className="font-normal text-slate-400">(선택)</span><textarea value={rationale} onChange={(event) => onRationale(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm disabled:bg-slate-100 disabled:text-slate-400" /></label>
        <label className="mt-3 block text-xs font-semibold text-slate-700">AI 추천 반영<select value={action} onChange={(event) => onAction(event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm"><option value="NOT_USED">미사용</option><option value="ACCEPTED">수용</option><option value="MODIFIED">수정</option><option value="REJECTED">거부</option></select></label>
        <DecisionMethodSelect value="CONFIRM" onChange={() => undefined} options={[{ value: "CONFIRM", label: nonDrug ? "치료계획 확정 및 후속 진료" : "치료계획 확정 및 처방 진행" }]} />
      </fieldset>
    </details>
    {planLocked && <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Regimen을 선택해야 다음 단계로 진행할 수 있습니다.</p>}
  </section>;
}
function Summary({ regimen, treatmentType, plan, rationale }: { regimen: TreatmentDecision["selected_regimen_detail"]; treatmentType: string; plan: string; rationale: string }) { return <section className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs" aria-label="치료계획 요약"><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-slate-500">선택 Regimen</dt><dd className="mt-1 font-semibold text-slate-800">{regimen ? `${regimen.regimen_name} (${regimen.regimen_code})` : "비약물 치료 또는 미선택"}</dd></div><div><dt className="text-slate-500">치료 유형</dt><dd className="mt-1 font-semibold text-slate-800">{label(treatmentType)}</dd></div><div><dt className="text-slate-500">치료 계획</dt><dd className="mt-1 whitespace-pre-wrap text-slate-700">{plan || "-"}</dd></div><div><dt className="text-slate-500">결정 근거</dt><dd className="mt-1 whitespace-pre-wrap text-slate-700">{rationale || "-"}</dd></div></dl></section>; }
function label(value: string) { return TYPES.find(([key]) => key === value)?.[1] ?? (value || "-"); }
function aiActionLabel(value: string) { return ({ NOT_USED: "미사용", ACCEPTED: "수용", MODIFIED: "수정", REJECTED: "거부" } as Record<string, string>)[value] ?? (value || "-"); }
