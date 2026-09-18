"use client";

import { useState } from "react";
import { API_BASE_URL } from "../../_lib/respiratory-api";

type CtWorkflowDecisionProps = {
  caseId: string;
  aiResultId?: string;
  clinicalResult?: { id?: string; result_status?: string; result_detail?: { ct?: { overall_assessment?: string | null; overall_malignancy_risk?: number | string | null; finding_summary?: string | null } } };
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onCompleted: () => void;
};

const assessmentOptions = [
  { value: "NO_NODULE", label: "결절 없음" },
  { value: "NODULE_DETECTED", label: "결절 발견" },
  { value: "INDETERMINATE", label: "판정 불가" },
];

export function CtWorkflowDecision({ caseId, aiResultId, clinicalResult, authorizedFetch, onCompleted }: CtWorkflowDecisionProps) {
  const initialDetail = clinicalResult?.result_detail?.ct;
  const [open, setOpen] = useState(false);
  const [assessment, setAssessment] = useState(initialDetail?.overall_assessment || "INDETERMINATE");
  const [risk, setRisk] = useState(initialDetail?.overall_malignancy_risk == null ? "" : String(initialDetail.overall_malignancy_risk));
  const [summary, setSummary] = useState(initialDetail?.finding_summary || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError("");
  };

  const submit = async () => {
    if (!aiResultId) return;
    const parsedRisk = risk.trim() === "" ? null : Number(risk);
    if (parsedRisk !== null && (!Number.isFinite(parsedRisk) || parsedRisk < 0 || parsedRisk > 100)) {
      setError("악성 위험도는 0부터 100 사이의 숫자로 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const draftResponse = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/clinical-results/ct/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewed_ai_result_id: aiResultId,
            overall_assessment: assessment,
            overall_malignancy_risk: parsedRisk,
            finding_summary: summary.trim() || null,
          }),
        }
      );
      const draft = await draftResponse.json().catch(() => ({}));
      if (!draftResponse.ok) throw new Error(draft.detail || "CT 결과를 저장하지 못했습니다.");

      const confirmResponse = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/${caseId}/clinical-results/ct/${draft.id}/confirm/`,
        { method: "POST" }
      );
      const confirmed = await confirmResponse.json().catch(() => ({}));
      if (!confirmResponse.ok) throw new Error(confirmed.detail || "CT 결과를 확정하지 못했습니다.");
      setOpen(false);
      onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "CT 결과 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (clinicalResult?.result_status === "CONFIRMED") return null;

  return <>
    <button type="button" disabled={!aiResultId} title={!aiResultId ? "확정할 CT AI 분석 결과가 필요합니다." : undefined} onClick={() => setOpen(true)} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-200">결과 입력 및 확정</button>
    {open && <div role="presentation" className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="ct-workflow-title" className="w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-blue-700">호흡기내과 진료 결정</p><h2 id="ct-workflow-title" className="mt-1 text-base font-bold text-slate-900">흉부 CT 결과 입력 및 확정</h2><p className="mt-1 text-xs leading-5 text-slate-500">AI 결과를 참고 자료로 검토한 뒤 호흡기내과 판단을 확정합니다. 확정 후 PET-CT/TNM 단계 진행을 선택할 수 있습니다.</p></div><button type="button" disabled={busy} onClick={close} aria-label="CT 결과 입력 닫기" className="text-lg text-slate-400 hover:text-slate-700">×</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">종합 판정<select value={assessment} disabled={busy} onChange={(event) => setAssessment(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm"><>{assessmentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</></select></label><label className="text-xs font-semibold text-slate-700">악성 위험도 (%)<input type="number" min="0" max="100" step="0.01" value={risk} disabled={busy} onChange={(event) => setRisk(event.target.value)} placeholder="선택 입력" className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm" /></label></div><label className="mt-3 block text-xs font-semibold text-slate-700">호흡기내과 소견<textarea value={summary} disabled={busy} onChange={(event) => setSummary(event.target.value)} maxLength={5000} rows={5} placeholder="영상·AI 결과를 검토한 소견을 입력하세요." className="mt-1 w-full resize-none rounded-md border border-slate-300 p-2 text-sm" /></label>{error && <p role="alert" className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={close} className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">취소</button><button type="button" disabled={busy} onClick={() => void submit()} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-blue-300">{busy ? "확정 중..." : "결과 확정"}</button></div></section></div>}
  </>;
}
