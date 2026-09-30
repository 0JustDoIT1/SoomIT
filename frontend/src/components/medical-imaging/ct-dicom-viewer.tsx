"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ensureCornerstoneInitialized } from "@/app/radiology/_lib/cornerstone-init";
import { loadCtDicomWebSeries } from "@/app/radiology/_lib/cornerstone-dicomweb-loader";
import { fetchRadiologyAnalysisResult } from "@/app/radiology/_lib/radiology-api";
import { loadCtCornerstoneSegmentation, type CtCornerstoneSegmentation } from "@/app/radiology/_lib/cornerstone-labelmap";
import { attachCtCornerstoneLabelmapOverlay } from "@/app/radiology/_lib/cornerstone-labelmap-overlay";
import { preventMedicalImageContextMenu } from "@/components/medical-imaging/medical-image-context-menu";

type CtDicomViewerProps = {
  orderId: string;
  assetId: string;
  analysisId?: string;
  cacheKey?: string;
  nodules?: unknown[];
  focusedNoduleId?: string | null;
  onFocusedNoduleChange?: (noduleId: string) => void;
  loadSeries?: (orderId: string, assetId: string) => Promise<{ imageIds: string[]; sopInstanceUids?: string[] }>;
  loadSegmentation?: (analysisId: string) => Promise<CtCornerstoneSegmentation>;
  seriesInstanceUid?: string | null;
  annotations?: ClinicianImageAnnotation[];
  onAnnotationCreated?: (annotation: PendingImageAnnotation) => Promise<boolean | void> | boolean | void;
  onAnnotationUpdated?: (annotationId: string, annotation: PendingImageAnnotation) => Promise<boolean> | boolean | void;
  onAnnotationDeleted?: (annotationId: string) => Promise<boolean> | boolean;
  onAllAnnotationsDeleted?: () => Promise<boolean> | boolean;
  onAnnotationsSaved?: () => Promise<boolean> | boolean;
  hasUnsavedAnnotations?: boolean;
};

export type ClinicianImageAnnotation = {
  id: string;
  annotation_type: "LENGTH" | "BOUNDING_BOX" | "TEXT";
  annotation_data: Record<string, unknown>;
};

export type PendingImageAnnotation = Omit<ClinicianImageAnnotation, "id">;

type ViewKey = "axial" | "coronal" | "sagittal" | "volume3d";
type MprToolMode = "WL" | "ZOOM" | "PAN" | "LENGTH" | "ROI" | "TEXT";
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
  text: string;
};

type ViewerSession = {
  focusedView: ViewKey | null;
  selectedView: ViewKey;
  activeTool: MprToolMode;
  segmentationVisible: boolean;
  selectedNoduleId: string | null;
  cameras?: Record<string, unknown>;
};

type NoduleFocus = { id: string; label: string; world: [number, number, number] };

const viewerSessionCache = new Map<string, ViewerSession>();
const MAX_VIEWER_SESSIONS = 8;

function writeViewerSession(key: string, session: ViewerSession) {
  viewerSessionCache.delete(key);
  viewerSessionCache.set(key, session);
  while (viewerSessionCache.size > MAX_VIEWER_SESSIONS) {
    const oldest = viewerSessionCache.keys().next().value;
    if (typeof oldest !== "string") break;
    viewerSessionCache.delete(oldest);
  }
}

const TOOL_GROUP_ID = "ct-dicom-viewer-mpr-tools";
const VOLUME3D_TOOL_GROUP_ID = "ct-dicom-viewer-volume3d-tools";
const AXIAL_VIEWPORT_ID = "ct-dicom-viewer-axial";
const CORONAL_VIEWPORT_ID = "ct-dicom-viewer-coronal";
const SAGITTAL_VIEWPORT_ID = "ct-dicom-viewer-sagittal";
const VOLUME3D_VIEWPORT_ID = "ct-dicom-viewer-volume3d";
const MPR_VIEWPORT_IDS = [AXIAL_VIEWPORT_ID, CORONAL_VIEWPORT_ID, SAGITTAL_VIEWPORT_ID];
const VOLUME3D_PRESET = "CT-Lung";

// Cornerstone's defaults were designed for a full-size viewport: 14px yellow
// statistics with no background become hard to read and spill across a 2x2
// MPR layout.  Keep the clinically useful length/ROI statistics, but make
// their presentation compact and distinguish the two annotation types.
const MPR_ANNOTATION_STYLES = {
  Length: {
    color: "rgb(56, 189, 248)",
    lineWidth: "1.5",
    textBoxFontSize: "11px",
    textBoxColor: "rgb(186, 230, 253)",
    textBoxBackground: "rgba(8, 15, 30, 0.82)",
    textBoxMargin: "4",
    textBoxBorderRadius: "3",
    textBoxLinkLineColor: "rgb(56, 189, 248)",
    textBoxLinkLineDash: "2,2",
  },
  RectangleROI: {
    color: "rgb(250, 204, 21)",
    lineWidth: "1.5",
    fillColor: "rgb(250, 204, 21)",
    fillOpacity: "0.08",
    textBoxFontSize: "11px",
    textBoxColor: "rgb(254, 240, 138)",
    textBoxBackground: "rgba(8, 15, 30, 0.88)",
    textBoxMargin: "4",
    textBoxBorderRadius: "3",
    textBoxLinkLineColor: "rgb(250, 204, 21)",
    textBoxLinkLineDash: "2,2",
  },
};

const VIEW_LABELS: Record<ViewKey, string> = {
  axial: "Axial",
  coronal: "Coronal",
  sagittal: "Sagittal",
  volume3d: "3D Volume",
};

function getNoduleFocus(nodule: unknown, index: number): NoduleFocus | null {
  if (!nodule || typeof nodule !== "object" || !("finding_payload" in nodule)) return null;
  const payload = nodule.finding_payload;
  if (!payload || typeof payload !== "object" || !("quantification" in payload)) return null;
  const quantification = payload.quantification;
  if (!quantification || typeof quantification !== "object" || !("centroid_world_xyz_mm" in quantification)) return null;
  const centroid = quantification.centroid_world_xyz_mm;
  if (!Array.isArray(centroid) || centroid.length !== 3) return null;
  const [x, y, z] = centroid;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number") return null;
  const rawId = "nodule_no" in nodule ? nodule.nodule_no : index + 1;
  const id = String(rawId);
  return { id, label: `결절 #${id}`, world: [-x, -y, z] };
}

function getNodulesFromAnalysisResult(result: unknown): unknown[] {
  if (!result || typeof result !== "object" || !("result" in result)) return [];
  const detail = result.result;
  if (!detail || typeof detail !== "object" || !("nodules" in detail) || !Array.isArray(detail.nodules)) return [];
  return detail.nodules;
}

async function runWithConcurrency<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await task(item);
    }
  });
  await Promise.all(workers);
}

export function CtDicomViewer({ orderId, assetId, analysisId, cacheKey, nodules = [], focusedNoduleId, onFocusedNoduleChange, loadSeries, loadSegmentation, seriesInstanceUid, annotations = [], onAnnotationCreated, onAnnotationUpdated, onAnnotationDeleted, onAllAnnotationsDeleted, onAnnotationsSaved, hasUnsavedAnnotations = false }: CtDicomViewerProps) {
  const resolvedCacheKey = cacheKey ?? `${orderId}:${assetId}:${seriesInstanceUid ?? ""}:${analysisId ?? ""}`;
  const restoredSession = viewerSessionCache.get(resolvedCacheKey);
  const currentNoduleFoci = useMemo(
    () => nodules.map(getNoduleFocus).filter((value): value is NoduleFocus => Boolean(value)),
    [nodules],
  );
  const restoredNoduleId = restoredSession?.selectedNoduleId;
  const initialNoduleId = restoredNoduleId && currentNoduleFoci.some((nodule) => nodule.id === restoredNoduleId)
    ? restoredNoduleId
    : currentNoduleFoci[0]?.id ?? null;
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
  const [segmentationState, setSegmentationState] = useState<"IDLE" | "LOADING" | "READY" | "ERROR">(analysisId ? "LOADING" : "IDLE");
  const [segmentationError, setSegmentationError] = useState("");
  const [seriesProgress, setSeriesProgress] = useState({ loaded: 0, total: 0 });
  // null = 2x2 grid; otherwise the single view shown full-size. Purely a layout
  // switch - the underlying viewports/volume are never rebuilt by this.
  const [focusedView, setFocusedView] = useState<ViewKey | null>(restoredSession?.focusedView ?? null);
  const [selectedView, setSelectedView] = useState<ViewKey>(restoredSession?.selectedView ?? "axial");
  const [activeTool, setActiveTool] = useState<MprToolMode>(restoredSession?.activeTool ?? "WL");
  const [segmentationVisible, setSegmentationVisible] = useState(restoredSession?.segmentationVisible ?? true);
  const [selectedNoduleId, setSelectedNoduleId] = useState<string | null>(initialNoduleId);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationText, setAnnotationText] = useState("");

  const imageIdsRef = useRef<string[] | null>(null);
  const sopInstanceUidsRef = useRef<string[]>([]);
  const onAnnotationCreatedRef = useRef(onAnnotationCreated);
  const onAnnotationUpdatedRef = useRef(onAnnotationUpdated);
  const clinicianAnnotationIdsRef = useRef(new Set(annotations.map((annotation) => annotation.id)));
  const pendingAnnotationUpdatesRef = useRef(new Set<string>());
  const removeCornerstoneAnnotationRef = useRef<((annotationId: string) => void) | null>(null);
  const annotationsRef = useRef(annotations);
  const syncClinicianAnnotationsRef = useRef<(() => void) | null>(null);
  const annotationTextRef = useRef("");
  const onFocusedNoduleChangeRef = useRef(onFocusedNoduleChange);
  const noduleFociRef = useRef<NoduleFocus[]>(currentNoduleFoci);
  const selectedNoduleIdRef = useRef<string | null>(selectedNoduleId);
  const sessionRef = useRef<ViewerSession>({
    focusedView: restoredSession?.focusedView ?? null,
    selectedView: restoredSession?.selectedView ?? "axial",
    activeTool: restoredSession?.activeTool ?? "WL",
    segmentationVisible: restoredSession?.segmentationVisible ?? true,
    selectedNoduleId: initialNoduleId,
    cameras: restoredSession?.cameras,
  });
  // All 4 viewports are built once per series and kept alive for the component's
  // lifetime; this ref lets the maximize/restore effect resize them without
  // rebuilding anything.
  const renderingEngineRef = useRef<import("@cornerstonejs/core").RenderingEngine | null>(null);
  const mprToolGroupRef = useRef<MprToolGroup | null>(null);
  const mprToolBindingsRef = useRef<MprToolBindings | null>(null);
  const activeToolRef = useRef<MprToolMode>(restoredSession?.activeTool ?? "WL");
  // Caches the loaded labelmap data across re-renders, keyed by analysis+
  // volume, so it is only downloaded once per series.
  const segmentationCacheRef = useRef<{ key: string; segmentation: CtCornerstoneSegmentation } | null>(null);

  useEffect(() => {
    onAnnotationCreatedRef.current = onAnnotationCreated;
  }, [onAnnotationCreated]);

  useEffect(() => {
    onAnnotationUpdatedRef.current = onAnnotationUpdated;
  }, [onAnnotationUpdated]);

  useEffect(() => {
    clinicianAnnotationIdsRef.current = new Set(annotations.map((annotation) => annotation.id));
  }, [annotations]);

  useEffect(() => {
    annotationsRef.current = annotations;
    // Saving/loading an annotation must update only the overlay. Rebuilding
    // the MPR volume here drops the active WebGL image context and leaves the
    // CT pixels grey while annotation SVG/canvas elements still remain.
    syncClinicianAnnotationsRef.current?.();
  }, [annotations]);

  useEffect(() => {
    annotationTextRef.current = annotationText;
  }, [annotationText]);

  useEffect(() => {
    onFocusedNoduleChangeRef.current = onFocusedNoduleChange;
  }, [onFocusedNoduleChange]);

  useEffect(() => {
    noduleFociRef.current = currentNoduleFoci;
  }, [currentNoduleFoci]);

  useEffect(() => {
    selectedNoduleIdRef.current = selectedNoduleId;
    sessionRef.current = {
      ...sessionRef.current,
      focusedView,
      selectedView,
      activeTool,
      segmentationVisible,
      selectedNoduleId,
    };
    writeViewerSession(resolvedCacheKey, sessionRef.current);
  }, [activeTool, focusedView, resolvedCacheKey, segmentationVisible, selectedNoduleId, selectedView]);

  const focusNodule = useCallback((noduleId: string) => {
    setSelectedNoduleId(noduleId);
    onFocusedNoduleChangeRef.current?.(noduleId);
    const focus = noduleFociRef.current.find((nodule) => nodule.id === noduleId);
    const renderingEngine = renderingEngineRef.current;
    if (!focus || !renderingEngine) return;
    MPR_VIEWPORT_IDS.forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId) as { jumpToWorld?: (world: [number, number, number]) => void };
      viewport.jumpToWorld?.(focus.world);
    });
    renderingEngine.render();
  }, []);

  useEffect(() => {
    if (focusedNoduleId && focusedNoduleId !== selectedNoduleIdRef.current) {
      focusNodule(focusedNoduleId);
    }
  }, [focusNodule, focusedNoduleId]);

  const selectAnnotation = (annotation: ClinicianImageAnnotation) => {
    setSelectedAnnotationId(annotation.id);
    setAnnotationText(typeof annotation.annotation_data.text === "string" ? annotation.annotation_data.text : "");
  };

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
      TEXT: bindings.text,
    }[mode];
    [bindings.windowLevel, bindings.zoom, bindings.pan, bindings.stackScroll, bindings.length, bindings.rectangleRoi, bindings.text]
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

  const resizeViewportsAfterLayout = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const renderingEngine = renderingEngineRef.current;
        renderingEngine?.resize(true, true);
        renderingEngine?.render();
      });
    });
  }, []);

  const requestFullscreen = () => {
    const request = workspaceRef.current?.requestFullscreen?.();
    if (request) void request.finally(resizeViewportsAfterLayout);
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
      .then(([series, analysisResult]) => {
        if (disposed) return;
        const { imageIds } = series;
        imageIdsRef.current = imageIds;
        sopInstanceUidsRef.current = (series as { sopInstanceUids?: string[] }).sopInstanceUids ?? [];
        if (noduleFociRef.current.length === 0) {
          noduleFociRef.current = getNodulesFromAnalysisResult(analysisResult)
            .map(getNoduleFocus)
            .filter((value): value is NoduleFocus => Boolean(value));
          if (!selectedNoduleIdRef.current) {
            selectedNoduleIdRef.current = noduleFociRef.current[0]?.id ?? null;
          }
        }
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
    const ownedAnnotationUids = new Set<string>();
    const generation = crypto.randomUUID();
    const volumeId = `cornerstoneStreamingImageVolume:${assetId}:${generation}`;
    let releaseVolume: (() => void) | undefined;

    void (async () => {
      const { core, tools } = await ensureCornerstoneInitialized();
      if (disposed) return;
      releaseVolume = () => {
        if (core.cache.getVolume(volumeId)) core.cache.removeVolumeLoadObject(volumeId);
      };
      if (!axialRef.current || !coronalRef.current || !sagittalRef.current || !volume3dRef.current) return;
      setBuilding(true);
      setViewerError("");
      setSegmentationError("");
      const imageIds = imageIdsRef.current;
      if (!imageIds) return;
      const segmentationPromise = analysisId
        ? (() => {
            setSegmentationState("LOADING");
            const request = loadSegmentation ? loadSegmentation(analysisId) : loadCtCornerstoneSegmentation(analysisId);
            return request.then(
              (segmentation) => ({ segmentation, error: null }),
              (reason: unknown) => ({ segmentation: null, error: reason }),
            );
          })()
        : null;

      if (process.env.NODE_ENV !== "production") {
        // These dev-only listeners were never removed on effect cleanup, so
        // every hot-reload/re-run of this effect added another copy - each
        // subsequent render event then fired N accumulated listeners,
        // compounding console/CPU overhead over a long dev session.
        const handleCornerstoneErrorEvent = (event: Event) => {
          console.warn("[ct-dicom-viewer] Cornerstone ERROR_EVENT", (event as CustomEvent).detail);
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
        ownedAnnotationUids.forEach((uid) => tools.annotation.state.removeAnnotation(uid));
        mprToolGroupRef.current = null;
        mprToolBindingsRef.current = null;
        tools.ToolGroupManager.destroyToolGroup(toolGroupId);
        tools.ToolGroupManager.destroyToolGroup(volume3dToolGroupId);
      };
      [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.StackScrollTool, tools.LengthTool, tools.RectangleROITool, tools.ArrowAnnotateTool, tools.TrackballRotateTool].forEach(
        (ToolClass) => tools.addTool(ToolClass),
      );
      [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.StackScrollTool, tools.LengthTool, tools.RectangleROITool].forEach((ToolClass) =>
        toolGroup.addTool(ToolClass.toolName),
      );
      toolGroup.addTool(tools.ArrowAnnotateTool.toolName, {
        configuration: {
          getTextCallback: (done: (value: string) => void) => done(annotationTextRef.current.trim()),
          changeTextCallback: (_annotation: unknown, _eventDetail: unknown, done: (value: string) => void) => done(annotationTextRef.current.trim()),
        },
      });
      tools.annotation.config.style.setToolGroupToolStyles(toolGroupId, {
        [tools.LengthTool.toolName]: MPR_ANNOTATION_STYLES.Length,
        [tools.RectangleROITool.toolName]: MPR_ANNOTATION_STYLES.RectangleROI,
      });
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
        text: tools.ArrowAnnotateTool.toolName,
      };
      setMprToolMode(activeToolRef.current);

      const annotationEventName = tools.Enums.Events.ANNOTATION_COMPLETED;
      const annotationModifiedEventName = tools.Enums.Events.ANNOTATION_MODIFIED;
      const syncAnnotation = (event: Event, completed: boolean) => {
        const detail = (event as CustomEvent<{ annotation?: Record<string, unknown>; changeType?: string; viewportId?: string }>).detail;
        if (detail?.changeType === "StatsUpdated") return;
        const annotation = detail?.annotation;
        if (!annotation || !seriesInstanceUid) return;
        const metadata = annotation.metadata as Record<string, unknown> | undefined;
        const data = annotation.data as Record<string, unknown> | undefined;
        const toolName = metadata?.toolName;
        const annotationType = toolName === tools.LengthTool.toolName
          ? "LENGTH"
          : toolName === tools.RectangleROITool.toolName
            ? "BOUNDING_BOX"
            : toolName === tools.ArrowAnnotateTool.toolName
              ? "TEXT"
              : null;
        const points = (data?.handles as { points?: unknown } | undefined)?.points;
        if (!annotationType || !Array.isArray(points) || points.length === 0) return;
        const referencedImageId = typeof metadata?.referencedImageId === "string" ? metadata.referencedImageId : "";
        if (!imageIds.includes(referencedImageId)) return;
        if (typeof annotation.annotationUID === "string") ownedAnnotationUids.add(annotation.annotationUID);
        const imageIndex = imageIds.indexOf(referencedImageId);
        const sopInstanceUid = sopInstanceUidsRef.current[imageIndex] ?? sopInstanceUidsRef.current[0];
        if (!sopInstanceUid) return;
        const normal = metadata?.viewPlaneNormal as number[] | undefined;
        const matchingViewport = normal && MPR_VIEWPORT_IDS.find((id) => {
          const cameraNormal = renderingEngine?.getViewport(id).getCamera().viewPlaneNormal;
          return cameraNormal && Math.abs(normal.reduce((sum, value, i) => sum + value * cameraNormal[i], 0)) > 0.999;
        });
        const viewportId = detail?.viewportId ?? matchingViewport ?? AXIAL_VIEWPORT_ID;
        const cachedStats = data?.cachedStats && typeof data.cachedStats === "object" ? data.cachedStats : undefined;
        const annotationId = typeof annotation.annotationUID === "string" && annotation.annotationUID.startsWith("clinician-")
          ? annotation.annotationUID.slice("clinician-".length)
          : null;
        const text = annotationType === "TEXT" ? String(data?.text ?? data?.label ?? annotationTextRef.current).trim() : undefined;
        if (annotationType === "TEXT" && !text) return;
        const payload: PendingImageAnnotation = {
          annotation_type: annotationType,
          annotation_data: {
            series_instance_uid: seriesInstanceUid,
            sop_instance_uid: sopInstanceUid,
            tool_name: String(toolName),
            viewport: viewportId.replace("ct-dicom-viewer-", ""),
            frame_of_reference_uid: typeof metadata?.FrameOfReferenceUID === "string" ? metadata.FrameOfReferenceUID : undefined,
            world_points: points,
            view_plane_normal: metadata?.viewPlaneNormal,
            view_up: metadata?.viewUp,
            cached_stats: cachedStats,
            text,
          },
        };
        if (annotationId) {
          // A deleted annotation can briefly remain in Cornerstone's global
          // annotation state while React reconciles the persisted list. Do not
          // send PATCH requests for that stale ID, and coalesce noisy drag
          // events into one in-flight update per annotation.
          if (!clinicianAnnotationIdsRef.current.has(annotationId) || pendingAnnotationUpdatesRef.current.has(annotationId)) return;
          const persistedAnnotationId = annotationId;
          pendingAnnotationUpdatesRef.current.add(persistedAnnotationId);
          void Promise.resolve(onAnnotationUpdatedRef.current?.(persistedAnnotationId, payload)).catch(() => {
            // The owner reports persistence errors. This event listener must
            // still release its in-flight marker for a later user edit.
          }).finally(() => {
            pendingAnnotationUpdatesRef.current.delete(persistedAnnotationId);
          });
        } else if (completed) {
          const uid = annotation.annotationUID;
          void Promise.resolve(onAnnotationCreatedRef.current?.(payload)).then((saved) => {
            if (saved !== true || typeof uid !== "string") return;
            tools.annotation.state.removeAnnotation(uid);
            ownedAnnotationUids.delete(uid);
            if (!disposed) tools.utilities.triggerAnnotationRenderForViewportIds([...MPR_VIEWPORT_IDS]);
          });
        }
      };
      if (annotationEventName) {
        const selectionEvent = tools.Enums.Events.ANNOTATION_SELECTION_CHANGE;
        const handleSelection = (event: Event) => {
          const detail = (event as CustomEvent<{ selection?: string[]; removed?: string[] }>).detail;
          const uid = detail?.selection?.find((value) => ownedAnnotationUids.has(value) && value.startsWith("clinician-"));
          if (uid) {
            const id = uid.slice("clinician-".length);
            setSelectedAnnotationId(id);
            const selected = annotationsRef.current.find((item) => item.id === id);
            setAnnotationText(typeof selected?.annotation_data.text === "string" ? selected.annotation_data.text : "");
          } else if (detail?.removed?.some((value) => ownedAnnotationUids.has(value))) {
            setSelectedAnnotationId(null);
          }
        };
        if (selectionEvent) core.eventTarget.addEventListener(selectionEvent, handleSelection);
        const handleAnnotationCompleted = (event: Event) => syncAnnotation(event, true);
        const handleAnnotationModified = (event: Event) => syncAnnotation(event, false);
        core.eventTarget.addEventListener(annotationEventName, handleAnnotationCompleted);
        if (annotationModifiedEventName) core.eventTarget.addEventListener(annotationModifiedEventName, handleAnnotationModified);
        const previousCleanup = cleanupCornerstoneState;
        cleanupCornerstoneState = () => {
          if (selectionEvent) core.eventTarget.removeEventListener(selectionEvent, handleSelection);
          core.eventTarget.removeEventListener(annotationEventName, handleAnnotationCompleted);
          if (annotationModifiedEventName) core.eventTarget.removeEventListener(annotationModifiedEventName, handleAnnotationModified);
          previousCleanup?.();
        };
      }
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

      const handleVolumeProgress = (event: Event) => {
        const detail = (event as CustomEvent<{ volumeId?: string; framesProcessed?: number; numberOfFrames?: number }>).detail;
        if (detail?.volumeId !== volumeId) return;
        setSeriesProgress({ loaded: detail.framesProcessed ?? 0, total: detail.numberOfFrames ?? imageIds.length });
      };
      core.eventTarget.addEventListener(core.Enums.Events.IMAGE_VOLUME_MODIFIED, handleVolumeProgress);
      removeProgressListener = () => core.eventTarget.removeEventListener(core.Enums.Events.IMAGE_VOLUME_MODIFIED, handleVolumeProgress);

      // Seed the volume with decoded pixels, without waiting for the whole CT.
      // The streaming volume loads the remaining frames after the first render.
      let loadedImageCount = 0;
      const initialImageIds = [...new Set([imageIds[0], imageIds[Math.floor(imageIds.length / 2)], imageIds[imageIds.length - 1]])];
      await runWithConcurrency(initialImageIds, 3, async (imageId) => {
        await core.imageLoader.loadAndCacheImage(imageId);
        loadedImageCount += 1;
        if (!disposed) setSeriesProgress({ loaded: loadedImageCount, total: imageIds.length });
      });
      if (disposed) return;

      const volume = await core.volumeLoader.createAndCacheVolume(volumeId, { imageIds, progressiveRendering: true });
      if (disposed) { releaseVolume?.(); return; }
      const allViewportIds = [...MPR_VIEWPORT_IDS, VOLUME3D_VIEWPORT_ID];
      await core.setVolumesForViewports(renderingEngine, [{ volumeId }], allViewportIds);
      if (disposed) return;

      // Clinician annotations are kept separate from the AI labelmap.  The
      // persisted world coordinates let Cornerstone place the same annotation
      // in an MPR viewport after the Case is reopened.
      const annotationState = (tools as unknown as {
        annotation?: { state?: {
          addAnnotation?: (annotation: Record<string, unknown>, element: HTMLDivElement) => void;
          removeAnnotation?: (annotationUID: string) => void;
          getAllAnnotations?: () => Array<{ annotationUID?: unknown }>;
        } };
      }).annotation?.state;
      const restoredClinicianAnnotationUids = new Set<string>();
      removeCornerstoneAnnotationRef.current = (annotationId) => {
        annotationState?.removeAnnotation?.(`clinician-${annotationId}`);
        restoredClinicianAnnotationUids.delete(`clinician-${annotationId}`);
        tools.utilities.triggerAnnotationRenderForViewportIds([...MPR_VIEWPORT_IDS]);
      };
      const syncClinicianAnnotations = () => {
        // Keep live objects while dragging; removing them loses selection and
        // leaves Cornerstone's edit session pointing at a detached annotation.
        const validUids = new Set(annotationsRef.current.filter((saved) =>
          saved.annotation_data.series_instance_uid === seriesInstanceUid &&
          sopInstanceUidsRef.current.includes(String(saved.annotation_data.sop_instance_uid)),
        ).map((saved) => `clinician-${saved.id}`));
        restoredClinicianAnnotationUids.forEach((uid) => {
          if (!validUids.has(uid)) {
            ownedAnnotationUids.delete(uid);
            annotationState?.removeAnnotation?.(uid);
            restoredClinicianAnnotationUids.delete(uid);
          }
        });
        if (!annotationState?.addAnnotation) return;
        const addAnnotation = annotationState.addAnnotation;
        annotationsRef.current.forEach((saved) => {
          const data = saved.annotation_data;
          if (data.series_instance_uid !== seriesInstanceUid) return;
          if (!sopInstanceUidsRef.current.includes(String(data.sop_instance_uid))) return;
          const points = data.world_points;
          if (!Array.isArray(points) || points.length === 0) return;
          const toolName = saved.annotation_type === "LENGTH"
            ? tools.LengthTool.toolName
            : saved.annotation_type === "BOUNDING_BOX"
              ? tools.RectangleROITool.toolName
              : tools.ArrowAnnotateTool.toolName;
          const viewportName = typeof data.viewport === "string" ? data.viewport : "axial";
          const target = ({ axial: axialRef.current, coronal: coronalRef.current, sagittal: sagittalRef.current } as Record<string, HTMLDivElement | null>)[viewportName] ?? axialRef.current;
          if (!target) return;
          const annotationUID = `clinician-${saved.id}`;
          const existing = tools.annotation.state.getAnnotation(annotationUID);
          if (existing) {
            existing.data.text = typeof data.text === "string" ? data.text : undefined;
            existing.data.label = typeof data.text === "string" ? data.text : undefined;
            return;
          }
          const targetViewportId = ({ axial: AXIAL_VIEWPORT_ID, coronal: CORONAL_VIEWPORT_ID, sagittal: SAGITTAL_VIEWPORT_ID } as Record<string, string>)[viewportName] ?? AXIAL_VIEWPORT_ID;
          const camera = renderingEngine?.getViewport(targetViewportId).getCamera();
          addAnnotation(tools.LengthTool.createAnnotation({
            annotationUID,
            highlighted: false,
            invalidated: false,
            isLocked: false,
            isVisible: true,
            metadata: {
              toolName,
              FrameOfReferenceUID: data.frame_of_reference_uid,
              referencedImageId: imageIds[Math.max(0, sopInstanceUidsRef.current.indexOf(String(data.sop_instance_uid)))],
              viewPlaneNormal: data.view_plane_normal ?? camera?.viewPlaneNormal,
              viewUp: data.view_up ?? camera?.viewUp,
            },
            data: {
              handles: { points },
              cachedStats: data.cached_stats ?? {},
              text: typeof data.text === "string" ? data.text : undefined,
              label: typeof data.text === "string" ? data.text : undefined,
            },
          }) as unknown as Record<string, unknown>, target);
          restoredClinicianAnnotationUids.add(annotationUID);
          ownedAnnotationUids.add(annotationUID);
        });
        renderingEngine?.render();
        tools.utilities.triggerAnnotationRenderForViewportIds([...MPR_VIEWPORT_IDS]);
      };
      syncClinicianAnnotationsRef.current = syncClinicianAnnotations;
      syncClinicianAnnotations();
      const previousAnnotationCleanup = cleanupCornerstoneState;
      cleanupCornerstoneState = () => {
        // Remove event listeners/tool groups first so teardown itself never
        // emits a PATCH for an annotation that is being discarded.
        previousAnnotationCleanup?.();
        restoredClinicianAnnotationUids.forEach((annotationUID) => annotationState?.removeAnnotation?.(annotationUID));
        if (syncClinicianAnnotationsRef.current === syncClinicianAnnotations) {
          syncClinicianAnnotationsRef.current = null;
        }
      };

      const volume3dViewport = renderingEngine.getViewport(VOLUME3D_VIEWPORT_ID) as InstanceType<typeof core.VolumeViewport3D>;
      const preset = core.CONSTANTS.VIEWPORT_PRESETS.find((item) => item.name === VOLUME3D_PRESET);
      if (preset) {
        const actorEntry = volume3dViewport.getDefaultActor();
        if (actorEntry?.actor) {
          core.utilities.applyPreset(actorEntry.actor as import("@cornerstonejs/core").Types.VolumeActor, preset);
        }
      }

      const restoredCameras = sessionRef.current.cameras;
      if (restoredCameras) {
        Object.entries(restoredCameras).forEach(([viewportId, camera]) => {
          const viewport = renderingEngine?.getViewport(viewportId) as { setCamera?: (value: unknown) => void } | undefined;
          viewport?.setCamera?.(camera);
        });
      } else {
        const selectedFocus = noduleFociRef.current.find((nodule) => nodule.id === selectedNoduleIdRef.current)
          ?? noduleFociRef.current[0];
        if (selectedFocus) {
          MPR_VIEWPORT_IDS.forEach((viewportId) => {
            const viewport = renderingEngine?.getViewport(viewportId) as InstanceType<typeof core.VolumeViewport>;
            viewport.jumpToWorld(selectedFocus.world);
          });
        }
      }
      renderingEngine.render();
      if (!disposed) setBuilding(false);
      if ("load" in volume && typeof volume.load === "function") {
        volume.load((event) => {
          if (disposed) return;
          const progress = event as { framesProcessed?: number; totalNumFrames?: number; success?: boolean; error?: unknown };
          if (progress.success === false) setViewerError("일부 CT 슬라이스를 불러오지 못했습니다. 영상을 다시 열어 주세요.");
          setSeriesProgress({ loaded: progress.framesProcessed ?? imageIds.length, total: progress.totalNumFrames ?? imageIds.length });
          renderingEngine?.render();
        });
      }
      // Keep the explicit DICOMweb decode path as a background fallback for
      // loaders that stall with metadata alone. Cached/in-flight images are shared.
      let lastBackgroundRender = performance.now();
      void runWithConcurrency(imageIds, 8, async (imageId) => {
        if (disposed) return;
        await core.imageLoader.loadAndCacheImage(imageId);
        if (!disposed && performance.now() - lastBackgroundRender >= 100) {
          lastBackgroundRender = performance.now();
          renderingEngine?.render();
        }
      }).then(() => {
        if (!disposed) renderingEngine?.render();
      }).catch((reason: unknown) => {
        if (!disposed) setViewerError(reason instanceof Error ? reason.message : "CT 슬라이스를 불러오지 못했습니다.");
      });

      if (analysisId) {
        try {
          const segmentationKey = `${analysisId}:${volumeId}`;
          let segmentation = segmentationCacheRef.current?.key === segmentationKey
            ? segmentationCacheRef.current.segmentation
            : null;
          if (!segmentation) {
            const loadedSegmentation = await segmentationPromise;
            if (disposed) return;
            if (loadedSegmentation?.error) throw loadedSegmentation.error;
            segmentation = loadedSegmentation?.segmentation ?? null;
            if (!segmentation) throw new Error("Segmentation 데이터가 없습니다.");
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
          setSegmentationState("READY");
        } catch (reason) {
          if (!disposed) {
            console.warn("[ct-dicom-viewer] segmentation unavailable; continuing with the CT series", reason);
            setSegmentationState("ERROR");
            setSegmentationError(reason instanceof Error ? reason.message : "Segmentation을 불러오지 못했습니다.");
          }
        }
      }

      resizeObserver = new ResizeObserver(() => {
        renderingEngine?.resize(true, true);
        renderingEngine?.render();
      });
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
      if (renderingEngine) {
        const engine = renderingEngine;
        const cameras: Record<string, unknown> = {};
        MPR_VIEWPORT_IDS.forEach((viewportId) => {
          try {
            const viewport = engine.getViewport(viewportId) as { getCamera?: () => unknown } | undefined;
            const camera = viewport?.getCamera?.();
            if (camera) cameras[viewportId] = camera;
          } catch {
            // A viewport can already be disabled by a concurrent React cleanup.
            // Session persistence is best-effort and must not interrupt teardown.
          }
        });
        sessionRef.current = { ...sessionRef.current, cameras };
        writeViewerSession(resolvedCacheKey, sessionRef.current);
      }
      resizeObserver?.disconnect();
      removeProgressListener?.();
      removeDevListeners?.();
      overlayCleanups.forEach((cleanup) => cleanup());
      cleanupCornerstoneState?.();
      removeCornerstoneAnnotationRef.current = null;
      renderingEngine?.destroy();
      releaseVolume?.();
      renderingEngineRef.current = null;
    };
  }, [loading, error, analysisId, orderId, assetId, loadSegmentation, resolvedCacheKey, setMprToolMode, seriesInstanceUid]);

  // Pure layout switch: maximizing/restoring a view never re-fetches or rebuilds
  // anything - the already-built viewports just need a resize once their
  // container's on-screen size changes (they had zero size while hidden).
  useEffect(() => {
    resizeViewportsAfterLayout();
  }, [focusedView, resizeViewportsAfterLayout]);

  useEffect(() => {
    const handleLayoutChange = () => resizeViewportsAfterLayout();
    document.addEventListener("fullscreenchange", handleLayoutChange);
    window.addEventListener("resize", handleLayoutChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleLayoutChange);
      window.removeEventListener("resize", handleLayoutChange);
    };
  }, [resizeViewportsAfterLayout]);

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
    ["TEXT", "Text", "Text annotation"],
  ];

  const progressPercent =
    seriesProgress.total > 0
      ? Math.round((seriesProgress.loaded / seriesProgress.total) * 100)
      : 0;
  const visibleNodules = currentNoduleFoci;
  const effectiveSelectedNoduleId = visibleNodules.some((nodule) => nodule.id === selectedNoduleId)
    ? selectedNoduleId
    : visibleNodules[0]?.id ?? null;
  return (
    <div
      ref={workspaceRef}
      tabIndex={0}
      onKeyDown={onWorkspaceKeyDown}
      className="relative grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[#03060d] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 fullscreen:h-screen fullscreen:w-screen"
      aria-label="CT 뷰어. F 전체화면, R 초기화, 마우스 휠로 슬라이스 이동"
    >
      {/* PACS toolbar */}
      <div className="flex min-h-[48px] min-w-0 flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#101827] px-3 py-1.5">
        <div
          role="toolbar"
          aria-label="CT Viewer 도구"
          className="flex min-w-0 flex-wrap items-center gap-1"
        >
          <div className="flex shrink-0 items-center rounded-md border border-slate-700 bg-slate-900 p-0.5">
            <button
              type="button"
              aria-pressed={!focusedView}
              onClick={() => setFocusedView(null)}
              className={`h-8 rounded px-2.5 text-xs font-semibold transition ${
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
              className={`h-8 rounded px-2.5 text-xs font-semibold transition ${
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
              title={title}
              className={`h-8 shrink-0 rounded-md border px-2.5 text-xs font-semibold transition ${
                activeTool === mode
                  ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}

          {activeTool === "TEXT" && (
            <input
              aria-label="텍스트 주석 내용"
              value={annotationText}
              onChange={(event) => setAnnotationText(event.target.value)}
              placeholder="주석 입력 후 영상 클릭"
              className="h-8 w-40 shrink-0 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100 placeholder:text-slate-500"
            />
          )}

          <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-slate-700" />

          <button
            type="button"
            onClick={resetViewports}
            title="모든 Viewport 초기화 (R)"
            className="h-8 shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
          >
            초기화
          </button>

          <button
            type="button"
            onClick={requestFullscreen}
            title="전체화면 (F)"
            className="h-8 shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
          >
            전체화면
          </button>

          <button
            type="button"
            disabled={!selectedAnnotationId}
            onClick={() => {
              const annotationId = selectedAnnotationId;
              if (!annotationId || !onAnnotationDeleted) return;
              // Block ANNOTATION_MODIFIED events immediately.  Otherwise a
              // drag event already queued by Cornerstone can PATCH an ID just
              // deleted by this click and produce a 404.
              clinicianAnnotationIdsRef.current.delete(annotationId);
              pendingAnnotationUpdatesRef.current.delete(annotationId);
              // This is an optimistic visual delete: do not leave the ROI on
              // the CT while waiting for the network round trip.
              removeCornerstoneAnnotationRef.current?.(annotationId);
              setSelectedAnnotationId(null);
              void Promise.resolve(onAnnotationDeleted(annotationId)).then((deleted) => {
                if (!deleted) {
                  clinicianAnnotationIdsRef.current.add(annotationId);
                  syncClinicianAnnotationsRef.current?.();
                }
              }).catch(() => {
                clinicianAnnotationIdsRef.current.add(annotationId);
                syncClinicianAnnotationsRef.current?.();
              });
            }}
            title="선택한 의료진 주석 삭제"
            className="h-8 shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-35"
          >
            선택 삭제
          </button>

          <button
            type="button"
            disabled={annotations.length === 0 || !onAllAnnotationsDeleted}
            onClick={() => {
              const annotationIds = annotations.map((annotation) => annotation.id);
              void Promise.resolve(onAllAnnotationsDeleted?.()).then((deleted) => {
                if (!deleted) return;
                annotationIds.forEach((annotationId) => {
                  clinicianAnnotationIdsRef.current.delete(annotationId);
                  pendingAnnotationUpdatesRef.current.delete(annotationId);
                  removeCornerstoneAnnotationRef.current?.(annotationId);
                });
                setSelectedAnnotationId(null);
              });
            }}
            title="현재 CT 영상의 의료진 주석 전체 삭제"
            className="h-8 shrink-0 rounded-md border border-rose-700 bg-rose-950/40 px-2.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-900/60 disabled:cursor-not-allowed disabled:opacity-35"
          >
            전체 삭제
          </button>

          <button
            type="button"
            disabled={!hasUnsavedAnnotations || !onAnnotationsSaved}
            onClick={() => { void onAnnotationsSaved?.(); }}
            title="작성하거나 수정한 의료진 주석 저장"
            className="h-8 shrink-0 rounded-md border border-blue-500 bg-blue-600 px-2.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-35"
          >
            주석 저장
          </button>

          {analysisId && (
            <button
              type="button"
              aria-pressed={segmentationVisible}
              disabled={segmentationState !== "READY"}
              onClick={() => setSegmentationVisible((current) => !current)}
              className="h-7 shrink-0 rounded-md border border-violet-700 bg-violet-950/60 px-2 text-[9px] font-semibold text-violet-200 transition hover:bg-violet-900/70 disabled:cursor-not-allowed disabled:opacity-40"
            >
              SEG {segmentationVisible ? "ON" : "OFF"}
            </button>
          )}

          {visibleNodules.map((nodule) => (
            <button
              key={nodule.id}
              type="button"
              aria-pressed={effectiveSelectedNoduleId === nodule.id}
              onClick={() => focusNodule(nodule.id)}
              className={`h-7 shrink-0 rounded-md border px-2 text-[9px] font-semibold transition ${effectiveSelectedNoduleId === nodule.id ? "border-violet-400 bg-violet-600 text-white" : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"}`}
            >
              {nodule.label}
            </button>
          ))}
        </div>

        <div className="hidden shrink-0 items-center gap-2 text-[8px] text-slate-500 2xl:flex">
          <span>휠 Slice</span>
          <span>·</span>
          <span>우클릭 Zoom</span>
          <span>·</span>
          <span>중클릭 Pan</span>
        </div>
      </div>

      {annotations.length > 0 && (
        <div className="absolute bottom-2 left-2 z-40 flex max-w-[calc(100%-16px)] items-center gap-1 overflow-x-auto rounded-md border border-slate-700 bg-slate-950/90 p-1.5 text-[9px] text-slate-200 backdrop-blur">
          <span className="shrink-0 px-1 text-slate-400">의료진 주석</span>
          {annotations.map((annotation, index) => (
            <button
              key={annotation.id}
              type="button"
              aria-pressed={selectedAnnotationId === annotation.id}
              onClick={() => selectAnnotation(annotation)}
              className={`shrink-0 rounded px-2 py-1 font-semibold ${selectedAnnotationId === annotation.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            >
              {annotation.annotation_type === "LENGTH" ? "길이" : annotation.annotation_type === "BOUNDING_BOX" ? "ROI" : "Text"} {index + 1}
            </button>
          ))}
          {selectedAnnotationId && annotations.find((annotation) => annotation.id === selectedAnnotationId)?.annotation_type === "TEXT" && (
            <>
              <input aria-label="선택한 텍스트 주석 내용" value={annotationText} onChange={(event) => {
                const value = event.target.value;
                setAnnotationText(value);
                const selected = annotations.find((annotation) => annotation.id === selectedAnnotationId);
                if (selected && value.trim()) onAnnotationUpdated?.(selected.id, { annotation_type: selected.annotation_type, annotation_data: { ...selected.annotation_data, text: value } });
              }} className="h-6 w-28 rounded border border-slate-700 bg-slate-900 px-1.5 text-[9px] text-white" />
            </>
          )}
        </div>
      )}

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
                  onContextMenu={preventMedicalImageContextMenu}
                  className="absolute inset-0"
                  aria-label={`CT ${VIEW_LABELS[key]} viewer`}
                />

                {overlayRefs[key] && (
                  <canvas
                    ref={overlayRefs[key]}
                    className={`pointer-events-none absolute inset-0 z-10 ${segmentationVisible ? "" : "hidden"}`}
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

        {!loading && !error && !viewerError && segmentationState === "ERROR" && (
          <div role="status" className="pointer-events-none absolute bottom-2 right-2 z-50 max-w-[55%] rounded-md border border-amber-700/60 bg-amber-950/90 px-3 py-2 text-[9px] text-amber-100 shadow-lg">
            CT 원본은 정상 표시 중입니다. Segmentation을 사용할 수 없습니다{segmentationError ? `: ${segmentationError}` : "."}
          </div>
        )}

        {!loading && !error && segmentationState === "LOADING" && (
          <div role="status" className="pointer-events-none absolute bottom-2 left-2 z-40 rounded-md border border-violet-700/50 bg-violet-950/80 px-2.5 py-1.5 text-[8px] text-violet-100">
            Segmentation 로딩 중
          </div>
        )}
      </div>
    </div>
  );
}
