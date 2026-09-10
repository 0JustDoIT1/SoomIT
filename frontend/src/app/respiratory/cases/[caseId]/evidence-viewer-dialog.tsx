"use client";

import { KeyboardEvent, RefObject, useEffect, useRef } from "react";

export function EvidenceViewerDialog({ mode, onClose, returnFocusRef }: { mode: "VIEW" | "ANNOTATE"; onClose: () => void; returnFocusRef?: RefObject<HTMLButtonElement | null> }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const returnFocusElement = returnFocusRef?.current;
    closeRef.current?.focus();
    return () => returnFocusElement?.focus();
  }, [returnFocusRef]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="원본 영상 및 주석 전체 화면" onKeyDown={handleKeyDown} className="fixed inset-0 z-50 h-dvh w-screen overflow-hidden bg-slate-950 text-white">
      <div className="grid h-full grid-rows-[56px_48px_minmax(0,1fr)]">
        <header className="flex items-center justify-between border-b border-slate-700 px-5"><div><h2 className="text-sm font-bold">원본 영상 및 주석</h2><p className="text-[10px] text-slate-400">{mode === "ANNOTATE" ? "영상 주석 작성 기능 준비 중" : "원본 영상 연결 준비 중"}</p></div><button ref={closeRef} type="button" onClick={onClose} className="rounded-md border border-slate-600 px-4 py-2 text-xs">Case 화면으로 돌아가기</button></header>
        <nav className="flex items-center gap-2 overflow-x-auto border-b border-slate-700 px-4" aria-label="영상 도구">{["이동", "확대", "축소", "핀", "타원", "자유곡선", "화살표", "길이 측정", "메모", "실행 취소", "다시 실행"].map((label) => <button key={label} type="button" disabled aria-describedby="annotation-api-reason" className="whitespace-nowrap rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-500">{label}</button>)}</nav>
        <div className="grid min-h-0 grid-cols-[220px_minmax(700px,1fr)_320px]"><aside className="overflow-y-auto border-r border-slate-700 p-4"><h3 className="text-xs font-bold">영상 목록</h3><p className="mt-8 text-center text-xs text-slate-500">조회 가능한 영상이 없습니다.</p></aside><main className="flex min-h-0 items-center justify-center overflow-hidden bg-black text-center"><div><p className="text-sm font-bold">원본 영상 연결 준비 중</p><p className="mt-2 text-xs text-slate-500">가짜 영상이나 임의 주석은 표시하지 않습니다.</p></div></main><aside className="overflow-y-auto border-l border-slate-700 p-4"><h3 className="text-xs font-bold">판독·주석 정보</h3><div className="mt-4 space-y-2">{["AI 표시", "전문과 표시", "호흡기내과 주석"].map((label) => <label key={label} className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" disabled />{label}</label>)}</div><label className="mt-6 block text-xs text-slate-400">연결할 T·N·M<select disabled className="mt-2 w-full rounded-md border border-slate-700 bg-slate-800 p-2"><option>기능 준비 중</option></select></label><button type="button" disabled aria-describedby="annotation-api-reason" className="mt-4 w-full rounded-md bg-slate-700 px-3 py-2 text-xs text-slate-500">영상 주석 저장</button><p id="annotation-api-reason" className="mt-2 text-[10px] leading-4 text-slate-500">영상과 주석 기능이 연결되면 작성 도구와 저장 기능을 사용할 수 있습니다.</p></aside></div>
      </div>
    </div>
  );
}
