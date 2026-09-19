"use client";

import { useRef, useState } from "react";
import { DecisionModal, DecisionMethodSelect, DecisionReasonFields, decisionTriggerClass } from "./decision-ui";
import { API_BASE_URL } from "../../_lib/respiratory-api";

const NEXT_STAGE: Record<string, { key: string; label: string } | undefined> = {
  XRAY: { key: "CT", label: "흉부 CT" },
  CT: { key: "PET_CT_TNM", label: "PET-CT / TNM" },
  PET_CT_TNM: { key: "PATHOLOGY_GENE", label: "조직/유전자" },
  PATHOLOGY_GENE: { key: "PDL1", label: "PD-L1" },
  PDL1: { key: "TREATMENT", label: "치료 결정" },
  TREATMENT: { key: "PRESCRIPTION", label: "처방" },
};

type WorkflowDecisionCompletion = {
  message: string;
  closed: boolean;
};

export function CaseWorkflowDecision({ caseId, currentStage, confirmedResultId, confirmedStageGroup, exceptionsOnly = false, authorizedFetch, onCompleted }: { caseId: string; currentStage: string; confirmedResultId?: string; confirmedStageGroup?: string | null; exceptionsOnly?: boolean; authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; onCompleted: (completion: WorkflowDecisionCompletion) => void }) {
  const [action, setAction] = useState<"PROCEED_NEXT_STAGE" | "RETRY" | "REFERRED_OUT" | "CASE_CLOSED" | null>(null);
  const [reason, setReason] = useState("");
  const [retryPurpose, setRetryPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const next = NEXT_STAGE[currentStage];
  const disabled = !confirmedResultId;
  const canProceed = Boolean(!exceptionsOnly && next && confirmedResultId && (currentStage !== "PET_CT_TNM" || confirmedStageGroup?.trim()));
  const proceedLabel = currentStage === "PATHOLOGY_GENE"
    ? "확정 및 PD-L1 진행"
    : currentStage === "PDL1"
      ? "치료결정으로 진행"
      : currentStage === "TREATMENT"
        ? "치료계획 확정 및 처방 진행"
        : "다음 단계 진행";

  const submit = async () => {
    if (!action || !confirmedResultId || submittingRef.current) return;
    if (action === "PROCEED_NEXT_STAGE" && !canProceed) return;
    if (action !== "PROCEED_NEXT_STAGE" && !reason.trim()) return;
    if (action === "RETRY" && !retryPurpose.trim()) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/workflow-decision/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, source_clinical_result_id: confirmedResultId, target_stage: action === "PROCEED_NEXT_STAGE" ? next?.key : null, reason, retry_purpose: retryPurpose, retry_priority: "NORMAL", retry_clinical_note: reason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "진료 단계 변경에 실패했습니다.");
      setAction(null);
      setReason("");
      onCompleted({
        message: action === "CASE_CLOSED" ? "Case가 종료되었습니다." : action === "REFERRED_OUT" ? "의뢰·전원 처리되어 Case가 잠겼습니다." : action === "RETRY" ? "재생검 오더가 생성되었습니다." : `${next?.label ?? "다음"} 단계가 활성화되었습니다.`,
        closed: body.case_status === "CLOSED" || body.case_status === "REFERRED_OUT",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "진료 단계 변경에 실패했습니다.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const actionLabel = action === "RETRY" ? "재생검 요청" : action === "REFERRED_OUT" ? "의뢰·전원 처리" : action === "CASE_CLOSED" ? "Case 종료" : proceedLabel;

  return <>
    <button type="button" disabled={disabled || submitting} title={disabled ? "현재 단계의 확정 결과가 필요합니다." : undefined} onClick={() => setAction(canProceed ? "PROCEED_NEXT_STAGE" : "REFERRED_OUT")} className={exceptionsOnly ? "rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-600 disabled:text-slate-400" : decisionTriggerClass}>{exceptionsOnly ? "종료·의뢰 처리" : "결과 입력 및 처리"}</button>
    {disabled && !exceptionsOnly && <p className="mt-1 text-xs text-slate-500">판독 결과 확정 대기: 확정 결과가 있어야 처리할 수 있습니다.</p>}
    {action && <DecisionModal title="결과 입력 및 처리" description="확정된 결과를 근거로 다음 처리를 선택하세요. 판독 결과 자체는 변경하지 않습니다." busy={submitting} error={error} primaryLabel={actionLabel} disabled={(action === "PROCEED_NEXT_STAGE" && !canProceed) || (action !== "PROCEED_NEXT_STAGE" && !reason.trim()) || (action === "RETRY" && !retryPurpose.trim())} onSubmit={() => void submit()} onClose={() => { setAction(null); setError(""); }}>
      <p className="text-xs text-slate-600">판독 결과: 완료</p>
      <DecisionMethodSelect value={action} onChange={(value) => { setAction(value); setError(""); }} options={[
        ...(!exceptionsOnly && next ? [{ value: "PROCEED_NEXT_STAGE" as const, label: next.label + " 진행", disabled: !canProceed }] : []),
        ...(currentStage === "PATHOLOGY_GENE" ? [{ value: "RETRY" as const, label: "재생검" }] : []),
        { value: "REFERRED_OUT", label: "의뢰·전원" }, { value: "CASE_CLOSED", label: "Case 종료" },
      ]} />
      {currentStage === "PET_CT_TNM" && !confirmedStageGroup?.trim() && <p className="text-xs text-amber-700">다음 단계 진행에는 TNM 결과와 Stage Group 최종 확정이 필요합니다.</p>}
      {action === "PROCEED_NEXT_STAGE" ? <p className="text-xs text-slate-600">다음 단계: {next?.label}</p> : <DecisionReasonFields kind={action === "RETRY" ? "retry" : action === "REFERRED_OUT" ? "refer" : "close"} reason={reason} onReasonChange={setReason} retryPurpose={retryPurpose} onRetryPurposeChange={setRetryPurpose} />}
    </DecisionModal>}
  </>;
}
