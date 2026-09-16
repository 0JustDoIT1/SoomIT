"use client";

import { useEffect, useRef, useState } from "react";

import { ensureCornerstoneInitialized } from "@/app/radiology/_lib/cornerstone-init";
import { loadCtDicomWebSeries } from "@/app/radiology/_lib/cornerstone-dicomweb-loader";
import { fetchRadiologyAnalysisResult } from "@/app/radiology/_lib/radiology-api";
import { loadCtCornerstoneSegmentation, type CtCornerstoneSegmentation } from "@/app/radiology/_lib/cornerstone-labelmap";
import { attachCtCornerstoneLabelmapOverlay } from "@/app/radiology/_lib/cornerstone-labelmap-overlay";

type CtDicomViewerProps = {
  orderId: string;
  assetId: string;
  analysisId?: string;
};

type ViewKey = "axial" | "coronal" | "sagittal" | "volume3d";

const TOOL_GROUP_ID = "ct-dicom-viewer-mpr-tools";
const VOLUME3D_TOOL_GROUP_ID = "ct-dicom-viewer-volume3d-tools";
const AXIAL_VIEWPORT_ID = "ct-dicom-viewer-axial";
const CORONAL_VIEWPORT_ID = "ct-dicom-viewer-coronal";
const SAGITTAL_VIEWPORT_ID = "ct-dicom-viewer-sagittal";
const VOLUME3D_VIEWPORT_ID = "ct-dicom-viewer-volume3d";
const MPR_VIEWPORT_IDS = [AXIAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID];
const VOLUME3D_PRESET = "CT-Lung";

const VIEW_LABELS: Record<ViewKey, string> = {
  axial: "Axial",
  coronal: "Coronal",
  sagittal: "Sagittal",
  volume3d: "3D Volume",
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
  const axialRef = useRef<HTMLDivElement>(null);
  const coronalRef = useRef<HTMLDivElement>(null);
  const sagittalRef = useRef<HTMLDivElement>(null);
  const volume3dRef = useRef<HTMLDivElement>(null);
  // Hand-drawn labelmap overlay canvases, layered on top of each MPR
  // viewport's own Cornerstone canvas - see cornerstone-labelmap-overlay.ts.
  const axialOverlayRef = useRef<HTMLCanvasElement>(null);
  const coronalOverlayRef = useRef<HTMLCanvasElement>(null);
  const sagittalOverlayRef = useRef<HTMLCanvasElement>(null);

  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [viewerError, setViewerError] = useState("");
  const [seriesProgress, setSeriesProgress] = useState({ loaded: 0, total: 0 });
  // null = 2x2 grid; otherwise the single view shown full-size. Purely a layout
  // switch - the underlying viewports/volume are never rebuilt by this.
  const [focusedView, setFocusedView] = useState<ViewKey | null>(null);

  const imageIdsRef = useRef<string[] | null>(null);
  const noduleFocusWorldRef = useRef<[number, number, number] | null>(null);
  // All 4 viewports are built once per series and kept alive for the component's
  // lifetime; this ref lets the maximize/restore effect resize them without
  // rebuilding anything.
  const renderingEngineRef = useRef<import("@cornerstonejs/core").RenderingEngine | null>(null);
  // Caches the loaded labelmap data across re-renders, keyed by analysis+
  // volume, so it is only downloaded once per series.
  const segmentationCacheRef = useRef<{ key: string; segmentation: CtCornerstoneSegmentation } | null>(null);

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

  // Builds all 4 fixed views (Axial/Coronal/Sagittal MPR + voxel 3D volume
  // rendering) once per series. Clicking a view to maximize it never re-enters
  // this effect - see the focusedView-resize effect below, which only resizes
  // the already-built viewports.
  useEffect(() => {
    if (loading || error || !imageIdsRef.current) return;
    let disposed = false;
    let renderingEngine: import("@cornerstonejs/core").RenderingEngine | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let removeProgressListener: (() => void) | null = null;
    let cleanupCornerstoneState: (() => void) | null = null;
    let removeDevListeners: (() => void) | null = null;
    const overlayCleanups: Array<() => void> = [];

    void (async () => {
      const { core, tools } = await ensureCornerstoneInitialized();
      if (disposed) return;
      if (!axialRef.current || !coronalRef.current || !sagittalRef.current || !volume3dRef.current) return;
      setBuilding(true);
      setViewerError("");
      const imageIds = imageIdsRef.current;
      if (!imageIds) return;

      if (process.env.NODE_ENV !== "production") {
        // These dev-only listeners were never removed on effect cleanup, so
        // every hot-reload/re-run of this effect added another copy - each
        // subsequent render event then fired N accumulated listeners,
        // compounding console/CPU overhead over a long dev session.
        const handleCornerstoneErrorEvent = (event: Event) => {
          console.error("[ct-dicom-viewer] Cornerstone ERROR_EVENT", (event as CustomEvent).detail);
        };
        core.eventTarget.addEventListener(core.Enums.Events.ERROR_EVENT, handleCornerstoneErrorEvent);
        removeDevListeners = () => {
          core.eventTarget.removeEventListener(core.Enums.Events.ERROR_EVENT, handleCornerstoneErrorEvent);
        };
      }

      renderingEngine = new core.RenderingEngine(`ct-dicom-viewer-engine-${assetId}`);
      renderingEngineRef.current = renderingEngine;

      const toolGroupId = `${TOOL_GROUP_ID}-${assetId}`;
      if (tools.ToolGroupManager.getToolGroup(toolGroupId)) tools.ToolGroupManager.destroyToolGroup(toolGroupId);
      const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId);
      const volume3dToolGroupId = `${VOLUME3D_TOOL_GROUP_ID}-${assetId}`;
      if (tools.ToolGroupManager.getToolGroup(volume3dToolGroupId)) tools.ToolGroupManager.destroyToolGroup(volume3dToolGroupId);
      const volume3dToolGroup = tools.ToolGroupManager.createToolGroup(volume3dToolGroupId);
      if (!toolGroup || !volume3dToolGroup) return;
      cleanupCornerstoneState = () => {
        tools.ToolGroupManager.destroyToolGroup(toolGroupId);
        tools.ToolGroupManager.destroyToolGroup(volume3dToolGroupId);
      };
      [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.StackScrollTool, tools.TrackballRotateTool].forEach(
        (ToolClass) => tools.addTool(ToolClass),
      );
      [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.StackScrollTool].forEach((ToolClass) =>
        toolGroup.addTool(ToolClass.toolName),
      );
      toolGroup.setToolActive(tools.WindowLevelTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] });
      toolGroup.setToolActive(tools.PanTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Auxiliary }] });
      toolGroup.setToolActive(tools.ZoomTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Secondary }] });
      toolGroup.setToolActive(tools.StackScrollTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }] });
      // The 3D volume-rendering view rotates/pans/zooms instead of windowing by drag.
      [tools.TrackballRotateTool, tools.PanTool, tools.ZoomTool].forEach((ToolClass) =>
        volume3dToolGroup.addTool(ToolClass.toolName),
      );
      volume3dToolGroup.setToolActive(tools.TrackballRotateTool.toolName, {
        bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
      });
      volume3dToolGroup.setToolActive(tools.PanTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Auxiliary }] });
      volume3dToolGroup.setToolActive(tools.ZoomTool.toolName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Secondary }] });

      renderingEngine.setViewports([
        {
          viewportId: AXIAL_VIEWPORT_ID,
          element: axialRef.current,
          type: core.Enums.ViewportType.ORTHOGRAPHIC,
          defaultOptions: { orientation: core.Enums.OrientationAxis.AXIAL },
        },
        {
          viewportId: CORONAL_VIEWPORT_ID,
          element: coronalRef.current,
          type: core.Enums.ViewportType.ORTHOGRAPHIC,
          defaultOptions: { orientation: core.Enums.OrientationAxis.CORONAL },
        },
        {
          viewportId: SAGITTAL_VIEWPORT_ID,
          element: sagittalRef.current,
          type: core.Enums.ViewportType.ORTHOGRAPHIC,
          defaultOptions: { orientation: core.Enums.OrientationAxis.SAGITTAL },
        },
        {
          viewportId: VOLUME3D_VIEWPORT_ID,
          element: volume3dRef.current,
          type: core.Enums.ViewportType.VOLUME_3D,
        },
      ]);
      MPR_VIEWPORT_IDS.forEach((viewportId) => toolGroup.addViewport(viewportId, renderingEngine!.id));
      volume3dToolGroup.addViewport(VOLUME3D_VIEWPORT_ID, renderingEngine.id);

      const volumeId = `cornerstoneStreamingImageVolume:${orderId}:${assetId}`;
      const handleVolumeProgress = (event: Event) => {
        const detail = (event as CustomEvent<{ volumeId?: string; framesProcessed?: number; numberOfFrames?: number }>).detail;
        if (detail?.volumeId !== volumeId) return;
        setSeriesProgress({ loaded: detail.framesProcessed ?? 0, total: detail.numberOfFrames ?? imageIds.length });
      };
      core.eventTarget.addEventListener(core.Enums.Events.IMAGE_VOLUME_MODIFIED, handleVolumeProgress);
      removeProgressListener = () => core.eventTarget.removeEventListener(core.Enums.Events.IMAGE_VOLUME_MODIFIED, handleVolumeProgress);

      const volume = await core.volumeLoader.createAndCacheVolume(volumeId, { imageIds, progressiveRendering: true });
      if (disposed) return;
      const allViewportIds = [...MPR_VIEWPORT_IDS, VOLUME3D_VIEWPORT_ID];
      await core.setVolumesForViewports(renderingEngine, [{ volumeId }], allViewportIds);

      const volume3dViewport = renderingEngine.getViewport(VOLUME3D_VIEWPORT_ID) as InstanceType<typeof core.VolumeViewport3D>;
      const preset = core.CONSTANTS.VIEWPORT_PRESETS.find((item) => item.name === VOLUME3D_PRESET);
      if (preset) {
        const actorEntry = volume3dViewport.getDefaultActor();
        if (actorEntry?.actor) {
          core.utilities.applyPreset(actorEntry.actor as import("@cornerstonejs/core").Types.VolumeActor, preset);
        }
      }

      const noduleFocusWorld = noduleFocusWorldRef.current;
      if (noduleFocusWorld) {
        MPR_VIEWPORT_IDS.forEach((viewportId) => {
          const viewport = renderingEngine?.getViewport(viewportId) as InstanceType<typeof core.VolumeViewport>;
          viewport.jumpToWorld(noduleFocusWorld);
        });
      }
      renderingEngine.render();
      if ("load" in volume && typeof volume.load === "function") {
        volume.load((event) => {
          if (disposed) return;
          const progress = event as { framesProcessed?: number; totalNumFrames?: number };
          setSeriesProgress({ loaded: progress.framesProcessed ?? imageIds.length, total: progress.totalNumFrames ?? imageIds.length });
          renderingEngine?.render();
        });
      }

      if (analysisId) {
        try {
          const segmentationKey = `${analysisId}:${volumeId}`;
          let segmentation = segmentationCacheRef.current?.key === segmentationKey
            ? segmentationCacheRef.current.segmentation
            : null;
          if (!segmentation) {
            segmentation = await loadCtCornerstoneSegmentation(analysisId);
            if (disposed) return;
            segmentationCacheRef.current = { key: segmentationKey, segmentation };
          }
          const overlayTargets: Array<[string, "axial" | "coronal" | "sagittal", HTMLDivElement | null, HTMLCanvasElement | null]> = [
            [AXIAL_VIEWPORT_ID, "axial", axialRef.current, axialOverlayRef.current],
            [CORONAL_VIEWPORT_ID, "coronal", coronalRef.current, coronalOverlayRef.current],
            [SAGITTAL_VIEWPORT_ID, "sagittal", sagittalRef.current, sagittalOverlayRef.current],
          ];
          for (const [viewportId, orientation, container, overlayCanvas] of overlayTargets) {
            if (!container || !overlayCanvas || !renderingEngine) continue;
            overlayCleanups.push(
              attachCtCornerstoneLabelmapOverlay(core, viewportId, orientation, container, overlayCanvas, renderingEngine, segmentation),
            );
          }
          // The labelmap overlay is only drawn on the 2D MPR canvases; the 3D
          // volume-rendering view stays CT-only.
        } catch (reason) {
          if (!disposed) {

            console.error("[ct-dicom-viewer] segmentation setup failed", reason);
            setViewerError(reason instanceof Error ? `Segmentation을 불러오지 못했습니다: ${reason.message}` : "Segmentation을 불러오지 못했습니다.");
          }
        }
      }

      resizeObserver = new ResizeObserver(() => renderingEngine?.resize());
      [axialRef.current, coronalRef.current, sagittalRef.current, volume3dRef.current]
        .filter((element): element is HTMLDivElement => Boolean(element))
        .forEach((element) => resizeObserver?.observe(element));
      if (!disposed) setBuilding(false);
    })().catch((reason: unknown) => {
      if (!disposed) {
        setViewerError(reason instanceof Error ? reason.message : "CT 뷰어를 초기화하지 못했습니다.");
        setBuilding(false);
      }
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      removeProgressListener?.();
      removeDevListeners?.();
      overlayCleanups.forEach((cleanup) => cleanup());
      cleanupCornerstoneState?.();
      renderingEngine?.destroy();
      renderingEngineRef.current = null;
    };
  }, [loading, error, analysisId, orderId, assetId]);

  // Pure layout switch: maximizing/restoring a view never re-fetches or rebuilds
  // anything - the already-built viewports just need a resize once their
  // container's on-screen size changes (they had zero size while hidden).
  useEffect(() => {
    renderingEngineRef.current?.resize(true, true);
  }, [focusedView]);

  // Segmentation cache is only cleared when the series/analysis actually
  // changes or the viewer unmounts - it's a plain JS object (metadata + a
  // typed array), so there's no Cornerstone-side state to tear down.
  useEffect(() => {
    return () => {
      segmentationCacheRef.current = null;
    };
  }, [analysisId, orderId, assetId]);

  const views: Array<{ key: ViewKey; ref: React.RefObject<HTMLDivElement | null> }> = [
    { key: "axial", ref: axialRef },
    { key: "coronal", ref: coronalRef },
    { key: "sagittal", ref: sagittalRef },
    { key: "volume3d", ref: volume3dRef },
  ];

  const overlayRefs: Partial<Record<ViewKey, React.RefObject<HTMLCanvasElement | null>>> = {
    axial: axialOverlayRef,
    coronal: coronalOverlayRef,
    sagittal: sagittalOverlayRef,
  };

  return (
    <div className="grid min-h-[420px] overflow-hidden bg-slate-950">
      <div className="relative min-h-[420px]">
        {focusedView && (
          <button
            type="button"
            onClick={() => setFocusedView(null)}
            className="absolute right-2 top-2 z-20 rounded bg-black/60 px-2 py-1 text-[9px] font-semibold text-white"
          >
            전체보기
          </button>
        )}

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

        <div className={`absolute inset-0 ${focusedView ? "" : "grid grid-cols-2 grid-rows-2 gap-px bg-slate-800"}`}>
          {views.map(({ key, ref }) => (
            <div
              key={key}
              className={`bg-slate-950 ${
                focusedView ? (focusedView === key ? "absolute inset-0" : "hidden") : "relative"
              }`}
            >
              <div ref={ref} className="absolute inset-0" aria-label={`CT ${VIEW_LABELS[key]} viewer`} />
              {overlayRefs[key] && (
                <canvas ref={overlayRefs[key]} className="pointer-events-none absolute inset-0" />
              )}
              <button
                type="button"
                onClick={() => setFocusedView((current) => (current === key ? null : key))}
                className="absolute left-1.5 top-1.5 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-semibold text-white"
              >
                {VIEW_LABELS[key]} {focusedView === key ? "· 축소" : "· 확대"}
              </button>
            </div>
          ))}
        </div>

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
        {building && !loading && (
          <div className="absolute bottom-2 left-2 z-20 rounded bg-black/70 px-2 py-1 text-[9px] text-slate-300">뷰어 구성 중…</div>
        )}
      </div>
    </div>
  );
}
