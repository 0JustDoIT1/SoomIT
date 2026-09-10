"use client";

import { KeyboardEvent, RefObject, useEffect, useRef } from "react";

export function CaseChangeDialog({ onCancel, onDiscard, returnFocusRef }: { onCancel: () => void; onDiscard: () => void; returnFocusRef: RefObject<HTMLElement | null> }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { const returnFocusElement = returnFocusRef.current; cancelRef.current?.focus(); return () => returnFocusElement?.focus(); }, [returnFocusRef]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab") return;
    const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (buttons.length === 0) return;
    const first = buttons[0]; const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="discard-draft-title" aria-describedby="discard-draft-description" onKeyDown={handleKeyDown} onMouseDown={(event) => { if (event.target === event.currentTarget) event.preventDefault(); }} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><section className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"><h2 id="discard-draft-title" className="text-base font-bold text-slate-900">저장되지 않은 변경사항이 있습니다.</h2><p id="discard-draft-description" className="mt-3 text-sm leading-6 text-slate-600">다른 Case로 이동하면 작성 중인 TNM·치료·처방 내용이 사라집니다.</p><div className="mt-5 flex justify-end gap-2"><button ref={cancelRef} type="button" onClick={onCancel} className="rounded-md border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700">계속 작성</button><button type="button" onClick={onDiscard} className="rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white">변경사항 버리고 이동</button></div></section></div>;
}
