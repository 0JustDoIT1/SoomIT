"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ensureCornerstoneInitialized } from "@/app/radiology/_lib/cornerstone-init";
import { loadCtDicomWebSeries } from "@/app/radiology/_lib/cornerstone-dicomweb-loader";
import { fetchRadiologyAnalysisResult } from "@/app/radiology/_lib/radiology-api";
import { loadCtCornerstoneSegmentation, type CtCornerstoneSegmentation } from "@/app/radiology/_lib/cornerstone-labelmap";
import { attachCtCornerstoneLabelmapOverlay } from "@/app/radiology/_lib/cornerstone-labelmap-overlay";

type CtDicomViewerProps = {
  orderId: string;
  assetId: string;
  analysisId?: string;
  loadSeries?: (orderId: string, assetId: string) => Promise<{ imageIds: string[] }>;
  loadSegmentation?: (analysisId: string) => Promise<CtCornerstoneSegmentation>;
};

type ViewKey = "axial" | "coronal" | "sagittal" | "volume3d";
type MprToolMode = "WL" | "ZOOM" | "PAN" | "LENGTH" | "ROI";
type MprToolGroup = Pick<import("@cornerstonejs/tools").Types.IToolGroup, "setToolActive" | "setToolPassive">;
type MprToolBindings = {
  primary: import("@cornerstonejs/tools").Enums.MouseBindings;
  secondary: import("@cornerstonejs/tools").Enums.MouseBindings;
  auxiliary: import("@cornerstonejs/tools").Enums.MouseBindings;
  wheel: import("@cornerstonejs/tools").Enums.MouseBindings;
  windowLevel: string;
  zoom: string;
  pan: string;
  stackScroll: string;
  length: string;
  rectangleRoi: string;
};

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

export function CtDicomViewer({ orderId, assetId, analysisId, loadSeries, loadSegmentation }: CtDicomViewerProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
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
  const [selectedView, setSelectedView] = useState<ViewKey>("axial");
  const [activeTool, setActiveTool] = useState<MprToolMode>("WL");

  const imageIdsRef = useRef<string[] | null>(null);
  const noduleFocusWorldRef = useRef<[number, number, number] | null>(null);
  // All 4 viewports are built once per series and kept alive for the component's
  // lifetime; this ref lets the maximize/restore effect resize them without
  // rebuilding anything.
  const renderingEngineRef = useRef<import("@cornerstonejs/core").RenderingEngine | null>(null);
  const mprToolGroupRef = useRef<MprToolGroup | null>(null);
  const mprToolBindingsRef = useRef<MprToolBindings | null>(null);
  const activeToolRef = useRef<MprToolMode>("WL");
  // Caches the loaded labelmap data across re-renders, keyed by analysis+
  // volume, so it is only downloaded once per series.
  const segmentationCacheRef = useRef<{ key: string; segmentation: CtCornerstoneSegmentation } | null>(null);

  const resetViewports = () => {
    renderingEngineRef.current?.getViewports().forEach((viewport) => {
      viewport.resetCamera();
      viewport.render();
    });
    setFocusedView(null);
  };

  const setMprToolMode = useCallback((mode: MprToolMode) => {
    activeToolRef.current = mode;
    setActiveTool(mode);
    const toolGroup = mprToolGroupRef.current;
    const bindings = mprToolBindingsRef.current;
    if (!toolGroup || !bindings) return;
    const primaryTool = {
      WL: bindings.windowLevel,
      ZOOM: bindings.zoom,
      PAN: bindings.pan,
      LENGTH: bindings.length,
      ROI: bindings.rectangleRoi,
    }[mode];
    [bindings.windowLevel, bindings.zoom, bindings.pan, bindings.stackScroll, bindings.length, bindings.rectangleRoi]
      .forEach((toolName) => toolGroup.setToolPassive(toolName, { removeAllBindings: true }));
    const primaryBindings = [{ mouseButton: bindings.primary }];
    if (primaryTool === bindings.pan) primaryBindings.push({ mouseButton: bindings.auxiliary });
    if (primaryTool === bindings.zoom) primaryBindings.push({ mouseButton: bindings.secondary });
    toolGroup.setToolActive(primaryTool, { bindings: primaryBindings });
    if (primaryTool !== bindings.pan) toolGroup.setToolActive(bindings.pan, { bindings: [{ mouseButton: bindings.auxiliary }] });
    if (primaryTool !== bindings.zoom) toolGroup.setToolActive(bindings.zoom, { bindings: [{ mouseButton: bindings.secondary }] });
    toolGroup.setToolActive(bindings.stackScroll, { bindings: [{ mouseButton: bindings.wheel }] });
  }, []);

  const toggleFocusedView = () => {
    setFocusedView((current) => current ? null : selectedView);
  };

  const requestFullscreen = () => {
    void workspaceRef.current?.requestFullscreen?.();
  };

  const onWorkspaceKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "f" || event.key === "F") { event.preventDefault(); requestFullscreen(); }
    if (event.key === "r" || event.key === "R") { event.preventDefault(); resetViewports(); }
  };

  useEffect(() => {
    let disposed = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    setSeriesProgress({ loaded: 0, total: 0 });
    Promise.all([
      (loadSeries ?? loadCtDicomWebSeries)(orderId, assetId),
      analysisId && !loadSeries ? fetchRadiologyAnalysisResult(analysisId).catch(() => null) : Promise.resolve(null),
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
  }, [orderId, assetId, analysisId, loadSeries]);

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
        mprToolGroupRef.current = null;
        mprToolBindingsRef.current = null;
        tools.ToolGroupManager.destroyToolGroup(toolGroupId);
        tools.ToolGroupManager.destroyToolGroup(volume3dToolGroupId);
      };
      [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.StackScrollTool, tools.LengthTool, tools.RectangleROITool, tools.TrackballRotateTool].forEach(
        (ToolClass) => tools.addTool(ToolClass),
      );
      [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.StackScrollTool, tools.LengthTool, tools.RectangleROITool].forEach((ToolClass) =>
        toolGroup.addTool(ToolClass.toolName),
      );
      mprToolGroupRef.current = toolGroup;
      mprToolBindingsRef.current = {
        primary: tools.Enums.MouseBindings.Primary,
        secondary: tools.Enums.MouseBindings.Secondary,
        auxiliary: tools.Enums.MouseBindings.Auxiliary,
        wheel: tools.Enums.MouseBindings.Wheel,
        windowLevel: tools.WindowLevelTool.toolName,
        zoom: tools.ZoomTool.toolName,
        pan: tools.PanTool.toolName,
        stackScroll: tools.StackScrollTool.toolName,
        length: tools.LengthTool.toolName,
        rectangleRoi: tools.RectangleROITool.toolName,
      };
      setMprToolMode(activeToolRef.current);
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
            segmentation = await (loadSegmentation ? loadSegmentation(analysisId) : loadCtCornerstoneSegmentation(analysisId));
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
  }, [loading, error, analysisId, orderId, assetId, loadSegmentation, setMprToolMode]);

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


  const toolItems: Array<[MprToolMode, string, string]> = [
    ["WL", "WL/WW", "Window / Level"],
    ["ZOOM", "Zoom", "Zoom"],
    ["PAN", "Pan", "Pan"],
    ["LENGTH", "측정", "Length measurement"],
    ["ROI", "ROI", "Rectangle ROI"],
  ];

  const progressPercent =
    seriesProgress.total > 0
      ? Math.round((seriesProgress.loaded / seriesProgress.total) * 100)
      : 0;
  return (
    <div
      ref={workspaceRef}
      tabIndex={0}
      onKeyDown={onWorkspaceKeyDown}
      className="grid h-full min-h-0 grid-rows-[42px_minmax(0,1fr)] overflow-hidden bg-[#03060d] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      aria-label="CT 뷰어. F 전체화면, R 초기화, 마우스 휠로 슬라이스 이동"
    >
      {/* PACS toolbar */}
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-800 bg-[#101827] px-2.5">
        <div
          role="toolbar"
          aria-label="CT Viewer 도구"
          className="flex min-w-0 items-center gap-1 overflow-x-auto"
        >
          <div className="flex shrink-0 items-center rounded-md border border-slate-700 bg-slate-900 p-0.5">
            <button
              type="button"
              aria-pressed={!focusedView}
              onClick={() => setFocusedView(null)}
              className={`h-7 rounded px-2 text-[9px] font-semibold transition ${
                !focusedView
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              2×2
            </button>

            <button
              type="button"
              aria-pressed={Boolean(focusedView)}
              onClick={toggleFocusedView}
              className={`h-7 rounded px-2 text-[9px] font-semibold transition ${
                focusedView
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              1×1
            </button>
          </div>

          <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-slate-700" />

          {toolItems.map(([mode, label, title]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={activeTool === mode}
              onClick={() => setMprToolMode(mode)}
              title={
                mode === "LENGTH" || mode === "ROI"
                  ? `${title} · 화면에서만 사용하며 저장되지 않습니다.`
                  : title
              }
              className={`h-7 shrink-0 rounded-md border px-2 text-[9px] font-semibold transition ${
                activeTool === mode
                  ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}

          <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-slate-700" />

          <button
            type="button"
            onClick={resetViewports}
            title="모든 Viewport 초기화 (R)"
            className="h-7 shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-[9px] font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
          >
            초기화
          </button>

          <button
            type="button"
            onClick={requestFullscreen}
            title="전체화면 (F)"
            className="h-7 shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-[9px] font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
          >
            전체화면
          </button>
        </div>

        <div className="hidden shrink-0 items-center gap-2 text-[8px] text-slate-500 xl:flex">
          <span>휠 Slice</span>
          <span>·</span>
          <span>우클릭 Zoom</span>
          <span>·</span>
          <span>중클릭 Pan</span>
        </div>
      </div>

      {/* Viewports */}
      <div className="relative min-h-0 overflow-hidden bg-[#02050d]">
        {seriesProgress.total > 0 &&
          seriesProgress.loaded < seriesProgress.total && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-40 w-52 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] font-semibold text-slate-200">
                  CT Series 로딩
                </span>
                <span className="text-[8px] tabular-nums text-slate-400">
                  {seriesProgress.loaded}/{seriesProgress.total}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-[width]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

        <div
          className={`absolute inset-0 ${
            focusedView
              ? ""
              : "grid grid-cols-2 grid-rows-2 gap-px bg-slate-800"
          }`}
        >
          {views.map(({ key, ref }) => {
            const selected = selectedView === key;
            const focused = focusedView === key;
            const is3d = key === "volume3d";

            return (
              <section
                key={key}
                className={`overflow-hidden bg-[#03060d] ${
                  focusedView
                    ? focused
                      ? "absolute inset-0"
                      : "hidden"
                    : "relative"
                } ${selected ? "ring-1 ring-inset ring-blue-500/60" : ""}`}
                onMouseDown={() => setSelectedView(key)}
              >
                <div
                  ref={ref}
                  className="absolute inset-0"
                  aria-label={`CT ${VIEW_LABELS[key]} viewer`}
                />

                {overlayRefs[key] && (
                  <canvas
                    ref={overlayRefs[key]}
                    className="pointer-events-none absolute inset-0"
                  />
                )}

                {/* viewport HUD */}
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[8px] font-bold text-white backdrop-blur-sm">
                      {VIEW_LABELS[key]}
                    </span>

                    {!is3d && analysisId && (
                      <span className="rounded-md border border-violet-400/20 bg-violet-500/10 px-1.5 py-1 text-[7px] font-semibold text-violet-200 backdrop-blur-sm">
                        SEG
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedView(key);
                      setFocusedView((current) =>
                        current === key ? null : key,
                      );
                    }}
                    className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-black/55 text-[12px] font-semibold text-slate-200 backdrop-blur-sm transition hover:bg-black/75 hover:text-white"
                    title={focused ? "2×2 보기로 돌아가기" : `${VIEW_LABELS[key]} 확대`}
                    aria-label={focused ? "전체 CT 보기" : `${VIEW_LABELS[key]} 확대`}
                  >
                    {focused ? "↙" : "⛶"}
                  </button>
                </div>

                {/* bottom viewport information */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between p-2">
                  <div className="rounded-md border border-white/10 bg-black/45 px-2 py-1 text-[7px] text-slate-400 backdrop-blur-sm">
                    {is3d
                      ? "좌클릭 Rotate · 우클릭 Zoom"
                      : activeTool === "WL"
                        ? "Drag WL/WW · Wheel Slice"
                        : activeTool === "ZOOM"
                          ? "Drag Zoom · Wheel Slice"
                          : activeTool === "PAN"
                            ? "Drag Pan · Wheel Slice"
                            : activeTool === "LENGTH"
                              ? "Length measurement"
                              : "Rectangle ROI"}
                  </div>

                  {selected && !focused && (
                    <span className="rounded-full border border-blue-400/30 bg-blue-500/10 px-1.5 py-0.5 text-[7px] font-semibold text-blue-300 backdrop-blur-sm">
                      ACTIVE
                    </span>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#02050d]/85 backdrop-blur-[1px]">
            <div className="rounded-lg border border-slate-800 bg-slate-950/90 px-5 py-4 text-center shadow-xl">
              <div className="mx-auto h-7 w-7 animate-pulse rounded-full border border-slate-700 bg-slate-900" />
              <p className="mt-3 text-[10px] font-semibold text-slate-200">
                CT Series를 불러오는 중입니다.
              </p>
            </div>
          </div>
        )}

        {building && !loading && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-md border border-slate-700 bg-black/75 px-2.5 py-1.5 text-[8px] font-medium text-slate-300 backdrop-blur">
            MPR / 3D Viewer 구성 중
          </div>
        )}

        {!loading && (error || viewerError) && (
          <div
            role="alert"
            className="absolute bottom-2 left-2 right-2 z-50 rounded-md border border-rose-800/60 bg-rose-950/90 px-3 py-2 text-[9px] text-rose-200 shadow-lg"
          >
            {error || viewerError}
          </div>
        )}
      </div>
    </div>
  );
}
