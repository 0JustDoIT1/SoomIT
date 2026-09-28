"use client";

import { useState } from "react";

import { showToast } from "@/components/ui/toast/toast";
import type { AuthorizedFetch } from "./treatment-prescription-types";

export function Pdl1ConfirmationButton({
  caseId,
  resultId,
  aiRange,
  apiBaseUrl,
  authorizedFetch,
  onConfirmed,
}: {
  caseId: string;
  resultId: string;
  aiRange?: string | null;
  apiBaseUrl: string;
  authorizedFetch: AuthorizedFetch;
  onConfirmed: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"TPS" | "INDETERMINATE">("TPS");
  const [tps, setTps] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = mode === "TPS"
    ? tps !== "" && Number.isFinite(Number(tps)) && Number(tps) >= 0 && Number(tps) <= 100
    : reason.trim().length >= 5;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    const toastId = `case-pdl1-confirm-${caseId}-${resultId}`;
    setSubmitting(true);
    setError("");
    showToast.info("PD-L1 결과를 확정하고 있습니다.", { id: toastId });
    try {
      const response = await authorizedFetch(
        `${apiBaseUrl}/api/doctor/cases/${caseId}/clinical-results/pathology/${resultId}/confirm/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mode === "TPS"
            ? { tps_percent: Number(tps), indeterminate_reason: "" }
            : { tps_percent: null, indeterminate_reason: reason.trim() }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "PD-L1 결과 확정에 실패했습니다.");
      showToast.success("PD-L1 결과가 확정되었습니다.", { id: toastId });
      setOpen(false);
      await onConfirmed();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "PD-L1 결과 확정에 실패했습니다.";
      setError(message);
      showToast.error(message, { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-800">
      결과 확인 및 확정
    </button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="pdl1-confirm-title" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setOpen(false); }}>
      <section className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white px-5 py-4">
          <div><p className="text-[10px] font-bold text-blue-600">PD-L1 임상 확정</p><h2 id="pdl1-confirm-title" className="mt-1 text-lg font-bold text-slate-900">최종 TPS 검토</h2><p className="mt-1 text-xs text-slate-500">AI 예측 구간과 구분되는 의료진 확정값을 기록합니다.</p></div>
          <button type="button" disabled={submitting} onClick={() => setOpen(false)} aria-label="PD-L1 확정 창 닫기" className="flex h-8 w-8 items-center justify-center rounded-lg text-xl text-slate-400 hover:bg-white hover:text-slate-700">×</button>
        </header>
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3"><p className="text-[10px] font-semibold text-blue-500">AI 예측 TPS 구간</p><p className="mt-1 text-sm font-bold text-blue-800">{aiRange || "AI 예측 구간 없음"}</p></div>
          <fieldset><legend className="text-xs font-bold text-slate-700">의료진 최종 판정</legend><div className="mt-2 grid grid-cols-2 gap-2">
            <label className={`cursor-pointer rounded-xl border p-3 text-xs font-semibold ${mode === "TPS" ? "border-blue-400 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600"}`}><input type="radio" name="pdl1-mode" value="TPS" checked={mode === "TPS"} onChange={() => { setMode("TPS"); setError(""); }} className="mr-2 accent-blue-600" />TPS 입력</label>
            <label className={`cursor-pointer rounded-xl border p-3 text-xs font-semibold ${mode === "INDETERMINATE" ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600"}`}><input type="radio" name="pdl1-mode" value="INDETERMINATE" checked={mode === "INDETERMINATE"} onChange={() => { setMode("INDETERMINATE"); setError(""); }} className="mr-2 accent-amber-600" />판정 불가</label>
          </div></fieldset>
          {mode === "TPS" ? <label className="block text-xs font-semibold text-slate-700">최종 TPS (%)<input type="number" min="0" max="100" step="0.01" value={tps} onChange={(event) => setTps(event.target.value)} aria-label="PD-L1 최종 TPS" placeholder="0~100" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><span className="mt-1 block text-[10px] font-normal text-slate-400">병리 슬라이드 검토에 따른 실제 TPS 값을 입력하세요.</span></label>
            : <label className="block text-xs font-semibold text-slate-700">판정 불가 사유<textarea value={reason} onChange={(event) => setReason(event.target.value.slice(0, 500))} aria-label="PD-L1 판정 불가 사유" rows={3} placeholder="검체 부족, 품질 부적합 등 구체적인 사유를 입력하세요." className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" /></label>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4"><button type="button" disabled={submitting} onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700">취소</button><button type="button" disabled={!canSubmit || submitting} onClick={() => void submit()} className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{submitting ? "확정 중" : "PD-L1 결과 확정"}</button></footer>
      </section>
    </div>}
  </>;
}
