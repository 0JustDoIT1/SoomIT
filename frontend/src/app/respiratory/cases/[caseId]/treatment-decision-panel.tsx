"use client";

import { useEffect, useRef, useState } from "react";
import type { AuthorizedFetch, RegimenCandidate, TreatmentDecision } from "./treatment-prescription-types";
import { DecisionModal, DecisionMethodSelect, DecisionStatus, decisionTriggerClass } from "./decision-ui";
import { TreatmentEvidencePanel } from "./treatment-evidence-panel";
import { TreatmentOpinionPanel } from "./treatment-opinion-panel";

import { showToast } from "@/components/ui/toast/toast";

type Props = { actionable?: boolean; waitingMessage?: string; caseId: string; apiBaseUrl: string; authorizedFetch: AuthorizedFetch; onTreatmentChanged?: (decision: TreatmentDecision, confirmed: boolean) => void; onTreatmentConfirmed?: (decision: TreatmentDecision) => void };
type TreatmentDraftState = { selected: string; selectedRegimenDetail: TreatmentDecision["selected_regimen_detail"]; treatmentType: string; treatmentLine: string; aiAction: string; plan: string; targetedPlan: string; rationale: string; evidenceOpen: boolean };
const TYPES = [["CHEMOTHERAPY", "항암화학요법"], ["TARGETED_THERAPY", "표적치료"], ["IMMUNOTHERAPY", "면역치료"], ["COMBINATION", "병합치료"], ["RADIATION", "방사선치료"], ["SURGERY", "수술"], ["SUPPORTIVE_CARE", "완화치료"], ["OBSERVATION", "경과관찰"], ["OTHER", "기타"]] as const;
const REGIMEN_REQUIRED_TYPES = new Set(["CHEMOTHERAPY", "TARGETED_THERAPY", "IMMUNOTHERAPY", "COMBINATION"]);
const TREATMENT_LINES = [["1L", "1차 치료"], ["2L", "2차 치료"], ["3L_PLUS", "3차 이상"]] as const;

export function TreatmentDecisionPanel({ actionable = true, waitingMessage, caseId, apiBaseUrl, authorizedFetch, onTreatmentChanged, onTreatmentConfirmed }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [decisionStatus, setDecisionStatus] = useState<string | undefined>();
  const [candidates, setCandidates] = useState<RegimenCandidate[]>([]);
  const [selected, setSelected] = useState("");
  const [selectedRegimenDetail, setSelectedRegimenDetail] = useState<TreatmentDecision["selected_regimen_detail"]>(null);
  const [treatmentType, setTreatmentType] = useState("");
  const [treatmentLine, setTreatmentLine] = useState("");
  const [aiAction, setAiAction] = useState("NOT_USED");
  const [plan, setPlan] = useState("");
  const [targetedPlan, setTargetedPlan] = useState("");
  const [rationale, setRationale] = useState("");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const submittingRef = useRef(false);
  const savedDraftRef = useRef<TreatmentDraftState>({ selected: "", selectedRegimenDetail: null, treatmentType: "", treatmentLine: "", aiAction: "NOT_USED", plan: "", targetedPlan: "", rationale: "", evidenceOpen: false });

  const applyDraft = (draft: TreatmentDraftState) => {
    setSelected(draft.selected);
    setSelectedRegimenDetail(draft.selectedRegimenDetail);
    setTreatmentType(draft.treatmentType);
    setTreatmentLine(draft.treatmentLine);
    setAiAction(draft.aiAction);
    setPlan(draft.plan);
    setTargetedPlan(draft.targetedPlan);
    setRationale(draft.rationale);
    setEvidenceOpen(draft.evidenceOpen);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [candidateRequest, decisionRequest] = await Promise.allSettled([
          authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/regimen-candidates/`),
          authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/`),
        ]);
        if (decisionRequest.status === "rejected") throw decisionRequest.reason;
        const decisionResponse = decisionRequest.value;
        if (!decisionResponse.ok && decisionResponse.status !== 404) throw new Error("치료결정 정보를 불러오지 못했습니다.");
        const nextDecision = decisionResponse.ok ? await decisionResponse.json() as TreatmentDecision : null;
        const candidateResponse = candidateRequest.status === "fulfilled" ? candidateRequest.value : null;
        const nextCandidates = candidateResponse?.ok ? await candidateResponse.json() as RegimenCandidate[] : [];
        const candidateLoadFailed = !candidateResponse?.ok;
        if (!active) return;
        setCandidates(nextCandidates);
        setConfirmed(nextDecision?.decision_status === "CONFIRMED");
        setDecisionStatus(nextDecision?.decision_status ?? undefined);
        const nextTreatmentType = nextDecision?.treatment_type ?? "";
        const nextDraft = {
          selected: nextDecision?.selected_regimen ?? "",
          selectedRegimenDetail: nextDecision?.selected_regimen_detail ?? null,
          treatmentType: nextTreatmentType,
          treatmentLine: nextDecision?.treatment_line ?? "",
          aiAction: nextDecision?.ai_recommendation_action ?? "NOT_USED",
          plan: nextDecision?.treatment_plan ?? "",
          targetedPlan: nextDecision?.targeted_therapy_plan ?? "",
          rationale: nextDecision?.rationale ?? "",
          evidenceOpen: REGIMEN_REQUIRED_TYPES.has(nextTreatmentType),
        };
        savedDraftRef.current = nextDraft;
        applyDraft(nextDraft);
        if (candidateLoadFailed && nextDecision?.decision_status !== "CONFIRMED") {
          setError("치료요법 후보를 불러오지 못했습니다.");
        }
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "치료결정 정보를 불러오지 못했습니다."); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [apiBaseUrl, authorizedFetch, caseId]);

  const treatmentPayload = () => ({
    selected_regimen: regimenRequired ? selected || null : null,
    treatment_type: treatmentType,
    treatment_line: treatmentLine || null,
    ai_recommendation_action: aiAction,
    treatment_plan: plan.trim(),
    targeted_therapy_plan: targetedPlan.trim() || null,
    rationale: rationale.trim() || null,
  });

  const saveDraftRequest = async (notifyChange: boolean) => {
    const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(treatmentPayload()),
    });
    const payload = await response.json().catch(() => ({})) as TreatmentDecision & { detail?: string };
    if (!response.ok) throw new Error(payload.detail || "치료계획 저장에 실패했습니다.");
    setDecisionStatus(payload.decision_status ?? "DRAFT");
    const nextTreatmentType = payload.treatment_type ?? treatmentType;
    const savedDraft = {
      selected: payload.selected_regimen ?? "",
      selectedRegimenDetail: payload.selected_regimen_detail ?? null,
      treatmentType: nextTreatmentType,
      treatmentLine: payload.treatment_line ?? treatmentLine,
      aiAction: payload.ai_recommendation_action ?? "NOT_USED",
      plan: payload.treatment_plan ?? "",
      targetedPlan: payload.targeted_therapy_plan ?? "",
      rationale: payload.rationale ?? "",
      evidenceOpen: evidenceOpen || REGIMEN_REQUIRED_TYPES.has(nextTreatmentType),
    };
    savedDraftRef.current = savedDraft;
    applyDraft(savedDraft);
    if (notifyChange) onTreatmentChanged?.(payload, false);
    return payload;
  };

  const saveDraft = async () => {
    if (!actionable || confirmed || submittingRef.current || !canSaveDraft) return;
    submittingRef.current = true;
    setBusy(true); setError(""); setMessage("");
    const toastId = `case-treatment-draft-${caseId}`;
    showToast.info("치료계획 DRAFT를 저장하고 있습니다.", { id: toastId });
    try {
      await saveDraftRequest(true);
      const candidateResponse = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/regimen-candidates/`);
      if (candidateResponse.ok) setCandidates(await candidateResponse.json() as RegimenCandidate[]);
      setMessage("치료계획 DRAFT가 저장되었습니다.");
      showToast.success("치료계획 DRAFT가 저장되었습니다.", { id: toastId });
    } catch (caught) {
      console.error(caught);
      const detail = caught instanceof Error ? caught.message : "치료계획 저장에 실패했습니다.";
      setError(detail);
      showToast.error(detail, { id: toastId });
    } finally {
      submittingRef.current = false; setBusy(false);
    }
  };

  const saveAndConfirm = async () => {
    if (!actionable || confirmed || submittingRef.current || !canConfirm) return;
    submittingRef.current = true;
    setBusy(true); setError(""); setMessage("");
    const toastId = `case-treatment-confirm-${caseId}`;
    let saved = false;
    let savedDecision: TreatmentDecision | null = null;
    showToast.info("치료계획을 저장하고 있습니다.", { id: toastId });
    try {
      savedDecision = await saveDraftRequest(false);
      saved = true;
      const confirmResponse = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/treatment-decision/confirm/`, { method: "POST", headers: { "Content-Type": "application/json" } });
      const confirmedPayload = await confirmResponse.json().catch(() => ({})) as TreatmentDecision & { detail?: string };
      if (!confirmResponse.ok) throw new Error(confirmedPayload.detail || "치료계획 확정에 실패했습니다.");
      const confirmedDecision = confirmedPayload;
      setConfirmed(true);
      setDecisionStatus("CONFIRMED");
      setOpen(false);
      showToast.success("치료계획이 확정되었습니다.", { id: toastId });
      if (onTreatmentConfirmed) onTreatmentConfirmed(confirmedDecision);
      else onTreatmentChanged?.(confirmedDecision, true);
    } catch (caught) {
      console.error(caught);
      if (savedDecision) onTreatmentChanged?.(savedDecision, false);
      const prefix = saved ? "치료계획은 저장되었지만 확정에 실패했습니다." : "치료계획 저장에 실패했습니다.";
      const detail = caught instanceof Error ? caught.message : "";
      const errorMessage = detail && !prefix.includes(detail) ? `${prefix} ${detail}` : prefix;
      setError(errorMessage);
      showToast.error(errorMessage, { id: toastId });
    }
    finally { submittingRef.current = false; setBusy(false); }
  };

  if (loading) return <section className="rounded-lg bg-white p-4 text-sm text-slate-500">치료결정 정보를 불러오는 중입니다.</section>;
  const regimenRequired = REGIMEN_REQUIRED_TYPES.has(treatmentType);
  const explicitNonDrugTreatment = Boolean(treatmentType) && !regimenRequired;
  const canSaveDraft = Boolean(treatmentType && plan.trim());
  const canConfirm = Boolean(canSaveDraft && (!regimenRequired || selected));
  const readOnly = confirmed || !actionable;
  const closeModal = () => {
    if (submittingRef.current) return;
    applyDraft(savedDraftRef.current);
    setError("");
    setMessage("");
    setOpen(false);
  };
  return <div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)] gap-3" data-treatment-workspace>
    <div className="flex min-h-0 min-w-0 flex-col">
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3">
      <header className="shrink-0"><p className="text-xs font-semibold text-emerald-600">호흡기내과 치료 결정</p><h2 className="mt-1 text-lg font-bold text-slate-800">최종 치료계획</h2><p className="mt-1 text-xs text-slate-500">{confirmed ? "최종 확정" : decisionStatus === "DRAFT" ? "작성 중" : "작성 대기"} · 치료 유형 및 Regimen 검토</p></header>
      <div className="min-h-0 flex-1 overflow-y-auto py-2" aria-label="치료계획 및 Regimen 후보"><p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{plan || (actionable ? "등록된 치료계획이 없습니다." : "현재 치료계획을 작성할 수 없습니다.")}</p>
      {(treatmentType || treatmentLine || selectedRegimenDetail || targetedPlan || rationale) && <TreatmentDecisionDetails treatmentType={nextLabel(treatmentType, TYPES)} treatmentLine={nextLabel(treatmentLine, TREATMENT_LINES)} aiAction={aiAction} regimen={selectedRegimenDetail} targetedPlan={targetedPlan} rationale={rationale} />}
      {!confirmed && <section className="mt-3 border-t border-slate-200 pt-3"><h3 className="text-sm font-semibold">Regimen 후보</h3>{candidates.length ? candidates.map(candidate => <div key={candidate.id} className="border-b border-slate-100 py-2 text-xs"><p className="font-semibold text-slate-800">{candidate.regimen_detail.regimen_name}</p><p className="mt-1 text-slate-600">{candidate.match_reasons.join(" · ") || "매칭 근거 없음"}</p><p className="mt-1 text-[10px] text-slate-400">{candidate.evidence_source ?? "근거 출처 정보 없음"}</p></div>) : <p className="py-2 text-xs text-slate-500">현재 조건과 일치하는 치료요법 후보가 없습니다.</p>}</section>}</div><div className="shrink-0 border-t border-slate-200 pt-2"><DecisionStatus error={!open ? error : undefined} message={confirmed ? "치료계획 확정 완료" : undefined} />
      {(actionable || decisionStatus) && <button type="button" onClick={() => { setError(""); setMessage(""); setOpen(true); }} className={decisionTriggerClass + " mt-2 w-full"}>{readOnly ? "치료 결정 보기" : "치료 결정"}</button>}</div>
      {open && <DecisionModal title={readOnly ? "치료 결정 조회" : "치료 결정"} description={readOnly ? "확정된 치료 소견과 치료계획을 읽기 전용으로 확인합니다." : "AI 참고 소견과 의료진 소견을 함께 검토한 뒤 치료계획을 저장하거나 최종 확정할 수 있습니다. 저장만 하면 현재 치료결정 단계가 유지됩니다."} busy={busy} error={error} message={message} primaryLabel={readOnly ? undefined : "치료계획 확정 및 처방 진행"} disabled={!actionable || !canConfirm || confirmed} onSubmit={readOnly ? undefined : () => void saveAndConfirm()} secondaryLabel={readOnly ? undefined : "저장"} secondaryDisabled={!canSaveDraft || confirmed} onSecondary={readOnly ? undefined : () => void saveDraft()} onClose={closeModal} wide>

      <TreatmentOpinionPanel
        caseId={caseId}
        apiBaseUrl={apiBaseUrl}
        authorizedFetch={authorizedFetch}
        readOnly={readOnly}
        selectedRegimenId={selected}
        treatmentType={treatmentType}
        treatmentPlan={plan}
      />

      <section className="border-t border-slate-200 pt-3" aria-label="치료계획 입력">

      <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-slate-700">치료 유형<select value={treatmentType} disabled={busy || readOnly} onChange={(event) => { const nextTreatmentType = event.target.value; setTreatmentType(nextTreatmentType); if (REGIMEN_REQUIRED_TYPES.has(nextTreatmentType)) setEvidenceOpen(true); else { setSelected(""); setSelectedRegimenDetail(null); } }} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm"><option value="">선택</option>{TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold text-slate-700">치료 차수<select value={treatmentLine} disabled={busy || readOnly} onChange={(event) => { setTreatmentLine(event.target.value); setSelected(""); setSelectedRegimenDetail(null); }} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm"><option value="">미지정</option>{TREATMENT_LINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold text-slate-700">AI 추천 반영<select value={aiAction} disabled={busy || readOnly} onChange={(event) => setAiAction(event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm"><option value="NOT_USED">미사용</option><option value="ACCEPTED">수용</option><option value="MODIFIED">수정</option><option value="REJECTED">거부</option></select></label></div>
      <label className="mt-3 block text-xs font-semibold text-slate-700">치료 계획<textarea value={plan} disabled={busy || readOnly} onChange={(event) => setPlan(event.target.value)} rows={3} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm" /></label>
      {!readOnly && regimenRequired && !selected && <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">선택한 치료 유형은 Regimen을 선택한 후 치료계획을 확정할 수 있습니다.</p>}
      {!readOnly && <DecisionMethodSelect value="CONFIRM" onChange={() => undefined} options={[{ value: "CONFIRM", label: "치료계획 확정 및 처방 진행" }]} />}
      <details open={evidenceOpen} onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}><summary className="cursor-pointer text-xs text-slate-600">{readOnly ? "확정 치료요법 및 추가 근거" : "치료요법 후보 및 추가 근거"}{!readOnly && regimenRequired ? " · Regimen 선택 필수" : ""}</summary>
      {readOnly ? <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-700">확정 Regimen</p><p className="mt-1 text-sm font-semibold text-slate-800">{selectedRegimenDetail ? `${selectedRegimenDetail.regimen_name} (${selectedRegimenDetail.regimen_code})` : explicitNonDrugTreatment ? "비약물 치료" : "확정된 Regimen 정보가 없습니다."}</p></div> : <div className="mt-4 space-y-2"><p className="text-xs font-semibold text-slate-700">치료요법 후보</p>{explicitNonDrugTreatment ? <p className="rounded bg-slate-50 p-3 text-xs text-slate-500">선택한 비약물 치료는 Regimen과 약물 처방이 필요하지 않습니다.</p> : candidates.length === 0 ? <p className="rounded bg-slate-50 p-3 text-xs text-slate-500">현재 조건과 일치하는 치료요법 후보가 없습니다.</p> : candidates.map((candidate) => <button type="button" key={candidate.id} disabled={busy} onClick={() => { setSelected(candidate.regimen_detail.id); setSelectedRegimenDetail(candidate.regimen_detail); }} className={`block w-full rounded border p-3 text-left ${selected === candidate.regimen_detail.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}><p className="text-sm font-semibold">{candidate.regimen_detail.regimen_name} <span className="font-normal text-slate-500">({candidate.regimen_detail.regimen_code})</span></p><p className="mt-1 text-xs text-slate-500">{candidate.match_reasons.join(" · ") || "매칭 근거 없음"}</p><p className="mt-1 text-[11px] text-slate-400">{candidate.evidence_source ?? "근거 출처 정보 없음"}</p></button>)}</div>}
      <label className="mt-3 block text-xs font-semibold text-slate-700">표적치료 계획 <span className="font-normal text-slate-400">(선택)</span><textarea value={targetedPlan} disabled={busy || readOnly} onChange={(event) => setTargetedPlan(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm" /></label>
      <label className="mt-3 block text-xs font-semibold text-slate-700">결정 근거 <span className="font-normal text-slate-400">(선택)</span><textarea value={rationale} disabled={busy || readOnly} onChange={(event) => setRationale(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded border border-slate-300 p-2 text-sm" /></label>
      </details>

      </section>

      </DecisionModal>}
    </section>

    </div>
    <aside className="min-h-0 overflow-y-auto space-y-3" aria-label="치료 근거">{!actionable && !confirmed && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{waitingMessage || "선행 결과 확정 후 치료계획 작성 가능"}</p>}<TreatmentEvidencePanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} /></aside>
  </div>;
}

function nextLabel(value: string, options: readonly (readonly [string, string])[]) {
  return (options.find(([key]) => key === value)?.[1] ?? value) || "-";
}

function TreatmentDecisionDetails({ treatmentType, treatmentLine, aiAction, regimen, targetedPlan, rationale }: { treatmentType: string; treatmentLine: string; aiAction: string; regimen: TreatmentDecision["selected_regimen_detail"]; targetedPlan: string; rationale: string }) {
  const rows = [["치료 유형", treatmentType], ["치료 차수", treatmentLine], ["AI 추천 반영", aiAction], ["선택 Regimen", regimen ? `${regimen.regimen_name} (${regimen.regimen_code})` : "미선택"], ["표적치료 계획", targetedPlan || "-"], ["결정 근거", rationale || "-"]];
  return <div className="mt-2 text-xs"><dl className="grid grid-cols-3 gap-2">{rows.filter(([label]) => label === "치료 유형" || label === "치료 차수" || label === "선택 Regimen").map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-0.5 font-medium text-slate-800">{value}</dd></div>)}</dl><details className="mt-2 border-t border-slate-100 pt-2"><summary className="cursor-pointer text-slate-500">AI 반영 · 표적치료 계획 · 결정 근거</summary><dl className="mt-2 space-y-2">{rows.filter(([label]) => label !== "치료 유형" && label !== "치료 차수" && label !== "선택 Regimen").map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="whitespace-pre-wrap text-slate-700">{value}</dd></div>)}</dl></details></div>;
}
