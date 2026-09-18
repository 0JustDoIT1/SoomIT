"use client";

import { useState } from "react";
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

export function CaseWorkflowDecision({ caseId, currentStage, confirmedResultId, authorizedFetch, onCompleted }: { caseId: string; currentStage: string; confirmedResultId?: string; authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; onCompleted: (completion: WorkflowDecisionCompletion) => void }) {
  const [action, setAction] = useState<"PROCEED_NEXT_STAGE" | "RETRY" | "REFERRED_OUT" | "CASE_CLOSED" | null>(null);
  const [reason, setReason] = useState("");
  const [retryPurpose, setRetryPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const next = NEXT_STAGE[currentStage];
  const disabled = !confirmedResultId;

  const submit = async () => {
    if (!action || !confirmedResultId) return;
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
        closed: body.case_status === "CLOSED",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "진료 단계 변경에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return <><button type="button" disabled={disabled || !next} title={disabled ? "현재 단계의 확정 결과가 필요합니다." : undefined} onClick={() => setAction("PROCEED_NEXT_STAGE")} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200">다음 단계 진행</button>{currentStage === "PATHOLOGY_GENE" && <button type="button" disabled={disabled} onClick={() => setAction("RETRY")} className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-800 disabled:opacity-40">재생검</button>}<button type="button" disabled={disabled} onClick={() => setAction("REFERRED_OUT")} className="rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[10px] font-semibold text-violet-800 disabled:opacity-40">의뢰·전원</button><button type="button" disabled={disabled} onClick={() => setAction("CASE_CLOSED")} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 disabled:opacity-40">Case 종료</button>{action && <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="workflow-decision-title" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><h2 id="workflow-decision-title" className="text-base font-bold text-slate-900">{action === "RETRY" ? "재생검 요청" : action === "REFERRED_OUT" ? "의뢰·전원 처리" : action === "CASE_CLOSED" ? "Case 종료" : "다음 단계 진행"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{action === "RETRY" ? "부적정 사유를 기록하고 조직/유전자 재생검 오더를 생성합니다." : action === "REFERRED_OUT" ? "현재 결과와 의뢰 사유를 남긴 뒤 Case를 잠급니다." : action === "CASE_CLOSED" ? "정기 추적 또는 추가 검사 불필요 사유를 남기고 Case를 종료합니다." : `${next?.label ?? "다음"} 단계로 진행합니다.`}</p>{action !== "PROCEED_NEXT_STAGE" && <textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder={action === "RETRY" ? "부적정 또는 재생검 사유" : "결정 사유"} className="mt-4 h-24 w-full resize-none rounded-md border border-slate-300 p-3 text-sm" />}{action === "RETRY" && <input value={retryPurpose} onChange={(event) => setRetryPurpose(event.target.value)} placeholder="재생검 오더 목적" className="mt-3 w-full rounded-md border border-slate-300 p-3 text-sm" />}{error && <p role="alert" className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" disabled={submitting} onClick={() => { setAction(null); setError(""); }} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">취소</button><button type="button" disabled={submitting || (action !== "PROCEED_NEXT_STAGE" && !reason.trim()) || (action === "RETRY" && !retryPurpose.trim())} onClick={() => { void submit(); }} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">{submitting ? "처리 중" : "결정 저장"}</button></div></section></div>}</>;
}
