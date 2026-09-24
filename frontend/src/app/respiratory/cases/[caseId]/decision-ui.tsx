"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export const decisionInputClass = "mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm";
export const decisionTriggerClass = "rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500";

export function DecisionStatus({ error, message }: { error?: string; message?: string }) {
  return <>{message && <p role="status" className="mt-3 text-xs text-slate-600">{message}</p>}{error && <p role="alert" className="mt-3 rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}</>;
}

export function DecisionActions({ busy, disabled, label, onSubmit, onCancel }: { busy: boolean; disabled?: boolean; label: string; onSubmit: () => void; onCancel?: () => void }) {
  return <div className="mt-5 flex justify-end gap-2">{onCancel && <button type="button" disabled={busy} onClick={onCancel} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">취소</button>}<button type="button" disabled={busy || disabled} onClick={onSubmit} className={decisionTriggerClass}>{busy ? "처리 중" : label}</button></div>;
}

// Presentation only: each stage owns validation, requests and recovery.
export function DecisionModal({ title, description, children, busy, error, message, primaryLabel, disabled, onSubmit, onClose }: { title: string; description?: string; children: ReactNode; busy: boolean; error?: string; message?: string; primaryLabel: string; disabled?: boolean; onSubmit: () => void; onClose: () => void }) {
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1} className="flex max-h-[90dvh] w-full max-w-xl flex-col rounded-lg bg-white p-4 shadow-2xl" onKeyDown={(event) => {
      if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const fields = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]') ?? []).filter((item) => item.getClientRects().length > 0);
      const first = fields[0]; const last = fields.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <p className="text-xs font-semibold text-blue-700">호흡기내과 최종 판단</p>
      <h2 id={titleId} className="mt-1 text-base font-bold text-slate-900">{title}</h2>
      {description && <p className="mt-2 text-xs leading-5 text-slate-600">{description}</p>}
      <fieldset disabled={busy} className="mt-3 min-h-0 overflow-y-auto space-y-3 pr-1">{children}</fieldset>
      <DecisionStatus error={error} message={busy ? "처리 중입니다. 완료될 때까지 기다려 주세요." : message} />
      <DecisionActions busy={busy} disabled={disabled} label={primaryLabel} onSubmit={onSubmit} onCancel={onClose} />
    </section>
  </div>;
}

export function DecisionMethodSelect<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; disabled?: boolean }[] }) {
  return <label className="block text-xs font-semibold text-slate-700">처리 방법<select value={value} onChange={(event) => onChange(event.target.value as T)} className={decisionInputClass}>{options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></label>;
}

export function DecisionReasonFields({ kind, reason, onReasonChange, retryPurpose, onRetryPurposeChange }: { kind: "close" | "refer" | "retry"; reason: string; onReasonChange: (value: string) => void; retryPurpose?: string; onRetryPurposeChange?: (value: string) => void }) {
  const label = kind === "close" ? "Case 종료 사유" : kind === "refer" ? "의뢰·전원 사유" : "재생검 사유";
  return <><label className="block text-xs font-semibold text-slate-700">{label}<textarea value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder={kind === "retry" ? "부적정 또는 재생검 사유" : "결정 사유"} rows={3} className={decisionInputClass} /></label>{kind === "retry" && <><p className="text-xs text-slate-500">재검 종류: 조직/유전자 재생검</p><label className="block text-xs font-semibold text-slate-700">재생검 오더 목적<input value={retryPurpose ?? ""} onChange={(event) => onRetryPurposeChange?.(event.target.value)} placeholder="재생검 오더 목적" className={decisionInputClass} /></label></>}</>;
}
