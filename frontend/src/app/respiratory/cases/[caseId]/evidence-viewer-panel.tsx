"use client";

import { useRef, useState } from "react";
import { EvidenceViewerDialog } from "./evidence-viewer-dialog";

type ImageAsset = { id: string; image_type?: string; file_format?: string; acquired_at?: string | null; status?: string; storage_type?: string; storage_uri?: string };

export function EvidenceViewerPanel({ assets = [] }: { assets?: ImageAsset[]; selectedAssetId?: string }) {
  const [viewerMode, setViewerMode] = useState<"VIEW" | "ANNOTATE" | null>(null);
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  const annotateButtonRef = useRef<HTMLButtonElement>(null);
  const unavailableId = "tnm-reference-api-unavailable";
  const returnFocusRef = viewerMode === "ANNOTATE" ? annotateButtonRef : viewButtonRef;

  return (
    <section className="h-full min-h-0 overflow-hidden border-t border-slate-200 bg-white">
      <header className="flex h-9 items-center justify-between gap-3 px-3"><h3 className="whitespace-nowrap text-xs font-bold text-slate-900">영상 근거 및 Annotation</h3><span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">Annotation API 연동 대기</span></header>
      <div className="overflow-x-auto"><div className="min-w-[700px]"><div className="grid h-6 grid-cols-[80px_135px_95px_minmax(140px,1fr)_80px] items-center border-y border-slate-100 bg-slate-50 px-3 text-[10px] font-semibold text-slate-500"><span>주석</span><span>Series·슬라이스</span><span>출처</span><span>T·N·M 소견 연결</span><span>상태</span></div>{assets.length === 0 ? <div className="flex h-12 items-center justify-center text-xs text-slate-400">연결된 영상 주석이 없습니다.</div> : assets.map((asset) => <div key={asset.id} className="grid h-12 grid-cols-[80px_135px_95px_minmax(140px,1fr)_80px] items-center px-3 text-[10px] text-slate-600"><span>-</span><span>{asset.image_type || "-"} · {asset.file_format || "-"}</span><span>{asset.storage_type || "-"}</span><span>-</span><span>{asset.status || "-"}</span></div>)}</div></div>
      <footer className="flex h-[52px] items-center gap-1.5 border-t border-slate-100 px-3"><button ref={viewButtonRef} type="button" onClick={() => setViewerMode("VIEW")} className="whitespace-nowrap rounded border border-blue-500 px-2 py-1.5 text-[10px] font-semibold text-blue-700">원본 영상 전체화면</button><button ref={annotateButtonRef} type="button" onClick={() => setViewerMode("ANNOTATE")} className="whitespace-nowrap rounded border border-blue-500 px-2 py-1.5 text-[10px] font-semibold text-blue-700">주석 작성</button>{["T 소견에 참조", "N 소견에 참조", "M 소견에 참조"].map((label) => <button key={label} type="button" disabled aria-describedby={unavailableId} className="whitespace-nowrap rounded bg-slate-100 px-2 py-1.5 text-[10px] text-slate-400">{label}</button>)}<span id={unavailableId} className="ml-auto truncate text-[9px] text-slate-400">원본은 수정하지 않으며 참조·저장 API 연결 전에는 영구 저장되지 않습니다.</span></footer>
      {viewerMode && <EvidenceViewerDialog mode={viewerMode} onClose={() => setViewerMode(null)} returnFocusRef={returnFocusRef} />}
    </section>
  );
}
