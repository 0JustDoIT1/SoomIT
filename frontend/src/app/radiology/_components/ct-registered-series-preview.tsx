"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ensureCornerstoneInitialized } from "../_lib/cornerstone-init";
import { loadCtDicomWebSeries } from "../_lib/cornerstone-dicomweb-loader";

export function CtRegisteredSeriesPreview({ orderId, assetId }: { orderId: string; assetId: string }) {
  return <CtRegisteredSeriesPreviewContent key={`${orderId}:${assetId}`} orderId={orderId} assetId={assetId} />;
}

function CtRegisteredSeriesPreviewContent({ orderId, assetId }: { orderId: string; assetId: string }) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const [imageId, setImageId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // Each Cornerstone rendering engine owns WebGL contexts. Completed-exam
  // history can contain many closed CT records; mounting every preview at once
  // exhausts the browser's context limit and blanks the active workstation.
  // Only the preview currently near the viewport is allowed to allocate one.
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() => setIsVisible(true));
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "160px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || imageId) return;
    let cancelled = false;
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
  }, [assetId, imageId, isVisible, orderId]);

  useEffect(() => {
    const element = elementRef.current;
    if (!isVisible || !imageId || !element) return;
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
  }, [imageId, isVisible, reactId]);

  return (
    <div className="mt-3 space-y-2">
      <div ref={elementRef} className="h-72 w-full bg-black" />
      {status === "loading" ? <p className="text-xs text-slate-500">대표 slice 불러오는 중…</p> : null}
      {status === "error" ? <p className="text-xs text-red-600">대표 slice를 불러오지 못했습니다.</p> : null}
    </div>
  );
}
