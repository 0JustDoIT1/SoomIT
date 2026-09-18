"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ensureCornerstoneInitialized } from "../_lib/cornerstone-init";
import { loadCtDicomWebSeries } from "../_lib/cornerstone-dicomweb-loader";

export function CtRegisteredSeriesPreview({ orderId, assetId }: { orderId: string; assetId: string }) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const [imageId, setImageId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void loadCtDicomWebSeries(orderId, assetId)
      .then(({ imageIds }) => {
        if (!cancelled && imageIds.length > 0) {
          setImageId(imageIds[Math.floor(imageIds.length / 2)]);
        } else if (!cancelled) {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => { cancelled = true; };
  }, [assetId, orderId]);

  useEffect(() => {
    const element = elementRef.current;
    if (!imageId || !element) return;
    let cancelled = false;
    let renderingEngine: import("@cornerstonejs/core").RenderingEngine | null = null;
    void ensureCornerstoneInitialized()
      .then(({ core }) => {
        if (cancelled) return;
        const viewportId = `ct-registered-preview-viewport-${reactId}`;
        renderingEngine = new core.RenderingEngine(`ct-registered-preview-engine-${reactId}`);
        renderingEngine.enableElement({
          viewportId,
          type: core.Enums.ViewportType.STACK,
          element,
        });
        const viewport = renderingEngine.getViewport(viewportId) as InstanceType<typeof core.StackViewport>;
        return viewport.setStack([imageId]).then(() => viewport.render());
      })
      .then(() => { if (!cancelled) setStatus("ready"); })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => {
      cancelled = true;
      renderingEngine?.destroy();
    };
  }, [imageId, reactId]);

  return (
    <div className="mt-3 space-y-2">
      <div ref={elementRef} className="h-72 w-full bg-black" />
      {status === "loading" ? <p className="text-xs text-slate-500">대표 slice 불러오는 중…</p> : null}
      {status === "error" ? <p className="text-xs text-red-600">대표 slice를 불러오지 못했습니다.</p> : null}
    </div>
  );
}
