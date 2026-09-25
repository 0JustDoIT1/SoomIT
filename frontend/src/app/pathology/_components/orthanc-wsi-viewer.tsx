"use client";

import type OpenSeadragonType from "openseadragon";
import { useEffect, useRef, useState } from "react";

import { WsiAnnotationLayer } from "@/components/pathology/wsi-annotation-layer";
import { usePathologyAuth } from "./pathology-auth-provider";
import { type WholeSlideImage, type WsiPyramid, wsiPyramidApiUrl } from "../_lib/pathology-api";

export function OrthancWsiViewer({ slide, fillHeight = false }: { slide: WholeSlideImage; fillHeight?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [toolbarElement, setToolbarElement] = useState<HTMLDivElement | null>(null);
  const { authorizedFetch, authorizationHeader } = usePathologyAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<OpenSeadragonType.Viewer | null>(null);
  const [pyramid, setPyramid] = useState<WsiPyramid | null>(null);

  useEffect(() => {
    let disposed = false;
    let viewer: OpenSeadragonType.Viewer | null = null;

    void Promise.all([
      authorizedFetch(wsiPyramidApiUrl(slide.id)),
      import("openseadragon"),
    ])
      .then(async ([response, module]) => ({
        pyramid: (await response.json()) as WsiPyramid,
        OpenSeadragon: module.default,
      }))
      .then(({ pyramid, OpenSeadragon }) => {
        if (disposed || !containerRef.current) return;
        const maxLevel = pyramid.resolutions.length - 1;
        viewer = OpenSeadragon({
          element: containerRef.current,
          showNavigationControl: false,
          loadTilesWithAjax: true,
          ajaxHeaders: authorizationHeader ? { Authorization: authorizationHeader } : {},
          gestureSettingsMouse: { clickToZoom: false },
          tileSources: {
            width: pyramid.width,
            height: pyramid.height,
            tileWidth: pyramid.tile_width,
            tileHeight: pyramid.tile_height,
            minLevel: 0,
            maxLevel,
            getTileUrl(level: number, x: number, y: number) {
              const orthancLevel = maxLevel - level;
              return pyramid.tile_url_template
                .replace("{level}", String(orthancLevel))
                .replace("{x}", String(x))
                .replace("{y}", String(y));
            },
          },
        });
        setViewer(viewer);
        setPyramid(pyramid);
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
      setViewer(null);
      setPyramid(null);
      viewer?.destroy();
    };
  }, [authorizationHeader, authorizedFetch, slide.id]);

  return <div className={`flex flex-col overflow-hidden bg-slate-950 ${fillHeight ? "h-full min-h-0" : "min-h-[420px]"}`}>
    <div className="flex min-h-9 shrink-0 items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 px-2"><span className="text-[10px] font-semibold text-slate-300">WSI / Annotation</span><div ref={setToolbarElement} className="flex min-w-0 items-center overflow-x-auto" /></div>
    <div className="relative min-h-0 flex-1" data-wsi-layer="image">
    <div ref={containerRef} className="absolute inset-0" aria-label={`${slide.slide_code} WSI 뷰어`} />
    {viewer && pyramid ? <WsiAnnotationLayer key={`${slide.id}:${slide.image_asset_id}`} viewer={viewer} toolbarElement={toolbarElement} endpoint={`${process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? ""}/api/pathology/wsis/${slide.id}/annotations/`} imageAssetId={slide.image_asset_id} slideId={slide.id} imageWidth={pyramid.width} imageHeight={pyramid.height} authorizedFetch={authorizedFetch} writable /> : null}
    {loading && <div className="absolute inset-0 grid place-items-center text-sm text-slate-300">WSI 불러오는 중...</div>}
    {error && <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red-300">{error}</div>}
    {!loading && !error && <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-950/75 px-2 py-1 text-xs text-white">휠 확대·축소 · 드래그 이동</div>}
    </div>
  </div>;
}
