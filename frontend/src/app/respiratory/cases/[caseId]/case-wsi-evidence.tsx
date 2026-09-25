"use client";

import type OpenSeadragonType from "openseadragon";
import { useEffect, useRef, useState } from "react";

import { WsiAnnotationLayer } from "@/components/pathology/wsi-annotation-layer";
import {
  attachWsiViewerLifecycle,
  createWsiTileSource,
  wsiViewportCacheKey,
} from "@/components/pathology/wsi-viewer";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Specimen = { id: string; specimen_code: string; body_site?: string | null };
type Slide = { id: string; specimen_id: string; image_asset_id: string; slide_code: string; stain: string; mpp?: string | number | null; status: string; viewer_url: string };
type Viewer = { width: number; height: number; tile_width: number; tile_height: number; max_level: number; resolutions?: number[]; sizes?: Array<[number, number]>; tile_url_template: string };
type ActiveViewer = { instance: OpenSeadragonType.Viewer; ownerKey: string };
const errorDetail = (body: unknown, fallback: string) => body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : fallback;
const stainName = (stain: "HE" | "PDL1") => stain === "PDL1" ? "PD-L1" : "H&E";
const doctorAssetUrl = (apiBaseUrl: string, path: string) => {
  if (/^https?:\/\//.test(path)) return path;
  const normalized = path.replace("/api/doctor/slides/", "/api/doctor/cases/slides/");
  return `${apiBaseUrl}${normalized.startsWith("/") ? "" : "/"}${normalized}`;
};

export function CaseWsiEvidence({ apiBaseUrl, authorizedFetch, caseId, stain, fillHeight = false }: { apiBaseUrl: string; authorizedFetch: AuthorizedFetch; caseId: string; stain: "HE" | "PDL1"; fillHeight?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [annotationToolbarElement, setAnnotationToolbarElement] = useState<HTMLDivElement | null>(null);
  const viewerRef = useRef<OpenSeadragonType.Viewer | null>(null);
  const [activeViewer, setActiveViewer] = useState<ActiveViewer | null>(null);
  const [createViewerPoint, setCreateViewerPoint] = useState<((x: number, y: number) => OpenSeadragonType.Point) | null>(null);
  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selectedSlideId, setSelectedSlideId] = useState("");
  const [viewerData, setViewerData] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedSlide = slides.find((slide) => slide.id === selectedSlideId) ?? null;
  const selectedSpecimen = specimens.find((specimen) => specimen.id === selectedSlide?.specimen_id) ?? null;
  const viewerOwnerKey = selectedSlide ? wsiViewportCacheKey(caseId, selectedSlide.image_asset_id, selectedSlide.id) : "";

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setError(""); setSlides([]); setSelectedSlideId(""); setViewerData(null);
      try {
        const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/specimens/`, { signal: controller.signal });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(errorDetail(payload, "검체 목록을 불러오지 못했습니다."));
        const specimenList = Array.isArray(payload) ? payload as Specimen[] : [];
        const slideLists = await Promise.all(specimenList.map(async (specimen) => {
          const slideResponse = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/specimens/${specimen.id}/slides/`, { signal: controller.signal });
          const slidePayload: unknown = await slideResponse.json();
          if (!slideResponse.ok) throw new Error(errorDetail(slidePayload, "슬라이드 목록을 불러오지 못했습니다."));
          return Array.isArray(slidePayload) ? slidePayload as Slide[] : [];
        }));
        if (!controller.signal.aborted) { const available = slideLists.flat().filter((slide) => slide.stain === stain && slide.status === "READY"); setSpecimens(specimenList); setSlides(available); setSelectedSlideId(available[0]?.id ?? ""); setLoading(false); }
      } catch (cause) { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "WSI 조회 중 오류가 발생했습니다."); setLoading(false); } }
    })();
    return () => controller.abort();
  }, [apiBaseUrl, authorizedFetch, caseId, stain]);

  useEffect(() => {
    if (!selectedSlide) return;
    const controller = new AbortController();
    void (async () => {
      setViewerLoading(true); setError(""); setViewerData(null);
      try { const response = await authorizedFetch(doctorAssetUrl(apiBaseUrl, selectedSlide.viewer_url), { signal: controller.signal }); const payload: unknown = await response.json(); if (!response.ok) throw new Error(errorDetail(payload, "WSI 뷰어 정보를 불러오지 못했습니다.")); if (!controller.signal.aborted) { const viewer = payload as Viewer; setViewerData({ ...viewer, tile_url_template: doctorAssetUrl(apiBaseUrl, viewer.tile_url_template) }); } }
      catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "WSI 뷰어를 준비하지 못했습니다."); }
      finally { if (!controller.signal.aborted) setViewerLoading(false); }
    })();
    return () => controller.abort();
  }, [apiBaseUrl, authorizedFetch, selectedSlide]);

  useEffect(() => {
    if (!viewerData || !selectedSlide || !containerRef.current) return;
    let disposed = false;
    let ownedViewer: OpenSeadragonType.Viewer | null = null;
    let detachLifecycle = () => {};
    void import("openseadragon").then(({ default: OpenSeadragon }) => {
      if (disposed || !containerRef.current) return;
      const token = sessionStorage.getItem("accessToken");
      ownedViewer = OpenSeadragon({ element: containerRef.current, showNavigationControl: false, loadTilesWithAjax: true, ajaxHeaders: token ? { Authorization: `Bearer ${token}` } : {}, gestureSettingsMouse: { clickToZoom: false }, tileSources: createWsiTileSource(viewerData) });
      viewerRef.current = ownedViewer;
      detachLifecycle = attachWsiViewerLifecycle(
        ownedViewer,
        containerRef.current,
        viewerOwnerKey,
        (x, y) => new OpenSeadragon.Point(x, y),
      );
      setCreateViewerPoint(() => (x: number, y: number) => new OpenSeadragon.Point(x, y));
      setActiveViewer({ instance: ownedViewer, ownerKey: viewerOwnerKey });
    }).catch(() => setError("WSI 뷰어를 시작하지 못했습니다."));
    return () => {
      disposed = true;
      detachLifecycle();
      setActiveViewer((current) => current?.instance === ownedViewer ? null : current);
      setCreateViewerPoint(null);
      ownedViewer?.destroy();
      if (viewerRef.current === ownedViewer) viewerRef.current = null;
    };
  }, [selectedSlide, viewerData, viewerOwnerKey]);

  const zoom = (amount: number) => viewerRef.current?.viewport.zoomBy(amount);
  const title = `${stainName(stain)} 원본 슬라이드`;
  return <section className={`${fillHeight ? "flex h-full min-h-0 flex-col" : ""} overflow-hidden rounded-lg bg-white`}><header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2"><div><h2 className="text-sm font-semibold text-slate-900">{title}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{slides.length}개</span></header><div className={`${fillHeight ? "min-h-0 flex-1" : "min-h-[380px]"} grid grid-cols-[124px_minmax(0,1fr)] 2xl:grid-cols-[144px_minmax(0,1fr)]`}><aside className="min-h-0 overflow-y-auto border-r border-slate-200 bg-slate-50/60 p-2"><p className="px-1 pb-2 text-[10px] font-bold text-slate-500">{stainName(stain)} 슬라이드</p>{loading ? <p className="p-3 text-xs text-slate-400">목록을 불러오는 중입니다.</p> : slides.length === 0 ? <p className="p-3 text-xs leading-5 text-slate-400">조회 가능한 슬라이드가 없습니다.</p> : <div className="space-y-2">{slides.map((slide) => { const specimen = specimens.find((item) => item.id === slide.specimen_id); const selected = slide.id === selectedSlideId; return <button key={slide.id} type="button" onClick={() => setSelectedSlideId(slide.id)} className={`w-full rounded-lg border p-2 text-left ${selected ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold text-slate-800">{slide.slide_code}</span><span className="text-[9px] font-bold text-violet-700">{stainName(stain)}</span></div><p className="mt-1 truncate text-[10px] text-slate-500">검체 {specimen?.specimen_code ?? "-"}</p><p className="mt-1 text-[10px] text-slate-400">{slide.mpp ?? "-"} μm/px</p></button>; })}</div>}</aside><div className="flex min-h-0 min-w-0 flex-col"><div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-2 py-2"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{selectedSlide?.slide_code ?? "슬라이드를 선택하세요"}</p><p className="truncate text-[10px] text-slate-400">{selectedSpecimen ? `${selectedSpecimen.specimen_code}${selectedSpecimen.body_site ? ` · ${selectedSpecimen.body_site}` : ""}` : ""}</p></div><div ref={setAnnotationToolbarElement} className="flex min-w-0 items-center overflow-x-auto" /><div className="flex shrink-0 flex-wrap gap-1"><Tool label="축소" onClick={() => zoom(0.8)} disabled={!viewerData} /><Tool label="확대" onClick={() => zoom(1.25)} disabled={!viewerData} /><Tool label="초기화" onClick={() => viewerRef.current?.viewport.goHome()} disabled={!viewerData} /><Tool label="전체화면" onClick={() => { void containerRef.current?.requestFullscreen?.(); }} disabled={!viewerData} /></div></div><div className={`${fillHeight ? "min-h-0 flex-1" : "min-h-[322px]"} relative bg-slate-950`} data-wsi-layer="image">{viewerData && selectedSlide && <div ref={containerRef} className="absolute inset-0" aria-label={`${selectedSlide.slide_code} WSI 뷰어`} />}{activeViewer?.ownerKey === viewerOwnerKey && viewerData && selectedSlide && createViewerPoint ? <WsiAnnotationLayer key={viewerOwnerKey} viewer={activeViewer.instance} toolbarElement={annotationToolbarElement} endpoint={`${apiBaseUrl}/api/doctor/cases/${caseId}/image-annotations/?image_asset_id=${encodeURIComponent(selectedSlide.image_asset_id)}&slide_id=${encodeURIComponent(selectedSlide.id)}`} imageAssetId={selectedSlide.image_asset_id} slideId={selectedSlide.id} imageWidth={viewerData.width} imageHeight={viewerData.height} createViewerPoint={createViewerPoint} authorizedFetch={authorizedFetch} writable /> : null}{(loading || viewerLoading) && <p role="status" className={`${fillHeight ? "absolute inset-0" : "min-h-[322px]"} grid place-items-center text-sm text-slate-300`}>WSI를 불러오는 중입니다.</p>}{!loading && error && <p role="alert" className={`${fillHeight ? "absolute inset-0" : "min-h-[322px]"} grid place-items-center px-8 text-center text-sm text-rose-200`}>{error}</p>}{!loading && !error && !selectedSlide && <p className={`${fillHeight ? "absolute inset-0" : "min-h-[322px]"} grid place-items-center px-8 text-center text-sm text-slate-300`}>표시할 {stainName(stain)} WSI가 없습니다.</p>}{viewerData && selectedSlide && <span className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-950/80 px-2 py-1 text-[10px] text-white">휠로 확대·축소 · 드래그로 이동</span>}</div></div></div></section>;
}

function Tool({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) { return <button type="button" onClick={onClick} disabled={disabled} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">{label}</button>; }
