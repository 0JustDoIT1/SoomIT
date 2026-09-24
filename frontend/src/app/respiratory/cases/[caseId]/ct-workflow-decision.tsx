"use client";

import { useRef, useState } from "react";
import { API_BASE_URL } from "../../_lib/respiratory-api";
import { DecisionModal, DecisionMethodSelect, DecisionReasonFields, decisionInputClass, decisionTriggerClass } from "./decision-ui";
import { showToast } from "@/components/ui/toast/toast";

type Action = "PROCEED_NEXT_STAGE" | "REFERRED_OUT";
type CtAiNodule = {
  nodule_no?: number;
  malignancy_risk?: number | string | null;
  finding_payload?: {
    quantification?: {
      maximum_3d_diameter_mm?: number | null;
      equivalent_diameter_mm?: number | null;
      volume_mm3?: number | null;
      surface_area_mm2?: number | null;
      sphericity?: number | null;
    };
  } | null;
};
type CtWorkflowDecisionProps = {
  caseId: string;
  aiResultId?: string;
  aiNodules?: CtAiNodule[];
  clinicalResult?: { id?: string; result_status?: string; result_detail?: { ct?: { overall_assessment?: string | null; finding_summary?: string | null } } };
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onCompleted: (result: { closed: boolean; message: string; currentStage?: string; caseStatus?: string }) => void;
};

function roundedAiDecimal(value: number | string | null | undefined, decimalPlaces: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** decimalPlaces;
  return Math.round((parsed + Number.EPSILON) * factor) / factor;
}

function firstSafeErrorMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstSafeErrorMessage(item);
      if (message) return message;
    }
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const message = firstSafeErrorMessage(item);
      if (message) return message;
    }
  }
  return null;
}

function httpError(response: Response, body: unknown) {
  const message = firstSafeErrorMessage(body);
  if (message) return message;
  return `CT 결과 처리에 실패했습니다. 서버 응답 코드: HTTP ${response.status}`;
}

function buildNoduleObservations(nodules: CtAiNodule[] | undefined) {
  return (nodules ?? [])
    .filter((nodule): nodule is CtAiNodule & { nodule_no: number } => Number.isInteger(nodule.nodule_no) && (nodule.nodule_no ?? 0) > 0)
    .map((nodule) => {
      const quantification = nodule.finding_payload?.quantification;
      return {
        nodule_no: nodule.nodule_no,
        max_diameter_mm: roundedAiDecimal(
          quantification?.maximum_3d_diameter_mm ?? quantification?.equivalent_diameter_mm,
          2,
        ),
        volume_mm3: roundedAiDecimal(quantification?.volume_mm3, 2),
        surface_area_mm2: roundedAiDecimal(quantification?.surface_area_mm2, 2),
        sphericity: roundedAiDecimal(quantification?.sphericity, 4),
        malignancy_risk: roundedAiDecimal(nodule.malignancy_risk, 2),
      };
    });
}

export function CtWorkflowDecision({ caseId, aiResultId, aiNodules, clinicalResult, authorizedFetch, onCompleted }: CtWorkflowDecisionProps) {
  const initialDetail = clinicalResult?.result_detail?.ct;
  const [open, setOpen] = useState(false);
  const [assessment, setAssessment] = useState(initialDetail?.overall_assessment || "INDETERMINATE");
  const [summary, setSummary] = useState(initialDetail?.finding_summary || "");
  const [action, setAction] = useState<Action>("PROCEED_NEXT_STAGE");
  const [reason, setReason] = useState("");
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const uncertainConfirmation = useRef<string | null>(null);
  const noduleObservations = buildNoduleObservations(aiNodules);
  const resultId = confirmedId ?? (clinicalResult?.result_status === "CONFIRMED" ? clinicalResult.id : undefined);
  const close = () => { if (!submittingRef.current) { setOpen(false); setError(""); } };
  const openDialog = () => {
    if (!confirmedId && initialDetail) {
      setAssessment(initialDetail.overall_assessment || "INDETERMINATE");
      setSummary(initialDetail.finding_summary || "");
      setAction("PROCEED_NEXT_STAGE");
    }
    setOpen(true);
  };
  const reconcileConfirmation = async () => {
    const id = uncertainConfirmation.current;
    if (!id) return { id: resultId, completed: false };
    const [resultsResponse, caseResponse] = await Promise.all([
      authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/clinical-results/`),
      authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/`),
    ]);
    if (!resultsResponse.ok || !caseResponse.ok) throw new Error("확정 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
    const results = await resultsResponse.json() as { id: string; result_status: string }[];
    const currentCase = await caseResponse.json() as { current_stage: string; case_status: string };
    const saved = results.find((result) => result.id === id);
    if (!saved || !currentCase.current_stage || !currentCase.case_status) throw new Error("확정 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
    uncertainConfirmation.current = null;
    if (saved.result_status !== "CONFIRMED") return { id: undefined, completed: false };
    setConfirmedId(id);
    const completed = currentCase.case_status !== "ACTIVE" || currentCase.current_stage !== "CT";
    if (completed) {
      setOpen(false);
      onCompleted({ closed: currentCase.case_status !== "ACTIVE", message: "서버에서 완료된 CT 처리 상태를 확인했습니다.", currentStage: currentCase.current_stage, caseStatus: currentCase.case_status });
    }
    return { id, completed };
  };

  const submit = async () => {
    if (submittingRef.current || (!aiResultId && !resultId)) return;
    if (action !== "PROCEED_NEXT_STAGE" && !reason.trim()) return;
    submittingRef.current = true;
    setBusy(true); setError("");
    const toastId = `case-ct-result-${caseId}`;
    let confirmationCompleted = Boolean(resultId);
    showToast.info("검사 결과를 처리하고 있습니다.", { id: toastId });
    const post = async (path: string, body: object) => {
      const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(httpError(response, data));
      return data;
    };
    try {
      const recovered = uncertainConfirmation.current ? await reconcileConfirmation() : { id: resultId, completed: false };
      if (recovered.completed) return;
      let sourceId = recovered.id;
      let advanced = false;
      let serverState: { current_stage?: string; case_status?: string } = {};
      if (!sourceId) {
        const draft = await post("clinical-results/ct/", {
          reviewed_ai_result_id: aiResultId,
          overall_assessment: assessment,
          finding_summary: summary.trim() || null,
          ...(noduleObservations.length ? { nodule_observations: noduleObservations } : {}),
        });
        if (!draft.id) throw new Error("저장된 CT 결과를 확인할 수 없습니다.");
        uncertainConfirmation.current = draft.id;
        serverState = await post(`clinical-results/ct/${draft.id}/confirm/`, { advance_to_next_stage: action === "PROCEED_NEXT_STAGE" });
        confirmationCompleted = true;
        uncertainConfirmation.current = null;
        sourceId = draft.id as string;
        setConfirmedId(sourceId);
        advanced = action === "PROCEED_NEXT_STAGE";
      }
      // A successful confirmation is retained if the following decision fails.
      // Retrying must not overwrite or reconfirm the clinical result.
      if (!advanced) {
        serverState = await post("workflow-decision/", { action, source_clinical_result_id: sourceId, target_stage: action === "PROCEED_NEXT_STAGE" ? "PET_CT_TNM" : null, reason });
      }
      setOpen(false);
      const message = action === "REFERRED_OUT" ? "CT 결과를 확정하고 의뢰·전원 처리했습니다." : "CT 결과가 확정되어 PET-CT/TNM 단계가 활성화되었습니다.";
      showToast.success(message, { id: toastId });
      onCompleted({ closed: action !== "PROCEED_NEXT_STAGE", message, currentStage: serverState.current_stage, caseStatus: serverState.case_status });
    } catch (cause) {
      console.error(cause);
      // Confirmation may have committed even when advancement or its response failed.
      // Reconcile via reads; never guess that it is safe to overwrite the draft.
      if (uncertainConfirmation.current) {
        try {
          const recovered = await reconcileConfirmation();
          confirmationCompleted = Boolean(recovered.id);
        }
        catch { /* Keep the original error and reconcile again before the next write. */ }
      }
      const fallback = confirmationCompleted ? "검사 결과는 확정되었지만 다음 단계 전환에 실패했습니다." : "CT 결과 처리에 실패했습니다.";
      const message = cause instanceof Error && cause.message.trim() ? cause.message : fallback;
      setError(message);
      showToast.error(message, { id: toastId });
    } finally {
      submittingRef.current = false; setBusy(false);
    }
  };
  const prefix = resultId ? "" : "결과 확정 및 ";
  const primaryLabel = prefix + (action === "REFERRED_OUT" ? "의뢰 처리" : "PET-CT/TNM 진행");
  return <>
    <button type="button" disabled={busy || (!aiResultId && !resultId)} title={!aiResultId && !resultId ? "확정할 CT AI 분석 결과가 필요합니다." : undefined} onClick={openDialog} className={decisionTriggerClass}>결과 입력 및 처리</button>
    {open && <DecisionModal title="흉부 CT 결과 입력 및 처리" description="영상·AI 결과를 검토하고 다음 처리를 선택하세요." busy={busy} error={error} message={resultId ? "결과 확정 완료 · 선택한 후속 처리를 진행합니다." : undefined} primaryLabel={primaryLabel} disabled={action !== "PROCEED_NEXT_STAGE" && !reason.trim()} onSubmit={() => void submit()} onClose={close}>
      <label className="block text-xs font-semibold text-slate-700">종합 판정<select disabled={Boolean(resultId)} value={assessment} onChange={(event) => { setAssessment(event.target.value); }} className={decisionInputClass}><option value="NO_NODULE">결절 없음</option><option value="NODULE_DETECTED">결절 발견</option><option value="INDETERMINATE">추가 평가 필요</option></select></label>
      <label className="block text-xs font-semibold text-slate-700">호흡기내과 소견<textarea disabled={Boolean(resultId)} value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} maxLength={5000} className={decisionInputClass} /></label>
      {noduleObservations.length > 0 && <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-slate-700"><p className="font-semibold text-blue-800">결절별 확정 후보</p><p className="mt-1 leading-5">AI가 검출한 {noduleObservations.length}개 결절의 크기·부피·악성 위험도가 CT 확정 결과에 함께 저장됩니다.</p></div>}
      <DecisionMethodSelect value={action} onChange={(value) => { setAction(value); setError(""); }} options={[{ value: "PROCEED_NEXT_STAGE", label: "PET-CT/TNM 진행" }, { value: "REFERRED_OUT", label: "의뢰·전원" }]} />
      {action === "PROCEED_NEXT_STAGE" ? <p className="text-xs text-slate-600">다음 단계: PET-CT/TNM</p> : <DecisionReasonFields kind="refer" reason={reason} onReasonChange={setReason} />}
    </DecisionModal>}
  </>;
}
