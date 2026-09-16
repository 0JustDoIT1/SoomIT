"use client";

import type OpenSeadragonType from "openseadragon";
import { useEffect, useRef, useState } from "react";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Specimen = { id: string; specimen_code: string; body_site?: string | null };
type Slide = { id: string; specimen_id: string; slide_code: string; stain: string; mpp?: string | number | null; status: string; viewer_url: string };
type Viewer = { width: number; height: number; tile_width: number; tile_height: number; max_level: number; tile_url_template: string };
const errorDetail = (body: unknown, fallback: string) => body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : fallback;
const stainName = (stain: "HE" | "PDL1") => stain === "PDL1" ? "PD-L1" : "H&E";

export function CaseWsiEvidence({ apiBaseUrl, authorizedFetch, caseId, stain }: { apiBaseUrl: string; authorizedFetch: AuthorizedFetch; caseId: string; stain: "HE" | "PDL1" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragonType.Viewer | null>(null);
  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selectedSlideId, setSelectedSlideId] = useState("");
  const [viewerData, setViewerData] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedSlide = slides.find((slide) => slide.id === selectedSlideId) ?? null;
  const selectedSpecimen = specimens.find((specimen) => specimen.id === selectedSlide?.specimen_id) ?? null;

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
          const slideResponse = await authorizedFetch(`${apiBaseUrl}/api/doctor/specimens/${specimen.id}/slides/`, { signal: controller.signal });
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
      try { const response = await authorizedFetch(`${apiBaseUrl}${selectedSlide.viewer_url}`, { signal: controller.signal }); const payload: unknown = await response.json(); if (!response.ok) throw new Error(errorDetail(payload, "WSI 뷰어 정보를 불러오지 못했습니다.")); if (!controller.signal.aborted) setViewerData(payload as Viewer); }
      catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "WSI 뷰어를 준비하지 못했습니다."); }
      finally { if (!controller.signal.aborted) setViewerLoading(false); }
    })();
    return () => controller.abort();
  }, [apiBaseUrl, authorizedFetch, selectedSlide]);

  useEffect(() => {
    if (!viewerData || !selectedSlide || !containerRef.current) return;
    let disposed = false;
    void import("openseadragon").then(({ default: OpenSeadragon }) => {
      if (disposed || !containerRef.current) return;
      const token = sessionStorage.getItem("accessToken");
      viewerRef.current = OpenSeadragon({ element: containerRef.current, showNavigationControl: false, loadTilesWithAjax: true, ajaxHeaders: token ? { Authorization: `Bearer ${token}` } : {}, gestureSettingsMouse: { clickToZoom: false }, tileSources: { width: viewerData.width, height: viewerData.height, tileWidth: viewerData.tile_width, tileHeight: viewerData.tile_height, minLevel: 0, maxLevel: viewerData.max_level, getTileUrl(level: number, x: number, y: number) { return viewerData.tile_url_template.replace("{level}", String(viewerData.max_level - level)).replace("{x}", String(x)).replace("{y}", String(y)); } } });
    }).catch(() => setError("WSI 뷰어를 시작하지 못했습니다."));
    return () => { disposed = true; viewerRef.current?.destroy(); viewerRef.current = null; };
  }, [selectedSlide, viewerData]);

  const zoom = (amount: number) => viewerRef.current?.viewport.zoomBy(amount);
  const title = `${stainName(stain)} 원본 슬라이드`;
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"><div><p className="text-[10px] font-semibold text-blue-600">원본 근거 · WSI</p><h2 className="mt-1 text-base font-bold text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-500">검체별 슬라이드를 선택해 확대·축소하며 확인할 수 있습니다.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{slides.length}개</span></header><div className="grid min-h-[480px] grid-cols-[220px_minmax(0,1fr)]"><aside className="border-r border-slate-200 bg-slate-50/60 p-3"><p className="px-1 pb-2 text-[10px] font-bold text-slate-500">{stainName(stain)} 슬라이드</p>{loading ? <p className="p-3 text-xs text-slate-400">목록을 불러오는 중입니다.</p> : slides.length === 0 ? <p className="p-3 text-xs leading-5 text-slate-400">조회 가능한 슬라이드가 없습니다.</p> : <div className="space-y-2">{slides.map((slide) => { const specimen = specimens.find((item) => item.id === slide.specimen_id); const selected = slide.id === selectedSlideId; return <button key={slide.id} type="button" onClick={() => setSelectedSlideId(slide.id)} className={`w-full rounded-lg border p-3 text-left ${selected ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold text-slate-800">{slide.slide_code}</span><span className="text-[9px] font-bold text-violet-700">{stainName(stain)}</span></div><p className="mt-1 truncate text-[10px] text-slate-500">검체 {specimen?.specimen_code ?? "-"}</p><p className="mt-1 text-[10px] text-slate-400">{slide.mpp ?? "-"} μm/px</p></button>; })}</div>}</aside><div className="min-w-0"><div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{selectedSlide?.slide_code ?? "슬라이드를 선택하세요"}</p><p className="truncate text-[10px] text-slate-400">{selectedSpecimen ? `${selectedSpecimen.specimen_code}${selectedSpecimen.body_site ? ` · ${selectedSpecimen.body_site}` : ""}` : ""}</p></div><div className="flex shrink-0 gap-1"><Tool label="축소" onClick={() => zoom(0.8)} disabled={!viewerData} /><Tool label="확대" onClick={() => zoom(1.25)} disabled={!viewerData} /><Tool label="초기화" onClick={() => viewerRef.current?.viewport.goHome()} disabled={!viewerData} /><Tool label="전체화면" onClick={() => { void containerRef.current?.requestFullscreen?.(); }} disabled={!viewerData} /></div></div><div className="relative min-h-[422px] bg-slate-950">{viewerData && selectedSlide && <div ref={containerRef} className="absolute inset-0" aria-label={`${selectedSlide.slide_code} WSI 뷰어`} />}{(loading || viewerLoading) && <p role="status" className="grid min-h-[422px] place-items-center text-sm text-slate-300">WSI를 불러오는 중입니다.</p>}{!loading && error && <p role="alert" className="grid min-h-[422px] place-items-center px-8 text-center text-sm text-rose-200">{error}</p>}{!loading && !error && !selectedSlide && <p className="grid min-h-[422px] place-items-center px-8 text-center text-sm text-slate-300">표시할 {stainName(stain)} WSI가 없습니다.</p>}{viewerData && selectedSlide && <span className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-950/80 px-2 py-1 text-[10px] text-white">휠로 확대·축소 · 드래그로 이동</span>}</div></div></div></section>;
}

function Tool({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) { return <button type="button" onClick={onClick} disabled={disabled} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">{label}</button>; }
