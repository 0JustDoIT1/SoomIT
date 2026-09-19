"use client";

import { useEffect, useRef, useState } from "react";

import { useRespiratoryAuth } from "../../_components/respiratory-auth-provider";
import { createExaminationOrder, type ExaminationOrderRequest, type ExaminationOrderType } from "../../_lib/respiratory-api";
import { showToast } from "@/components/ui/toast/toast";

const ORDER_LABELS: Record<ExaminationOrderType, string> = {
  XRAY: "흉부 X-ray",
  CT: "흉부 CT",
  PET_CT_TNM: "PET-CT / TNM 병기",
  PATHOLOGY_GENE: "조직/유전자",
  PDL1: "PD-L1",
};

export function StageExaminationOrder({ caseId, orderType, onCreated }: { caseId: string; orderType: ExaminationOrderType; onCreated?: (orderType: ExaminationOrderType) => void }) {
  const { authorizedFetch } = useRespiratoryAuth();
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<Omit<ExaminationOrderRequest, "order_type">>({ priority: "NORMAL", purpose: "", clinical_note: "" });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const creatingRef = useRef(false);
  const label = ORDER_LABELS[orderType];

  const close = () => {
    if (creating) return;
    setOpen(false);
    setReviewing(false);
    setError("");
    triggerRef.current?.focus();
  };

  const begin = () => {
    setOrder({ priority: "NORMAL", purpose: "", clinical_note: "" });
    setReviewing(false);
    setError("");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || creating) return;
      event.preventDefault();
      setOpen(false);
      setReviewing(false);
      setError("");
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [creating, open]);

  const submit = async () => {
    if (creatingRef.current) return;
    if (!order.purpose.trim()) {
      setError("검사 목적을 입력해 주세요.");
      showToast.warning("검사 목적을 입력해 주세요.");
      setReviewing(false);
      return;
    }
    const toastId = `case-order-${caseId}-${orderType}`;
    creatingRef.current = true;
    setCreating(true);
    setError("");
    showToast.info("검사 오더를 처리하고 있습니다.", { id: toastId });
    try {
      await createExaminationOrder(authorizedFetch, caseId, {
        order_type: orderType,
        priority: order.priority,
        purpose: order.purpose.trim(),
        clinical_note: order.clinical_note.trim(),
      });
      setOpen(false);
      setReviewing(false);
      showToast.success(`${label} 검사 오더가 생성되었습니다.`, { id: toastId });
      onCreated?.(orderType);
    } catch (reason) {
      console.error(reason);
      setError("검사 오더 생성에 실패했습니다.");
      showToast.error("검사 오더 생성에 실패했습니다.", { id: toastId });
      setReviewing(false);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  return <><button ref={triggerRef} type="button" onClick={begin} className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">{label} 오더</button>{open && <div role="dialog" aria-modal="true" aria-labelledby="stage-order-title" className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/40 p-4"><section ref={dialogRef} tabIndex={-1} className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl outline-none"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-blue-700">다음 검사 요청</p><h2 id="stage-order-title" className="mt-1 text-lg font-bold text-slate-900">{label} 오더</h2><p className="mt-1 text-xs leading-5 text-slate-500">현재 Case에 대해 {label} 검사를 요청합니다. 서버에서 선행 결과와 중복 활성 오더를 다시 검증합니다.</p></div><button type="button" onClick={close} disabled={creating} aria-label="오더 창 닫기" className="text-lg text-slate-400 hover:text-slate-700">×</button></div>{error && <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{error}</p>}{!reviewing ? <><div className="mt-5 grid grid-cols-2 gap-3 text-xs"><label className="font-medium text-slate-600">우선순위<select aria-label="검사 오더 우선순위" value={order.priority} disabled={creating} onChange={(event) => setOrder((current) => ({ ...current, priority: event.target.value as ExaminationOrderRequest["priority"] }))} className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800"><option value="NORMAL">일반</option><option value="URGENT">긴급</option></select></label><div /><label className="col-span-2 font-medium text-slate-600">검사 목적 <span className="text-rose-500">*</span><input aria-label="검사 오더 목적" value={order.purpose} maxLength={500} disabled={creating} onChange={(event) => setOrder((current) => ({ ...current, purpose: event.target.value }))} placeholder="검사를 요청하는 목적을 입력하세요" className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-slate-800" /></label><label className="col-span-2 font-medium text-slate-600">임상 소견<textarea aria-label="검사 오더 임상 소견" value={order.clinical_note} maxLength={1000} rows={3} disabled={creating} onChange={(event) => setOrder((current) => ({ ...current, clinical_note: event.target.value }))} placeholder="검사 부서에 전달할 임상 소견을 입력하세요" className="mt-1 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-slate-800" /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} disabled={creating} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600">취소</button><button type="button" disabled={!order.purpose.trim() || creating} onClick={() => { setError(""); setReviewing(true); }} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300">입력 내용 검토</button></div></> : <><dl className="mt-5 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm"><dt className="text-slate-500">검사</dt><dd className="font-semibold text-slate-800">{label}</dd><dt className="text-slate-500">우선순위</dt><dd className="font-semibold text-slate-800">{order.priority === "URGENT" ? "긴급" : "일반"}</dd><dt className="text-slate-500">검사 목적</dt><dd className="break-words font-semibold text-slate-800">{order.purpose.trim()}</dd><dt className="text-slate-500">임상 소견</dt><dd className="break-words text-slate-700">{order.clinical_note.trim() || "-"}</dd></dl><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={creating} onClick={() => setReviewing(false)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600">수정</button><button type="button" disabled={creating} onClick={() => void submit()} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300">{creating ? "생성 중..." : "오더 확정"}</button></div></>}</section></div>}</>;
}
