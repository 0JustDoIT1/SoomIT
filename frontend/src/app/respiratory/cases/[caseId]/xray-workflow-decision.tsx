"use client";

import { useRef, useState } from "react";
import { DecisionModal, DecisionMethodSelect, DecisionReasonFields, decisionInputClass, decisionTriggerClass } from "./decision-ui";
import { API_BASE_URL } from "../../_lib/respiratory-api";
import { showToast } from "@/components/ui/toast/toast";

type Action = "ORDER_CT" | "REFERRED_OUT" | "CLOSE_CASE";
type Props = { caseId: string; authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; onCompleted: (result: { closed: boolean; messages: string[] }) => void };

function httpError(response: Response, body: unknown) {
  const detail = body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : "";
  return detail || `X-ray 결과 처리에 실패했습니다. 서버 응답 코드: HTTP ${response.status}`;
}

export function XrayWorkflowDecision({ caseId, authorizedFetch, onCompleted }: Props) {
  const [action, setAction] = useState<Action | null>(null);
  const [assessment, setAssessment] = useState("SUSPICIOUS");
  const [summary, setSummary] = useState("");
  const [purpose, setPurpose] = useState("X-ray 소견에 따른 흉부 CT 정밀 평가");
  const [reason, setReason] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState("");
  const close = () => { if (!busy) { setAction(null); setError(""); } };
  const submit = async () => {
    if (!action || submittingRef.current || (action === "ORDER_CT" ? !purpose.trim() : !reason.trim())) return;
    submittingRef.current = true;
    setBusy(true); setError("");
    const toastId = `case-xray-result-${caseId}`;
    showToast.info("검사 결과를 처리하고 있습니다.", { id: toastId });
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/xray-workflow/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessment, finding_summary: summary, next_action: action, priority, purpose, clinical_note: "", closure_reason: reason }) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(httpError(response, body));
      const result = body as { case_status?: string };
      setAction(null);
      setError("");
      const messages = action === "ORDER_CT" ? ["검사 결과가 확정되었습니다.", "흉부 CT 오더가 생성되었습니다."] : action === "REFERRED_OUT" ? ["검사 결과가 확정되었습니다.", "의뢰·전원 처리되었습니다."] : ["검사 결과가 확정되었습니다.", "검사가 종료되었습니다."];
      showToast.success(messages.join(" "), { id: toastId });
      onCompleted({ closed: result.case_status !== "ACTIVE", messages });
    } catch (cause) {
      console.error(cause);
      setError("X-ray 결과 처리에 실패했습니다.");
      showToast.error("검사 결과 처리에 실패했습니다.", { id: toastId });
    }
    finally { submittingRef.current = false; setBusy(false); }
  };
  const title = action === "ORDER_CT" ? "결과 확정 및 CT 오더 생성" : action === "REFERRED_OUT" ? "결과 확정 및 의뢰 처리" : "결과 확정 및 Case 종료";
  return <>
    <button type="button" disabled={busy} onClick={() => setAction(assessment === "NEGATIVE" ? "CLOSE_CASE" : "ORDER_CT")} className={decisionTriggerClass}>결과 입력 및 처리</button>
    {action && <DecisionModal title="X-ray 결과 입력 및 처리" description="영상·AI 결과를 검토하고 다음 처리를 선택하세요." busy={busy} error={error} primaryLabel={title} disabled={action === "ORDER_CT" ? !purpose.trim() : !reason.trim()} onSubmit={() => void submit()} onClose={close}>
      <label className="block text-xs font-semibold text-slate-700">판정<select value={assessment} onChange={(event) => { setAssessment(event.target.value); setAction(event.target.value === "NEGATIVE" ? "CLOSE_CASE" : "ORDER_CT"); }} className={decisionInputClass}><option value="NEGATIVE">정상 / 음성</option><option value="SUSPICIOUS">이상 의심</option><option value="INDETERMINATE">판정 불가</option></select></label>
      <label className="block text-xs font-semibold text-slate-700">호흡기내과 소견<textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} className={decisionInputClass} /></label>
      <DecisionMethodSelect value={action} onChange={(value) => { setAction(value); setError(""); }} options={[{ value: "ORDER_CT", label: "흉부 CT 진행" }, { value: "REFERRED_OUT", label: "의뢰·전원" }, { value: "CLOSE_CASE", label: "Case 종료" }]} />
      {action === "ORDER_CT" ? <><p className="text-xs text-slate-600">다음 검사: 흉부 CT</p><details><summary className="cursor-pointer text-xs text-slate-600">CT 오더 상세</summary><label className="mt-3 block text-xs font-semibold text-slate-700">CT 오더 목적<textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={2} className={decisionInputClass} /></label><label className="mt-3 block text-xs font-semibold text-slate-700">CT 우선순위<select value={priority} onChange={(event) => setPriority(event.target.value)} className={decisionInputClass}><option value="NORMAL">일반</option><option value="URGENT">긴급</option></select></label></details></> : <DecisionReasonFields kind={action === "REFERRED_OUT" ? "refer" : "close"} reason={reason} onReasonChange={setReason} />}
    </DecisionModal>}
  </>;
}
