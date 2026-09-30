"use client";

import type OpenSeadragonType from "openseadragon";
import { memo, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type WsiAnnotationType = "POINT" | "BOUNDING_BOX" | "POLYGON" | "FREEHAND" | "TEXT";
type ImagePoint = [number, number];
type CreateViewerPoint = (x: number, y: number) => OpenSeadragonType.Point;
export type WsiAnnotation = {
  id: string;
  image_asset: string;
  annotation_type: WsiAnnotationType;
  annotation_data: {
    coordinate_space: "WSI_IMAGE";
    slide_id: string;
    image_width: number;
    image_height: number;
    image_points: ImagePoint[];
    tool_name: string;
    text?: string;
  };
  created_by_user_name?: string;
  created_at?: string;
};

const TOOLS: Array<{ type: WsiAnnotationType | "PAN"; label: string }> = [
  { type: "PAN", label: "이동" },
  { type: "POINT", label: "Point" },
  { type: "BOUNDING_BOX", label: "ROI" },
  { type: "POLYGON", label: "Polygon" },
  { type: "FREEHAND", label: "Freehand" },
  { type: "TEXT", label: "Text" },
];

function toolName(type: WsiAnnotationType) {
  return { POINT: "WsiPoint", BOUNDING_BOX: "WsiRectangle", POLYGON: "WsiPolygon", FREEHAND: "WsiFreehand", TEXT: "WsiText" }[type];
}

function pointsForRectangle(start: ImagePoint, end: ImagePoint): ImagePoint[] {
  return [[start[0], start[1]], [end[0], start[1]], [end[0], end[1]], [start[0], end[1]]];
}

function annotationDetailUrl(listEndpoint: string, annotationId: string) {
  return `${listEndpoint.split("?", 1)[0].replace(/\/$/, "")}/${annotationId}/`;
}

function isTemporaryAnnotation(annotation: WsiAnnotation) {
  return annotation.id.startsWith("temp-");
}

export function WsiAnnotationLayer({
  viewer,
  toolbarElement,
  endpoint,
  imageAssetId,
  slideId,
  imageWidth,
  imageHeight,
  createViewerPoint,
  authorizedFetch,
  writable,
}: {
  viewer: OpenSeadragonType.Viewer | null;
  toolbarElement: HTMLElement | null;
  endpoint: string;
  imageAssetId: string;
  slideId: string;
  imageWidth: number;
  imageHeight: number;
  /** Supplied by the component that owns this OpenSeadragon instance. */
  createViewerPoint: CreateViewerPoint;
  authorizedFetch: AuthorizedFetch;
  writable: boolean;
}) {
  const [loaded, setLoaded] = useState<{ identity: string; annotations: WsiAnnotation[] }>({ identity: "", annotations: [] });
  const [activeTool, setActiveTool] = useState<WsiAnnotationType | "PAN">("PAN");
  const [selectedId, setSelectedId] = useState("");
  const [draftPoints, setDraftPoints] = useState<ImagePoint[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<{ identity: string; message: string }>({ identity: "", message: "" });
  const [annotationLoadFailed, setAnnotationLoadFailed] = useState(false);
  const [annotationReloadNonce, setAnnotationReloadNonce] = useState(0);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState<string | null>(null);
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const [serverWritable, setServerWritable] = useState(true);
  const [viewRevision, setViewRevision] = useState(0);
  const activeIdentity = useRef("");
  const drawing = useRef(false);
  const mutationLocked = useRef(false);
  const nextTemporaryId = useRef(0);
  const projectionFrame = useRef<number | null>(null);
  const identity = `${slideId}:${imageAssetId}`;

  useEffect(() => {
    activeIdentity.current = identity;
    const controller = new AbortController();
    void authorizedFetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error("Annotation을 불러오지 못했습니다.");
        setServerWritable(response.headers.get("X-Annotation-Writable") !== "false");
        if (!Array.isArray(body)) throw new Error("Annotation 응답 형식이 올바르지 않습니다.");
        if (!controller.signal.aborted && activeIdentity.current === identity) {
          const serverAnnotations = body as WsiAnnotation[];
          setLoaded((current) => ({
            identity,
            annotations: [
              ...serverAnnotations,
              ...(current.identity === identity
                ? current.annotations.filter(isTemporaryAnnotation)
                : []),
            ],
          }));
          setError({ identity, message: "" });
          setAnnotationLoadFailed(false);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && activeIdentity.current === identity) {
          setError({ identity, message: cause instanceof Error ? cause.message : "Annotation을 불러오지 못했습니다." });
          setAnnotationLoadFailed(true);
        }
      });
    return () => controller.abort();
  }, [annotationReloadNonce, authorizedFetch, endpoint, identity]);

  const canWrite = writable && serverWritable;

  useEffect(() => {
    if (!viewer) return;
    const redraw = () => {
      if (projectionFrame.current !== null) return;
      projectionFrame.current = window.requestAnimationFrame(() => {
        projectionFrame.current = null;
        setViewRevision((value) => value + 1);
      });
    };
    viewer.addHandler("animation", redraw);
    viewer.addHandler("resize", redraw);
    viewer.addHandler("open", redraw);
    return () => {
      viewer.removeHandler("animation", redraw);
      viewer.removeHandler("resize", redraw);
      viewer.removeHandler("open", redraw);
      if (projectionFrame.current !== null) window.cancelAnimationFrame(projectionFrame.current);
      projectionFrame.current = null;
    };
  }, [viewer]);

  useEffect(() => {
    if (!viewer) return;
    const drawingMode = canWrite && activeTool !== "PAN";
    viewer.setMouseNavEnabled(!drawingMode);
  }, [activeTool, canWrite, viewer]);

  const imagePoint = useCallback((event: ReactPointerEvent<SVGSVGElement>): ImagePoint | null => {
    if (!viewer) return null;
    // pointFromPixel expects a real OpenSeadragon.Point: internally it calls
    // Point#minus, so a structural { x, y } cast is not sufficient.
    const viewerRect = viewer.element.getBoundingClientRect();
    const viewerPixel = createViewerPoint(
      event.clientX - viewerRect.left,
      event.clientY - viewerRect.top,
    );
    const viewportPoint = viewer.viewport.pointFromPixel(viewerPixel);
    const point = viewer.viewport.viewportToImageCoordinates(viewportPoint);
    return [Math.max(0, Math.min(imageWidth, point.x)), Math.max(0, Math.min(imageHeight, point.y))];
  }, [createViewerPoint, imageHeight, imageWidth, viewer]);

  const screenPoint = useCallback((point: ImagePoint) => {
    if (!viewer) return [0, 0] as ImagePoint;
    const result = viewer.viewport.imageToViewerElementCoordinates(createViewerPoint(point[0], point[1]));
    return [result.x, result.y] as ImagePoint;
  }, [createViewerPoint, viewer]);

  const stage = useCallback((type: WsiAnnotationType, points: ImagePoint[], annotationText?: string) => {
    const trimmed = annotationText?.trim();
    if (type === "TEXT" && !trimmed) {
      setError({ identity, message: "Text annotation은 공백으로 저장할 수 없습니다." });
      return;
    }
    const temporaryId = `temp-${Date.now()}-${++nextTemporaryId.current}`;
    const optimistic: WsiAnnotation = {
      id: temporaryId,
      image_asset: imageAssetId,
      annotation_type: type,
      annotation_data: {
        coordinate_space: "WSI_IMAGE",
        slide_id: slideId,
        image_width: imageWidth,
        image_height: imageHeight,
        image_points: points,
        tool_name: toolName(type),
        ...(trimmed ? { text: trimmed } : {}),
      },
    };
    setLoaded((current) => ({
      identity,
      annotations: [...(current.identity === identity ? current.annotations : []), optimistic],
    }));
    setSelectedId(temporaryId);
    setDraftPoints([]);
    setText("");
    setError({ identity, message: "" });
  }, [identity, imageAssetId, imageHeight, imageWidth, slideId]);

  const persistStaged = useCallback(async () => {
    if (mutationLocked.current) return;
    const staged = loaded.identity === identity ? loaded.annotations.filter(isTemporaryAnnotation) : [];
    if (staged.length === 0) return;
    mutationLocked.current = true;
    setPendingSaveCount((count) => count + 1);
    setError({ identity, message: "" });
    try {
      const results = await Promise.allSettled(staged.map(async (annotation) => {
        const response = await authorizedFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_asset: imageAssetId,
            annotation_type: annotation.annotation_type,
            annotation_data: annotation.annotation_data,
          }),
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error("Annotation을 저장하지 못했습니다.");
        return [annotation.id, body as WsiAnnotation] as const;
      }));
      const saved = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      if (activeIdentity.current === identity) {
        const savedByTemporaryId = new Map(saved);
        setLoaded((current) => current.identity !== identity ? current : {
          identity,
          annotations: current.annotations.map((annotation) => savedByTemporaryId.get(annotation.id) ?? annotation),
        });
        setSelectedId((current) => savedByTemporaryId.get(current)?.id ?? current);
      }
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected" && activeIdentity.current === identity) {
        setError({ identity, message: failed.reason instanceof Error ? failed.reason.message : "Annotation을 저장하지 못했습니다." });
      }
    } catch (cause) {
      if (activeIdentity.current === identity) setError({ identity, message: cause instanceof Error ? cause.message : "Annotation을 저장하지 못했습니다." });
    } finally {
      mutationLocked.current = false;
      setPendingSaveCount((count) => Math.max(0, count - 1));
    }
  }, [authorizedFetch, endpoint, identity, imageAssetId, loaded]);

  const deleteSelected = useCallback(async () => {
    if (mutationLocked.current) return;
    if (!selectedId || loaded.identity !== identity) return;
    if (selectedId.startsWith("temp-")) {
      setLoaded((current) => ({ identity, annotations: current.identity === identity ? current.annotations.filter((annotation) => annotation.id !== selectedId) : [] }));
      setSelectedId("");
      return;
    }
    mutationLocked.current = true;
    setPendingSaveCount((count) => count + 1);
    setError({ identity, message: "" });
    try {
      const response = await authorizedFetch(annotationDetailUrl(endpoint, selectedId), { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error("Annotation을 삭제하지 못했습니다.");
      if (activeIdentity.current === identity) {
        setLoaded((current) => ({ identity, annotations: current.identity === identity ? current.annotations.filter((annotation) => annotation.id !== selectedId) : [] }));
        setSelectedId("");
      }
    } catch (cause) {
      if (activeIdentity.current === identity) setError({ identity, message: cause instanceof Error ? cause.message : "Annotation을 삭제하지 못했습니다." });
    } finally {
      mutationLocked.current = false;
      setPendingSaveCount((count) => Math.max(0, count - 1));
    }
  }, [authorizedFetch, endpoint, identity, loaded.identity, selectedId]);

  const deleteAll = useCallback(() => {
    if (loaded.identity !== identity || loaded.annotations.length === 0) return;
    setConfirmDeleteAll(identity);
  }, [identity, loaded.annotations.length, loaded.identity]);

  const executeDeleteAll = useCallback(async () => {
    if (mutationLocked.current) return;
    if (loaded.identity !== identity || loaded.annotations.length === 0) return;
    const deletedIds = new Set(loaded.annotations.map((annotation) => annotation.id));
    setConfirmDeleteAll(null);
    mutationLocked.current = true;
    setPendingSaveCount((count) => count + 1);
    setError({ identity, message: "" });
    try {
      const response = await authorizedFetch(endpoint, { method: "DELETE" });
      if (!response.ok) throw new Error("Annotation을 모두 삭제하지 못했습니다.");
      if (activeIdentity.current === identity) {
        setLoaded((current) => current.identity !== identity ? current : { identity, annotations: current.annotations.filter((annotation) => !deletedIds.has(annotation.id)) });
        setSelectedId((current) => deletedIds.has(current) ? "" : current);
      }
    } catch (cause) {
      if (activeIdentity.current === identity) setError({ identity, message: cause instanceof Error ? cause.message : "Annotation을 모두 삭제하지 못했습니다." });
    } finally {
      mutationLocked.current = false;
      setPendingSaveCount((count) => Math.max(0, count - 1));
    }
  }, [authorizedFetch, endpoint, identity, loaded]);

  const finishPolygon = () => {
    if (draftPoints.length >= 3) stage("POLYGON", draftPoints);
  };
  void viewRevision;
  const saving = pendingSaveCount > 0;
  const annotations = loaded.identity === identity ? loaded.annotations : [];
  const rendered = annotations.map((annotation) => ({
    ...annotation,
    screenPoints: annotation.annotation_data.image_points.map(screenPoint),
  }));

  const toolbar = toolbarElement ? createPortal(
    <div className="flex w-max shrink-0 items-center gap-1" aria-label="WSI Annotation 도구">
      {TOOLS.map((tool) => <button key={tool.type} type="button" disabled={!canWrite && tool.type !== "PAN"} aria-pressed={activeTool === tool.type} onClick={() => { setActiveTool(tool.type); setDraftPoints([]); }} className={`inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold leading-none ${activeTool === tool.type ? "border-blue-500 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-40`}>{tool.label}</button>)}
      {activeTool === "TEXT" && canWrite ? <input aria-label="Annotation text" value={text} onChange={(event) => setText(event.target.value)} placeholder="메모" className="h-8 w-28 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800" /> : null}
      {activeTool === "POLYGON" && draftPoints.length > 0 ? <button type="button" onClick={finishPolygon} disabled={draftPoints.length < 3 || saving} className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-blue-600 px-2.5 text-xs font-semibold leading-none text-white disabled:opacity-40">완료</button> : null}
      <button type="button" onClick={() => void persistStaged()} disabled={!canWrite || !annotations.some(isTemporaryAnnotation) || saving} className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-blue-600 bg-blue-600 px-2.5 text-xs font-semibold leading-none text-white disabled:opacity-40">주석 저장</button>
      <button type="button" onClick={() => void deleteSelected()} disabled={!canWrite || loaded.identity !== identity || !selectedId || saving} className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-rose-300 bg-white px-2.5 text-xs font-semibold leading-none text-rose-700 disabled:opacity-40">선택 삭제</button>
      <button type="button" onClick={() => void deleteAll()} disabled={!canWrite || loaded.identity !== identity || annotations.length === 0 || saving} className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-rose-500 bg-rose-50 px-2.5 text-xs font-semibold leading-none text-rose-700 disabled:opacity-40">전체 삭제</button>
      <span className="inline-flex h-8 shrink-0 items-center whitespace-nowrap px-1.5 text-xs font-medium tabular-nums text-slate-500">{annotations.length}개</span>
    </div>,
    toolbarElement,
  ) : null;

  return <>
    {toolbar}
    <svg
      data-wsi-layer="annotation"
      aria-label="WSI Annotation layer"
      className={`absolute inset-0 z-20 h-full w-full ${canWrite && activeTool !== "PAN" ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
      onPointerDown={(event) => {
        if (!canWrite || activeTool === "PAN") return;
        const point = imagePoint(event);
        if (!point) return;
        drawing.current = true;
        if (activeTool === "POINT") { stage("POINT", [point]); drawing.current = false; }
        else if (activeTool === "TEXT") { stage("TEXT", [point], text); drawing.current = false; }
        else if (activeTool === "POLYGON") setDraftPoints((current) => [...current, point]);
        else setDraftPoints([point]);
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drawing.current || activeTool === "PAN" || activeTool === "POINT" || activeTool === "TEXT" || activeTool === "POLYGON") return;
        const point = imagePoint(event);
        if (!point) return;
        setDraftPoints((current) => activeTool === "BOUNDING_BOX" ? [current[0], point] : [...current, point]);
      }}
      onPointerUp={() => {
        if (!drawing.current) return;
        drawing.current = false;
        if (activeTool === "BOUNDING_BOX" && draftPoints.length === 2) stage("BOUNDING_BOX", pointsForRectangle(draftPoints[0], draftPoints[1]));
        if (activeTool === "FREEHAND" && draftPoints.length >= 2) stage("FREEHAND", draftPoints);
      }}
    >
      {rendered.map((annotation) => <AnnotationShape key={annotation.id} annotation={annotation} selected={selectedId === annotation.id} onSelect={() => setSelectedId(annotation.id)} />)}
      {draftPoints.length > 0 ? <polyline points={draftPoints.map(screenPoint).map((point) => point.join(",")).join(" ")} fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 3" /> : null}
    </svg>
    {error.identity === identity && error.message ? <div role="alert" className="pointer-events-auto absolute bottom-3 right-3 z-30 flex items-center gap-2 rounded border border-amber-400/50 bg-slate-950/90 px-3 py-2 text-xs text-amber-200"><span>{error.message} WSI는 계속 사용할 수 있습니다.</span>{annotationLoadFailed ? <button type="button" onClick={() => { setAnnotationLoadFailed(false); setAnnotationReloadNonce((value) => value + 1); }} className="min-h-8 rounded border border-amber-300/60 px-2 py-1 font-semibold">다시 시도</button> : null}</div> : null}
    {confirmDeleteAll === identity && <ConfirmActionDialog title="WSI 주석 전체 삭제" description={`현재 슬라이드의 의료진 주석 ${annotations.length}개를 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.`} confirmLabel="전체 삭제" onCancel={() => setConfirmDeleteAll(null)} onConfirm={() => void executeDeleteAll()} />}
  </>;
}

const AnnotationShape = memo(function AnnotationShape({ annotation, selected, onSelect }: { annotation: WsiAnnotation & { screenPoints: ImagePoint[] }; selected: boolean; onSelect: () => void }) {
  const points = annotation.screenPoints.map((point) => point.join(",")).join(" ");
  const stroke = selected ? "#fbbf24" : "#38bdf8";
  const common = { stroke, strokeWidth: selected ? 3 : 2, onPointerDown: (event: ReactPointerEvent) => { event.stopPropagation(); onSelect(); }, className: "pointer-events-auto cursor-pointer" };
  if (annotation.annotation_type === "POINT") return <circle cx={annotation.screenPoints[0]?.[0]} cy={annotation.screenPoints[0]?.[1]} r="5" fill={stroke} {...common} />;
  if (annotation.annotation_type === "TEXT") return <g onPointerDown={common.onPointerDown} className={common.className}><circle cx={annotation.screenPoints[0]?.[0]} cy={annotation.screenPoints[0]?.[1]} r="4" fill={stroke} /><text x={(annotation.screenPoints[0]?.[0] ?? 0) + 8} y={(annotation.screenPoints[0]?.[1] ?? 0) - 8} fill={stroke} fontSize="12" stroke="rgba(2,6,23,.9)" strokeWidth="3" paintOrder="stroke">{annotation.annotation_data.text}</text></g>;
  return annotation.annotation_type === "FREEHAND" ? <polyline points={points} fill="none" {...common} /> : <polygon points={points} fill="rgba(56,189,248,.12)" {...common} />;
});
