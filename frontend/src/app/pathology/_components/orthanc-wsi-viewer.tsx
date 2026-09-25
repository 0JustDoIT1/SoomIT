"use client";

import type OpenSeadragonType from "openseadragon";
import { useEffect, useRef, useState } from "react";

import {
  attachWsiViewerLifecycle,
  createWsiTileSource,
  wsiViewportCacheKey,
} from "@/components/pathology/wsi-viewer";
import { staffAuthenticatedFetch } from "@/lib/api";
import { type WholeSlideImage, type WsiPyramid, wsiPyramidApiUrl } from "../_lib/pathology-api";

export function OrthancWsiViewer({ slide, caseId, fillHeight = false }: { slide: WholeSlideImage; caseId?: string; fillHeight?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const ownerKey = wsiViewportCacheKey(caseId ?? slide.specimen_id, slide.image_asset_id, slide.id);

  useEffect(() => {
    let disposed = false;
    let viewer: OpenSeadragonType.Viewer | null = null;
    let detachLifecycle = () => {};
    const accessToken = sessionStorage.getItem("accessToken");

    void Promise.all([
      staffAuthenticatedFetch(wsiPyramidApiUrl(slide.id)),
      import("openseadragon"),
    ])
      .then(async ([response, module]) => ({
        pyramid: (await response.json()) as WsiPyramid,
        OpenSeadragon: module.default,
      }))
      .then(({ pyramid, OpenSeadragon }) => {
        if (disposed || !containerRef.current) return;
        viewer = OpenSeadragon({
          element: containerRef.current,
          showNavigationControl: false,
          loadTilesWithAjax: true,
          ajaxHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          gestureSettingsMouse: { clickToZoom: false },
          tileSources: createWsiTileSource(pyramid),
        });
        detachLifecycle = attachWsiViewerLifecycle(
          viewer,
          containerRef.current,
          ownerKey,
          (x, y) => new OpenSeadragon.Point(x, y),
        );
        viewer.addHandler("open-failed", () => setError("WSI 타일을 열지 못했습니다."));
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : "WSI pyramid 정보를 불러오지 못했습니다.");
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
      detachLifecycle();
      viewer?.destroy();
    };
  }, [ownerKey, slide.id]);

  return <div className={`flex flex-col overflow-hidden bg-slate-950 ${fillHeight ? "h-full min-h-0" : "min-h-[420px]"}`}>
    <div className="flex min-h-9 shrink-0 items-center border-b border-slate-700 bg-slate-900 px-2"><span className="text-[10px] font-semibold text-slate-300">WSI</span></div>
    <div className="relative min-h-0 flex-1" data-wsi-layer="image">
    <div ref={containerRef} className="absolute inset-0" aria-label={`${slide.slide_code} WSI 뷰어`} />
    {loading && <div className="absolute inset-0 grid place-items-center text-sm text-slate-300">WSI 불러오는 중...</div>}
    {error && <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red-300">{error}</div>}
    {!loading && !error && <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-950/75 px-2 py-1 text-xs text-white">휠 확대·축소 · 드래그 이동</div>}
    </div>
  </div>;
}
