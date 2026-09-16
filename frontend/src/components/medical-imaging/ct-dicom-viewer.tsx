"use client";

import { useEffect, useRef, useState } from "react";

import { ensureCornerstoneInitialized } from "@/app/radiology/_lib/cornerstone-init";
import { loadCtDicomWebSeries } from "@/app/radiology/_lib/cornerstone-dicomweb-loader";
import { fetchRadiologyAnalysisResult } from "@/app/radiology/_lib/radiology-api";
import {
  applyCtCornerstoneSegmentationToViewport,
  loadCtCornerstoneSegmentation,
  type CtCornerstoneSegmentation,
} from "@/app/radiology/_lib/cornerstone-labelmap";

type CtDicomViewerProps = {
  orderId: string;
  assetId: string;
  analysisId?: string;
};

type ViewMode = "2D" | "3D";

const TOOL_GROUP_ID = "ct-dicom-viewer-tools";
const STACK_VIEWPORT_ID = "ct-dicom-viewer-stack";
const AXIAL_VIEWPORT_ID = "ct-dicom-viewer-axial";
const CORONAL_VIEWPORT_ID = "ct-dicom-viewer-coronal";
const SAGITTAL_VIEWPORT_ID = "ct-dicom-viewer-sagittal";

const CATEGORY_LABELS: Record<string, string> = {
  NODULE: "병변",
  LUNG_LOBE: "폐엽",
  ANATOMY: "해부 구조",
};

function getNoduleFocusWorld(result: unknown): [number, number, number] | null {
  if (!result || typeof result !== "object" || !("result" in result)) return null;
  const detail = result.result;
  if (!detail || typeof detail !== "object" || !("nodules" in detail) || !Array.isArray(detail.nodules)) return null;
  const firstNodule = detail.nodules[0];
  if (!firstNodule || typeof firstNodule !== "object" || !("finding_payload" in firstNodule)) return null;
  const payload = firstNodule.finding_payload;
  if (!payload || typeof payload !== "object" || !("quantification" in payload)) return null;
  const quantification = payload.quantification;
  if (!quantification || typeof quantification !== "object" || !("centroid_world_xyz_mm" in quantification)) return null;
  const centroid = quantification.centroid_world_xyz_mm;
  if (!Array.isArray(centroid) || centroid.length !== 3) return null;
  const [x, y, z] = centroid;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return null;
  return [-x, -y, z];
}

export function CtDicomViewer({ orderId, assetId, analysisId }: CtDicomViewerProps) {
  const stackRef = useRef<HTMLDivElement>(null);
  const axialRef = useRef<HTMLDivElement>(null);
  const coronalRef = useRef<HTMLDivElement>(null);
  const sagittalRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<ViewMode>("2D");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewerError, setViewerError] = useState("");
  const [seriesProgress, setSeriesProgress] = useState({ loaded: 0, total: 0 });
  const [segmentation, setSegmentation] = useState<CtCornerstoneSegmentation | null>(null);
  const [visibility, setVisibility] = useState<Record<number, boolean>>({});
  const [opacity, setOpacity] = useState<Record<number, number>>({});

  const imageIdsRef = useRef<string[] | null>(null);
  const noduleFocusWorldRef = useRef<[number, number, number] | null>(null);
  const viewportIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let disposed = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    setSeriesProgress({ loaded: 0, total: 0 });
    Promise.all([
      loadCtDicomWebSeries(orderId, assetId),
      analysisId ? fetchRadiologyAnalysisResult(analysisId).catch(() => null) : Promise.resolve(null),
    ])
      .then(([{ imageIds }, analysisResult]) => {
        if (disposed) return;
        imageIdsRef.current = imageIds;
        noduleFocusWorldRef.current = getNoduleFocusWorld(analysisResult);
        setSeriesProgress({ loaded: 0, total: imageIds.length });
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(reason instanceof Error ? reason.message : "CT Series를 불러오지 못했습니다.");
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
    };
  }, [orderId, assetId, analysisId]);

  useEffect(() => {
    if (loading || error || !imageIdsRef.current) return;
    let disposed = false;
    let renderingEngine: import("@cornerstonejs/core").RenderingEngine | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let removeProgressListeners: (() => void) | null = null;
    let disableStackPrefetch: (() => void) | null = null;
    let cleanupCornerstoneState: (() => void) | null = null;

    void (async () => {
      const { core, tools } = await ensureCornerstoneInitialized();
      if (disposed) return;
      setViewerError("");
      const imageIds = imageIdsRef.current;
      if (!imageIds) return;
      const imageIdSet = new Set(imageIds);
      const loadedImageIds = new Set<string>();
      const handleImageLoaded = (event: Event) => {
        const imageId = (event as CustomEvent<{ image?: { imageId?: string } }>).detail?.image?.imageId;
        if (!imageId || !imageIdSet.has(imageId)) return;
        loadedImageIds.add(imageId);
        setSeriesProgress({ loaded: loadedImageIds.size, total: imageIds.length });
      };
      core.eventTarget.addEventListener(core.Enums.Events.IMAGE_LOADED, handleImageLoaded);
      removeProgressListeners = () => {
        core.eventTarget.removeEventListener(core.Enums.Events.IMAGE_LOADED, handleImageLoaded);
      };

      renderingEngine = new core.RenderingEngine(`ct-dicom-viewer-engine-${assetId}-${mode}`);

      const toolGroupId = `${TOOL_GROUP_ID}-${assetId}-${mode}`;
      if (tools.ToolGroupManager.getToolGroup(toolGroupId)) {
        tools.ToolGroupManager.destroyToolGroup(toolGroupId);
      }
      const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId);
      if (!toolGroup) return;
      cleanupCornerstoneState = () => tools.ToolGroupManager.destroyToolGroup(toolGroupId);
      [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.StackScrollTool].forEach((ToolClass) => {
        tools.addTool(ToolClass);
        toolGroup?.addTool(ToolClass.toolName);
      });
      toolGroup.setToolActive(tools.WindowLevelTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
      });
      toolGroup.setToolActive(tools.PanTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Auxiliary }],
      });
      toolGroup.setToolActive(tools.ZoomTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Secondary }],
      });
      toolGroup.setToolActive(tools.StackScrollTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }],
      });

      if (mode === "2D") {
        if (!stackRef.current) return;
        renderingEngine.enableElement({
          viewportId: STACK_VIEWPORT_ID,
          type: core.Enums.ViewportType.STACK,
          element: stackRef.current,
        });
        const viewport = renderingEngine.getViewport(STACK_VIEWPORT_ID) as InstanceType<typeof core.StackViewport>;
        await viewport.setStack(imageIds, Math.floor(imageIds.length / 2));
        const noduleFocusWorld = noduleFocusWorldRef.current;
        if (noduleFocusWorld) viewport.jumpToWorld(noduleFocusWorld);
        viewport.render();
        tools.utilities.stackPrefetch.setConfiguration({
          maxImagesToPrefetch: imageIds.length,
          preserveExistingPool: true,
        });
        tools.utilities.stackPrefetch.enable(stackRef.current);
        disableStackPrefetch = () => {
          if (stackRef.current) tools.utilities.stackPrefetch.disable(stackRef.current);
        };
        toolGroup.addViewport(STACK_VIEWPORT_ID, renderingEngine.id);
        viewportIdsRef.current = [STACK_VIEWPORT_ID];
      } else {
        if (!axialRef.current || !coronalRef.current || !sagittalRef.current) return;
        const viewportInputs = [
          { viewportId: AXIAL_VIEWPORT_ID, element: axialRef.current, orientation: core.Enums.OrientationAxis.AXIAL },
          { viewportId: CORONAL_VIEWPORT_ID, element: coronalRef.current, orientation: core.Enums.OrientationAxis.CORONAL },
          { viewportId: SAGITTAL_VIEWPORT_ID, element: sagittalRef.current, orientation: core.Enums.OrientationAxis.SAGITTAL },
        ];
        renderingEngine.setViewports(
          viewportInputs.map(({ viewportId, element, orientation }) => ({
            viewportId,
            element,
            type: core.Enums.ViewportType.ORTHOGRAPHIC,
            defaultOptions: { orientation },
          })),
        );
        const viewportIds = viewportInputs.map((item) => item.viewportId);
        viewportIdsRef.current = viewportIds;

        const volumeId = `cornerstoneStreamingImageVolume:${orderId}:${assetId}`;
        const handleVolumeProgress = (event: Event) => {
          const detail = (event as CustomEvent<{
            volumeId?: string;
            framesProcessed?: number;
            numberOfFrames?: number;
          }>).detail;
          if (detail?.volumeId !== volumeId) return;
          setSeriesProgress({
            loaded: detail.framesProcessed ?? 0,
            total: detail.numberOfFrames ?? imageIds.length,
          });
        };
        core.eventTarget.addEventListener(core.Enums.Events.IMAGE_VOLUME_MODIFIED, handleVolumeProgress);
        const removeImageProgressListener = removeProgressListeners;
        removeProgressListeners = () => {
          removeImageProgressListener?.();
          core.eventTarget.removeEventListener(core.Enums.Events.IMAGE_VOLUME_MODIFIED, handleVolumeProgress);
        };
        const volume = await core.volumeLoader.createAndCacheVolume(volumeId, {
          imageIds,
          progressiveRendering: true,
        });
        await core.setVolumesForViewports(renderingEngine, [{ volumeId }], viewportIds);
        viewportIds.forEach((viewportId) => toolGroup?.addViewport(viewportId, renderingEngine!.id));
        const noduleFocusWorld = noduleFocusWorldRef.current;
        if (noduleFocusWorld) {
          viewportIds.forEach((viewportId) => {
            const viewport = renderingEngine?.getViewport(viewportId) as InstanceType<typeof core.VolumeViewport>;
            viewport.jumpToWorld(noduleFocusWorld);
          });
        }
        renderingEngine.render();
        if ("load" in volume && typeof volume.load === "function") {
          volume.load((event) => {
            if (disposed) return;
            const progress = event as { framesProcessed?: number; totalNumFrames?: number };
            setSeriesProgress({
              loaded: progress.framesProcessed ?? imageIds.length,
              total: progress.totalNumFrames ?? imageIds.length,
            });
            renderingEngine?.render();
          });
        }

        if (analysisId) {
          try {
            const loaded = await loadCtCornerstoneSegmentation(analysisId, volumeId);
            if (disposed) {
              tools.segmentation.removeSegmentation(loaded.segmentationId);
              core.cache.removeVolumeLoadObject(loaded.segmentationId);
              return;
            }
            const previousCleanup = cleanupCornerstoneState;
            cleanupCornerstoneState = () => {
              previousCleanup?.();
              tools.segmentation.removeSegmentation(loaded.segmentationId);
              core.cache.removeVolumeLoadObject(loaded.segmentationId);
            };
            for (const viewportId of viewportIds) {
              await applyCtCornerstoneSegmentationToViewport(viewportId, loaded);
            }
            setSegmentation(loaded);
            setVisibility(
              Object.fromEntries(loaded.metadata.segments.map((segment) => [segment.segment_index, segment.default_visible ?? true])),
            );
            setOpacity(
              Object.fromEntries(loaded.metadata.segments.map((segment) => [segment.segment_index, segment.default_opacity ?? 0.5])),
            );
            renderingEngine?.render();
          } catch {
            if (!disposed) setViewerError("Segmentation을 불러오지 못했습니다.");
          }
        }
      }
      resizeObserver = new ResizeObserver(() => renderingEngine?.resize());
      [stackRef.current, axialRef.current, coronalRef.current, sagittalRef.current]
        .filter((element): element is HTMLDivElement => Boolean(element))
        .forEach((element) => resizeObserver?.observe(element));
    })().catch((reason: unknown) => {
      if (!disposed) {
        setViewerError(reason instanceof Error ? reason.message : "CT 뷰어를 초기화하지 못했습니다.");
      }
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      disableStackPrefetch?.();
      removeProgressListeners?.();
      cleanupCornerstoneState?.();
      renderingEngine?.destroy();
    };
  }, [loading, error, mode, analysisId, orderId, assetId]);

  // Synchronizes React state (visibility/opacity) to Cornerstone's own segmentation
  // state, an external system, whenever either changes - never read directly from
  // an event handler so a ref-in-render lint check can't flag it.
  useEffect(() => {
    if (!segmentation) return;
    let disposed = false;
    void (async () => {
      const { tools, core } = await ensureCornerstoneInitialized();
      if (disposed) return;
      for (const viewportId of viewportIdsRef.current) {
        for (const segment of segmentation.metadata.segments) {
          const visible = visibility[segment.segment_index] ?? segment.default_visible ?? true;
          tools.segmentation.config.visibility.setSegmentIndexVisibility(
            viewportId,
            { segmentationId: segmentation.segmentationId },
            segment.segment_index,
            visible,
          );
          const fillAlpha = opacity[segment.segment_index] ?? segment.default_opacity ?? 0.5;
          tools.segmentation.segmentationStyle.setStyle(
            {
              type: tools.Enums.SegmentationRepresentations.Labelmap,
              viewportId,
              segmentationId: segmentation.segmentationId,
              segmentIndex: segment.segment_index,
            },
            {
              fillAlpha,
              renderFill: true,
              renderOutline: segment.category === "NODULE",
              outlineWidth: segment.category === "NODULE" ? 2 : 1,
            },
          );
        }
      }
      core.getRenderingEngines()?.forEach((engine) => engine.render());
    })();
    return () => {
      disposed = true;
    };
  }, [segmentation, visibility, opacity]);

  const groupedSegments = new Map<string, CtCornerstoneSegmentation["metadata"]["segments"]>();
  for (const segment of segmentation?.metadata.segments ?? []) {
    const bucket = groupedSegments.get(segment.category) ?? [];
    bucket.push(segment);
    groupedSegments.set(segment.category, bucket);
  }

  return (
    <div className="grid min-h-[420px] grid-cols-[1fr_190px] overflow-hidden bg-slate-950">
      <div className="relative min-h-0">
        <div className="absolute right-2 top-2 z-20 flex gap-1">
          <button
            type="button"
            onClick={() => setMode("2D")}
            className={`rounded px-2 py-1 text-[9px] font-semibold ${mode === "2D" ? "bg-blue-600 text-white" : "bg-black/60 text-white"}`}
          >
            2D
          </button>
          <button
            type="button"
            onClick={() => setMode("3D")}
            className={`rounded px-2 py-1 text-[9px] font-semibold ${mode === "3D" ? "bg-blue-600 text-white" : "bg-black/60 text-white"}`}
          >
            3D (MPR)
          </button>
        </div>

        {seriesProgress.total > 0 && seriesProgress.loaded < seriesProgress.total && (
          <div className="absolute left-1/2 top-3 z-20 w-56 -translate-x-1/2 rounded bg-black/80 px-3 py-2 text-[10px] font-semibold text-white shadow-lg">
            CT 데이터 로딩 {seriesProgress.loaded}/{seriesProgress.total}
            <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-700">
              <div
                className="h-full rounded bg-blue-500 transition-[width]"
                style={{ width: `${Math.round((seriesProgress.loaded / seriesProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {mode === "2D" ? (
          <div ref={stackRef} className="absolute inset-0" aria-label="CT Axial viewer" />
        ) : (
          <div className="absolute inset-0 grid grid-cols-3">
            <div ref={axialRef} aria-label="CT Axial viewer" />
            <div ref={coronalRef} aria-label="CT Coronal viewer" />
            <div ref={sagittalRef} aria-label="CT Sagittal viewer" />
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 grid place-items-center text-xs font-semibold text-slate-300">
            CT Series를 불러오는 중입니다.
          </div>
        )}
        {!loading && (error || viewerError) && (
          <div role="alert" className="absolute bottom-2 left-2 right-2 rounded bg-rose-950/80 px-2 py-1 text-[10px] text-rose-200">
            {error || viewerError}
          </div>
        )}
      </div>

      <aside className="min-h-0 overflow-y-auto border-l border-slate-800 bg-slate-900 p-2" aria-label="Segmentation 목록">
        {mode === "2D" ? (
          <p className="text-[9px] text-slate-500">Segmentation overlay는 3D(MPR) 모드에서 표시됩니다.</p>
        ) : segmentation ? (
          [...groupedSegments.entries()].map(([category, segments]) => (
            <div key={category} className="mb-3">
              <p className="mb-1 text-[9px] font-semibold text-slate-400">{CATEGORY_LABELS[category] ?? category}</p>
              <div className="space-y-1.5">
                {segments.map((segment) => (
                  <div key={segment.id} className="rounded bg-slate-800/60 px-1.5 py-1">
                    <label className="flex items-center gap-1.5 text-[9px] text-slate-200">
                      <input
                        type="checkbox"
                        checked={visibility[segment.segment_index] ?? segment.default_visible ?? true}
                        onChange={(event) =>
                          setVisibility((current) => ({ ...current, [segment.segment_index]: event.target.checked }))
                        }
                      />
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: `rgb(${segment.color.join(",")})` }}
                      />
                      <span className="truncate">{segment.name}</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={opacity[segment.segment_index] ?? segment.default_opacity ?? 0.5}
                      onChange={(event) =>
                        setOpacity((current) => ({ ...current, [segment.segment_index]: Number(event.target.value) }))
                      }
                      className="mt-1 w-full"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-[9px] text-slate-500">Segmentation을 불러오는 중입니다.</p>
        )}
      </aside>
    </div>
  );
}
