"use client";

import { useState } from "react";
import { API_BASE_URL } from "../../_lib/respiratory-api";

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
  const [error, setError] = useState("");
  const close = () => { if (!busy) { setAction(null); setError(""); } };
  const submit = async () => {
    if (!action) return;
    setBusy(true); setError("");
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/xray-workflow/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assessment, finding_summary: summary, next_action: action, priority, purpose, clinical_note: "", closure_reason: reason }) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(httpError(response, body));
      const result = body as { case_status?: string };
      close();
      onCompleted({ closed: result.case_status !== "ACTIVE", messages: action === "ORDER_CT" ? ["검사 결과가 확정되었습니다.", "흉부 CT 오더가 생성되었습니다."] : action === "REFERRED_OUT" ? ["검사 결과가 확정되었습니다.", "의뢰·전원 처리되었습니다."] : ["검사 결과가 확정되었습니다.", "검사가 종료되었습니다."] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "X-ray 결과 처리에 실패했습니다. 네트워크 연결을 확인해 주세요."); }
    finally { setBusy(false); }
  };
  const title = action === "ORDER_CT" ? "결과 확정 및 흉부 CT 진행" : action === "REFERRED_OUT" ? "결과 확정 및 의뢰·전원" : "결과 확정 및 Case 종료";
  return <><div className="flex flex-wrap justify-center gap-2"><button type="button" onClick={() => setAction("CLOSE_CASE")} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700">Case 종료</button><button type="button" onClick={() => setAction("REFERRED_OUT")} className="rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[10px] font-semibold text-violet-800">의뢰·전원</button><button type="button" onClick={() => setAction("ORDER_CT")} className="rounded-md bg-blue-600 px-2.5 py-1.5 text-[10px] font-semibold text-white">결과 입력 및 확정</button></div>{action && <div role="presentation" className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="xray-workflow-title" className="w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl"><h2 id="xray-workflow-title" className="text-base font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">결과 확정과 다음 행동은 하나의 트랜잭션으로 처리됩니다.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">판정<select value={assessment} onChange={(event) => setAssessment(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"><option value="NEGATIVE">정상 / 음성</option><option value="SUSPICIOUS">이상 의심</option><option value="INDETERMINATE">판정 불가</option></select></label>{action === "ORDER_CT" && <label className="text-xs font-semibold text-slate-700">CT 우선순위<select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm"><option value="NORMAL">일반</option><option value="URGENT">긴급</option></select></label>}</div><label className="mt-3 block text-xs font-semibold text-slate-700">호흡기내과 소견<textarea value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-1 h-20 w-full resize-none rounded-md border border-slate-300 p-2 text-sm" /></label>{action === "ORDER_CT" ? <label className="mt-3 block text-xs font-semibold text-slate-700">CT 오더 목적<textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-1 h-16 w-full resize-none rounded-md border border-slate-300 p-2 text-sm" /></label> : <label className="mt-3 block text-xs font-semibold text-slate-700">{action === "REFERRED_OUT" ? "의뢰·전원 사유" : "Case 종료 사유"}<textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-16 w-full resize-none rounded-md border border-slate-300 p-2 text-sm" /></label>}{error && <p role="alert" className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={close} className="rounded border border-slate-200 px-3 py-2 text-xs">취소</button><button type="button" disabled={busy || (action === "ORDER_CT" ? !purpose.trim() : !reason.trim())} onClick={() => void submit()} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">{busy ? "처리 중..." : title}</button></div></section></div>}</>;
}
