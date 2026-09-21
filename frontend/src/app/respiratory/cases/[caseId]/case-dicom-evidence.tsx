"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ensureCornerstoneInitialized } from "../../../radiology/_lib/cornerstone-init";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Asset = { id: string; workflow_stage: string; image_type: string; file_format: string; status: string };

const message = (body: unknown, fallback: string) => body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : fallback;
const sopUid = (row: unknown) => row && typeof row === "object" && "00080018" in row && row["00080018"] && typeof row["00080018"] === "object" && "Value" in row["00080018"] && Array.isArray(row["00080018"].Value) && typeof row["00080018"].Value[0] === "string" ? row["00080018"].Value[0] : null;

export function CaseDicomEvidence({ apiBaseUrl, authorizedFetch, caseId, stage }: { apiBaseUrl: string; authorizedFetch: AuthorizedFetch; caseId: string; stage: string }) {
  const viewerFrameRef = useRef<HTMLElement>(null);
  const elementRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [uids, setUids] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const asset = assets.find((item) => item.id === selectedAssetId) ?? null;
  const isTnm = stage === "PET_CT_TNM";

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setError(""); setUids([]);
      try {
        const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/`, { signal: controller.signal });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(message(payload, "영상 목록을 불러오지 못했습니다."));
        const nextAssets = (Array.isArray(payload) ? payload as Asset[] : []).filter((item) => item.workflow_stage === stage && item.status === "READY" && (item.image_type === "CT" || item.image_type === "PET"));
        if (!nextAssets.length) throw new Error("조회 가능한 DICOM Series가 없습니다.");
        if (!controller.signal.aborted) { setAssets(nextAssets); setSelectedAssetId(nextAssets[0].id); }
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "DICOM 조회 중 오류가 발생했습니다."); setLoading(false); }
      }
    })();
    return () => controller.abort();
  }, [apiBaseUrl, authorizedFetch, caseId, stage]);

  useEffect(() => {
    if (!asset) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setError(""); setUids([]);
      try {
        const instances = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/${asset.id}/dicom-web/instances/`, { signal: controller.signal });
        const instancePayload: unknown = await instances.json();
        if (!instances.ok) throw new Error(message(instancePayload, "DICOM instance 목록을 불러오지 못했습니다."));
        const nextUids = (Array.isArray(instancePayload) ? instancePayload : []).map(sopUid).filter((uid): uid is string => Boolean(uid));
        if (!nextUids.length) throw new Error("DICOM instance가 없습니다.");
        if (!controller.signal.aborted) { setUids(nextUids); setIndex(Math.floor(nextUids.length / 2)); setLoading(false); }
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "DICOM 조회 중 오류가 발생했습니다."); setLoading(false); }
      }
    })();
    return () => controller.abort();
  }, [apiBaseUrl, asset, authorizedFetch, caseId]);

  useEffect(() => {
    if (!asset || !uids[index] || !elementRef.current) return;
    let cancelled = false;
    let engine: import("@cornerstonejs/core").RenderingEngine | null = null;
    void (async () => {
      try {
        const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/${asset.id}/dicom-web/instances/${uids[index]}/`, { headers: { Accept: "application/dicom" } });
        if (!response.ok) throw new Error("원본 DICOM을 불러오지 못했습니다.");
        const blob = await response.blob();
        const { core, dicomImageLoader } = await ensureCornerstoneInitialized();
        if (cancelled || !elementRef.current) return;
        const imageId = dicomImageLoader.wadouri.fileManager.add(new File([blob], `${uids[index]}.dcm`, { type: "application/dicom" }));
        engine = new core.RenderingEngine(`respiratory-dicom-engine-${reactId}`);
        const viewportId = `respiratory-dicom-viewport-${reactId}`;
        engine.enableElement({ viewportId, type: core.Enums.ViewportType.STACK, element: elementRef.current });
        const viewport = engine.getViewport(viewportId) as InstanceType<typeof core.StackViewport>;
        await viewport.setStack([imageId]);
        viewport.render();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "원본 DICOM을 표시하지 못했습니다.");
      }
    })();
    return () => { cancelled = true; engine?.destroy(); };
  }, [apiBaseUrl, asset, authorizedFetch, caseId, index, reactId, uids]);

  const resetSlice = () => setIndex(Math.floor(uids.length / 2));
  const openFullscreen = async () => { if (viewerFrameRef.current?.requestFullscreen) await viewerFrameRef.current.requestFullscreen(); };

  return (
    <section ref={viewerFrameRef} className="grid h-full min-h-0 grid-rows-[48px_38px_minmax(0,1fr)_40px] overflow-hidden rounded-md border border-slate-800 bg-[#050914] shadow-inner">
      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-800 bg-[#0b1220] px-3">
        <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-wide text-cyan-300">DICOM evidence</p><h2 className="truncate text-xs font-semibold text-slate-100">{isTnm ? "PET-CT / TNM 검토 영상" : "흉부 CT 원본 영상"}</h2></div>
        <div className="flex shrink-0 items-center gap-1 text-[9px]">
          <ToolButton active label="1×1" title="현재 단일 Stack Viewport" />
          <ToolButton disabled label="2×2" title="현재 MPR·다중 Viewport는 지원하지 않습니다." />
          <ToolButton disabled label="WL/WW" title="현재 Window/Level 도구는 지원하지 않습니다." />
          <ToolButton disabled label="Zoom" title="현재 Zoom 도구는 지원하지 않습니다." />
          <ToolButton disabled label="Pan" title="현재 Pan 도구는 지원하지 않습니다." />
          <ToolButton disabled label="측정" title="현재 측정 도구는 지원하지 않습니다." />
          <ToolButton disabled label="ROI" title="현재 ROI 도구는 지원하지 않습니다." />
          <ToolButton label="Reset" disabled={!uids.length} onClick={resetSlice} title="중앙 슬라이스로 이동" />
          <ToolButton label="전체화면" disabled={!asset} onClick={() => void openFullscreen()} title="전체화면" />
        </div>
      </header>

      <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-slate-800 bg-[#101827] px-2 py-1.5" aria-label="DICOM series">
        {assets.map((item) => <button key={item.id} type="button" onClick={() => setSelectedAssetId(item.id)} className={`shrink-0 rounded px-2 py-1 text-[9px] font-semibold transition ${item.id === selectedAssetId ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{item.image_type === "PET" ? "PET" : "CT"} Series</button>)}
        {isTnm && <span className="ml-1 shrink-0 rounded border border-slate-700 px-2 py-1 text-[8px] text-slate-500" title="현재 CT-PET Fusion Viewport는 지원하지 않습니다.">Fusion 미지원</span>}
      </div>

      <div className="relative min-h-0 overflow-hidden bg-black">
        <div ref={elementRef} tabIndex={0} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); } if (event.key === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.min(uids.length - 1, value + 1)); } }} className="absolute inset-0 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400" aria-label="DICOM 원본 영상 뷰어. 좌우 화살표로 슬라이스 이동" />
        {asset && <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1"><HudChip>{asset.image_type || "DICOM"} Series</HudChip><HudChip>Axial stack</HudChip><HudChip>Slice {uids.length ? `${index + 1} / ${uids.length}` : "-"}</HudChip></div>}
        {loading && <p role="status" className="grid h-full place-items-center text-xs text-slate-300">DICOM Series를 불러오는 중입니다.</p>}
        {!loading && error && <p role="alert" className="grid h-full place-items-center px-8 text-center text-xs text-rose-200">{error}</p>}
        {!loading && !error && <p className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/55 px-2 py-1 text-[8px] text-slate-400">← / → 슬라이스 이동</p>}
      </div>

      <footer className="flex min-w-0 items-center gap-2 border-t border-slate-800 bg-[#0b1220] px-3">
        <button type="button" disabled={!uids.length || index === 0} onClick={() => setIndex((value) => value - 1)} className="rounded border border-slate-700 px-2 py-1 text-[9px] font-medium text-slate-200 disabled:opacity-35">이전</button>
        <input aria-label="DICOM 슬라이스" type="range" min={0} max={Math.max(0, uids.length - 1)} value={Math.min(index, Math.max(0, uids.length - 1))} disabled={!uids.length} onChange={(event) => setIndex(Number(event.target.value))} className="min-w-0 flex-1 accent-blue-500" />
        <span className="w-14 text-right text-[9px] tabular-nums text-slate-400">{uids.length ? `${index + 1}/${uids.length}` : "-"}</span>
        <button type="button" disabled={!uids.length || index >= uids.length - 1} onClick={() => setIndex((value) => value + 1)} className="rounded border border-slate-700 px-2 py-1 text-[9px] font-medium text-slate-200 disabled:opacity-35">다음</button>
      </footer>
    </section>
  );
}

function ToolButton({ label, title, onClick, disabled = false, active = false }: { label: string; title: string; onClick?: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" title={title} aria-label={label} disabled={disabled} onClick={onClick} className={`rounded border px-1.5 py-1 font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? "border-blue-400/70 bg-blue-500/20 text-blue-200" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{label}</button>;
}

function HudChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-white/10 bg-black/55 px-1.5 py-0.5 text-[8px] font-medium text-slate-200 backdrop-blur-sm">{children}</span>;
}
