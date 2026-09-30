"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmActionDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute("open", "");
    cancelRef.current?.focus();
    return () => { dialog?.close?.(); previousFocus?.focus(); };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); onCancel(); }} className="fixed inset-0 m-auto w-full max-w-md border-0 bg-transparent p-0 backdrop:bg-slate-950/50">
      <section role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
        <h2 id={titleId} className="text-base font-bold text-slate-900">{title}</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="min-h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">취소</button>
          <button type="button" onClick={onConfirm} className="min-h-10 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700">{confirmLabel}</button>
        </div>
      </section>
    </dialog>
  );
}
