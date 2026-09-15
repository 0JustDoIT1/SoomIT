"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { sortSeriesFiles, type DicomHeaderInfo } from "../_lib/dicom-header";
import { ensureCornerstoneInitialized } from "../_lib/cornerstone-init";

function truncateUid(uid: string | null) {
  if (!uid) return "-";
  if (uid.length <= 16) return uid;
  return `${uid.slice(0, 8)}…${uid.slice(-4)}`;
}

/**
 * Renders a single representative slice from a selected DICOM Series using Cornerstone3D.
 * Scope is intentionally limited to a static single-frame preview: no scroll, MPR, or volume rendering.
 */
export function CtSeriesPreview({ seriesFiles }: { seriesFiles: DicomHeaderInfo[] }) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId();
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const sortedFiles = useMemo(() => sortSeriesFiles(seriesFiles), [seriesFiles]);
  const previewIndex = sortedFiles.length > 0 ? Math.floor(sortedFiles.length / 2) : -1;
  const previewHeader = previewIndex >= 0 ? sortedFiles[previewIndex] : null;

  useEffect(() => {
    const element = elementRef.current;
    if (!previewHeader || !element) return;

    let cancelled = false;
    let renderingEngine: import("@cornerstonejs/core").RenderingEngine | null = null;
    setStatus("loading");

    ensureCornerstoneInitialized()
      .then(({ core, dicomImageLoader }) => {
        if (cancelled) return;
        const imageId = dicomImageLoader.wadouri.fileManager.add(previewHeader.file);
        const viewportId = `ct-preview-viewport-${reactId}`;
        renderingEngine = new core.RenderingEngine(`ct-preview-engine-${reactId}`);
        renderingEngine.enableElement({
          viewportId,
          type: core.Enums.ViewportType.STACK,
          element,
        });
        const viewport = renderingEngine.getViewport(viewportId) as InstanceType<typeof core.StackViewport>;
        return viewport.setStack([imageId]).then(() => {
          if (cancelled) return;
          viewport.render();
          setStatus("ready");
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      renderingEngine?.destroy();
    };
  }, [previewHeader, reactId]);

  if (!previewHeader) return null;

  return (
    <div className="mt-3 space-y-2">
      <div ref={elementRef} className="h-72 w-full bg-black" />
      {status === "loading" ? <p className="text-xs text-slate-500">대표 영상 렌더링 중…</p> : null}
      {status === "error" ? <p className="text-xs text-red-600">대표 영상을 불러오지 못했습니다.</p> : null}
      <div className="space-y-0.5 text-xs text-slate-600">
        <p className="font-medium text-slate-800">{previewHeader.seriesDescription || "설명 없음"}</p>
        <p>전체 slice 수: {sortedFiles.length}건 · 대표 slice: {previewIndex + 1}번째</p>
        <p>Study {truncateUid(previewHeader.studyInstanceUid)} · Series {truncateUid(previewHeader.seriesInstanceUid)}</p>
      </div>
    </div>
  );
}
