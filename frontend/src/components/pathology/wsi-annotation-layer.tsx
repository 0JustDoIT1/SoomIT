"use client";

import type OpenSeadragonType from "openseadragon";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type WsiAnnotationType = "POINT" | "BOUNDING_BOX" | "POLYGON" | "FREEHAND" | "TEXT";
type ImagePoint = [number, number];
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

export function WsiAnnotationLayer({
  viewer,
  toolbarElement,
  endpoint,
  imageAssetId,
  slideId,
  imageWidth,
  imageHeight,
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
  authorizedFetch: AuthorizedFetch;
  writable: boolean;
}) {
  const [loaded, setLoaded] = useState<{ identity: string; annotations: WsiAnnotation[] }>({ identity: "", annotations: [] });
  const [activeTool, setActiveTool] = useState<WsiAnnotationType | "PAN">("PAN");
  const [selectedId, setSelectedId] = useState("");
  const [draftPoints, setDraftPoints] = useState<ImagePoint[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<{ identity: string; message: string }>({ identity: "", message: "" });
  const [saving, setSaving] = useState(false);
  const [serverWritable, setServerWritable] = useState(true);
  const [viewRevision, setViewRevision] = useState(0);
  const activeIdentity = useRef("");
  const drawing = useRef(false);
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
          setLoaded({ identity, annotations: body as WsiAnnotation[] });
          setError({ identity, message: "" });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && activeIdentity.current === identity) {
          setError({ identity, message: cause instanceof Error ? cause.message : "Annotation을 불러오지 못했습니다." });
        }
      });
    return () => controller.abort();
  }, [authorizedFetch, endpoint, identity]);

  const canWrite = writable && serverWritable;

  useEffect(() => {
    if (!viewer) return;
    const redraw = () => setViewRevision((value) => value + 1);
    viewer.addHandler("animation", redraw);
    viewer.addHandler("resize", redraw);
    viewer.addHandler("open", redraw);
    return () => {
      viewer.removeHandler("animation", redraw);
      viewer.removeHandler("resize", redraw);
      viewer.removeHandler("open", redraw);
    };
  }, [viewer]);

  useEffect(() => {
    if (!viewer) return;
    const drawingMode = canWrite && activeTool !== "PAN";
    viewer.setMouseNavEnabled(!drawingMode);
    return () => { viewer.setMouseNavEnabled(true); };
  }, [activeTool, canWrite, viewer]);

  const imagePoint = useCallback((event: ReactPointerEvent<SVGSVGElement>): ImagePoint | null => {
    if (!viewer) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const viewportPoint = viewer.viewport.pointFromPixel({ x: event.clientX - rect.left, y: event.clientY - rect.top } as OpenSeadragonType.Point);
    const point = viewer.viewport.viewportToImageCoordinates(viewportPoint);
    return [Math.max(0, Math.min(imageWidth, point.x)), Math.max(0, Math.min(imageHeight, point.y))];
  }, [imageHeight, imageWidth, viewer]);

  const screenPoint = (point: ImagePoint) => {
    if (!viewer) return [0, 0] as ImagePoint;
    const result = viewer.viewport.imageToViewerElementCoordinates({ x: point[0], y: point[1] } as OpenSeadragonType.Point);
    return [result.x, result.y] as ImagePoint;
  };

  const save = useCallback(async (type: WsiAnnotationType, points: ImagePoint[], annotationText?: string) => {
    const trimmed = annotationText?.trim();
    if (type === "TEXT" && !trimmed) {
      setError({ identity, message: "Text annotation은 공백으로 저장할 수 없습니다." });
      return;
    }
    setSaving(true);
    setError({ identity, message: "" });
    try {
      const response = await authorizedFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Annotation을 저장하지 못했습니다.");
      if (activeIdentity.current === identity) {
        setLoaded((current) => ({ identity, annotations: [...(current.identity === identity ? current.annotations : []), body as WsiAnnotation] }));
        setSelectedId((body as WsiAnnotation).id);
        setDraftPoints([]);
        setText("");
      }
    } catch (cause) {
      if (activeIdentity.current === identity) setError({ identity, message: cause instanceof Error ? cause.message : "Annotation을 저장하지 못했습니다." });
    } finally {
      if (activeIdentity.current === identity) setSaving(false);
    }
  }, [authorizedFetch, endpoint, identity, imageAssetId, imageHeight, imageWidth, slideId]);

  const deleteSelected = useCallback(async () => {
    if (!selectedId || loaded.identity !== identity) return;
    setSaving(true);
    setError({ identity, message: "" });
    try {
      const response = await authorizedFetch(`${endpoint}${selectedId}/`, { method: "DELETE" });
      if (!response.ok) throw new Error("Annotation을 삭제하지 못했습니다.");
      if (activeIdentity.current === identity) {
        setLoaded((current) => ({ identity, annotations: current.identity === identity ? current.annotations.filter((annotation) => annotation.id !== selectedId) : [] }));
        setSelectedId("");
      }
    } catch (cause) {
      if (activeIdentity.current === identity) setError({ identity, message: cause instanceof Error ? cause.message : "Annotation을 삭제하지 못했습니다." });
    } finally {
      if (activeIdentity.current === identity) setSaving(false);
    }
  }, [authorizedFetch, endpoint, identity, loaded.identity, selectedId]);

  const finishPolygon = () => {
    if (draftPoints.length >= 3) void save("POLYGON", draftPoints);
  };
  void viewRevision;
  const annotations = loaded.identity === identity ? loaded.annotations : [];
  const rendered = annotations.map((annotation) => ({
    ...annotation,
    screenPoints: annotation.annotation_data.image_points.map(screenPoint),
  }));

  const toolbar = toolbarElement ? createPortal(
    <div className="flex min-w-0 items-center gap-1" aria-label="WSI Annotation 도구">
      {TOOLS.map((tool) => <button key={tool.type} type="button" disabled={!canWrite && tool.type !== "PAN"} aria-pressed={activeTool === tool.type} onClick={() => { setActiveTool(tool.type); setDraftPoints([]); }} className={`rounded border px-2 py-1 text-[10px] font-semibold ${activeTool === tool.type ? "border-blue-500 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"} disabled:cursor-not-allowed disabled:opacity-40`}>{tool.label}</button>)}
      {activeTool === "TEXT" && canWrite ? <input aria-label="Annotation text" value={text} onChange={(event) => setText(event.target.value)} placeholder="메모" className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-800" /> : null}
      {activeTool === "POLYGON" && draftPoints.length > 0 ? <button type="button" onClick={finishPolygon} disabled={draftPoints.length < 3 || saving} className="rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40">완료</button> : null}
      <button type="button" onClick={() => void deleteSelected()} disabled={!canWrite || loaded.identity !== identity || !selectedId || saving} className="rounded border border-rose-300 bg-white px-2 py-1 text-[10px] font-semibold text-rose-700 disabled:opacity-40">선택 삭제</button>
      <span className="text-[10px] text-slate-500">{annotations.length}개</span>
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
        if (activeTool === "POINT") { void save("POINT", [point]); drawing.current = false; }
        else if (activeTool === "TEXT") { void save("TEXT", [point], text); drawing.current = false; }
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
        if (activeTool === "BOUNDING_BOX" && draftPoints.length === 2) void save("BOUNDING_BOX", pointsForRectangle(draftPoints[0], draftPoints[1]));
        if (activeTool === "FREEHAND" && draftPoints.length >= 2) void save("FREEHAND", draftPoints);
      }}
    >
      {rendered.map((annotation) => <AnnotationShape key={annotation.id} annotation={annotation} selected={selectedId === annotation.id} onSelect={() => setSelectedId(annotation.id)} />)}
      {draftPoints.length > 0 ? <polyline points={draftPoints.map(screenPoint).map((point) => point.join(",")).join(" ")} fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 3" /> : null}
    </svg>
    {error.identity === identity && error.message ? <div role="alert" className="pointer-events-none absolute bottom-3 right-3 z-30 rounded border border-amber-400/50 bg-slate-950/90 px-3 py-2 text-[10px] text-amber-200">{error.message} WSI는 계속 사용할 수 있습니다.</div> : null}
  </>;
}

function AnnotationShape({ annotation, selected, onSelect }: { annotation: WsiAnnotation & { screenPoints: ImagePoint[] }; selected: boolean; onSelect: () => void }) {
  const points = annotation.screenPoints.map((point) => point.join(",")).join(" ");
  const stroke = selected ? "#fbbf24" : "#38bdf8";
  const common = { stroke, strokeWidth: selected ? 3 : 2, onPointerDown: (event: ReactPointerEvent) => { event.stopPropagation(); onSelect(); }, className: "pointer-events-auto cursor-pointer" };
  if (annotation.annotation_type === "POINT") return <circle cx={annotation.screenPoints[0]?.[0]} cy={annotation.screenPoints[0]?.[1]} r="5" fill={stroke} {...common} />;
  if (annotation.annotation_type === "TEXT") return <g onPointerDown={common.onPointerDown} className={common.className}><circle cx={annotation.screenPoints[0]?.[0]} cy={annotation.screenPoints[0]?.[1]} r="4" fill={stroke} /><text x={(annotation.screenPoints[0]?.[0] ?? 0) + 8} y={(annotation.screenPoints[0]?.[1] ?? 0) - 8} fill={stroke} fontSize="12" stroke="rgba(2,6,23,.9)" strokeWidth="3" paintOrder="stroke">{annotation.annotation_data.text}</text></g>;
  return annotation.annotation_type === "FREEHAND" ? <polyline points={points} fill="none" {...common} /> : <polygon points={points} fill="rgba(56,189,248,.12)" {...common} />;
}
