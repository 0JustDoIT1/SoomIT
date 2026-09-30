"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ensureCornerstoneInitialized } from "../../../radiology/_lib/cornerstone-init";
import { preventMedicalImageContextMenu } from "@/components/medical-imaging/medical-image-context-menu";
import { showToast } from "@/components/ui/toast/toast";
import {
  imageAnnotationRequestKey,
  invalidateImageAnnotationRequest,
  loadImageAnnotations,
  shouldNotifyImageAnnotationLoadFailure,
} from "./image-annotation-request";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Asset = { id: string; workflow_stage: string; image_type: string; file_format: string; status: string; series_instance_uid?: string | null };
type Annotation = { id: string; annotation_type: "LENGTH" | "BOUNDING_BOX" | "TEXT"; annotation_data: Record<string, unknown> };
type ToolMode = "WL" | "ZOOM" | "PAN" | "LENGTH" | "ROI" | "TEXT";

const message = (body: unknown, fallback: string) => body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : fallback;
const sopUid = (row: unknown) => row && typeof row === "object" && "00080018" in row && row["00080018"] && typeof row["00080018"] === "object" && "Value" in row["00080018"] && Array.isArray(row["00080018"].Value) && typeof row["00080018"].Value[0] === "string" ? row["00080018"].Value[0] : null;

export function CaseDicomEvidence({ apiBaseUrl, authorizedFetch, caseId, stage }: { apiBaseUrl: string; authorizedFetch: AuthorizedFetch; caseId: string; stage: string }) {
  const viewerFrameRef = useRef<HTMLElement>(null);
  const elementRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [uids, setUids] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationLoading, setAnnotationLoading] = useState(false);
  const [annotationLoadError, setAnnotationLoadError] = useState("");
  const [annotationMutationError, setAnnotationMutationError] = useState("");
  const [annotationReloadNonce, setAnnotationReloadNonce] = useState(0);
  const [activeTool, setActiveTool] = useState<ToolMode>("WL");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [dirtyAnnotationIds, setDirtyAnnotationIds] = useState<Set<string>>(() => new Set());
  const annotationSaveRef = useRef<(annotation: Omit<Annotation, "id">) => void>(() => undefined);
  const annotationUpdateRef = useRef<(annotationId: string, annotation: Omit<Annotation, "id">) => void>(() => undefined);
  const annotationTextRef = useRef("");
  const nextTemporaryAnnotationIdRef = useRef(0);
  const assetCaseIdRef = useRef("");
  const annotationRequestRef = useRef("");
  const asset = assets.find((item) => item.id === selectedAssetId) ?? null;
  const isTnm = stage === "PET_CT_TNM";
  const selectedAnnotationVisible = Boolean(selectedAnnotationId && annotations.some(
    (annotation) => annotation.id === selectedAnnotationId && annotation.annotation_data.sop_instance_uid === uids[index],
  ));

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setError(""); setUids([]);
      try {
        const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/`, { signal: controller.signal });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(message(payload, "영상 목록을 불러오지 못했습니다."));
        const nextAssets = (Array.isArray(payload) ? payload as Asset[] : []).filter((item) => item.workflow_stage === stage && item.status === "READY" && (item.image_type === "CT" || item.image_type === "PET"));
        if (!nextAssets.length) throw new Error("조회 가능한 DICOM Series가 없습니다.");
        if (!controller.signal.aborted) { assetCaseIdRef.current = caseId; setAssets(nextAssets); setSelectedAssetId(nextAssets[0].id); }
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "DICOM 조회 중 오류가 발생했습니다."); setLoading(false); }
      }
    })();
    return () => controller.abort();
  }, [apiBaseUrl, authorizedFetch, caseId, stage]);

  useEffect(() => {
    if (!asset) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setError(""); setUids([]);
      try {
        const instances = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/${asset.id}/dicom-web/instances/`, { signal: controller.signal });
        const instancePayload: unknown = await instances.json();
        if (!instances.ok) throw new Error(message(instancePayload, "DICOM instance 목록을 불러오지 못했습니다."));
        const nextUids = (Array.isArray(instancePayload) ? instancePayload : []).map(sopUid).filter((uid): uid is string => Boolean(uid));
        if (!nextUids.length) throw new Error("DICOM instance가 없습니다.");
        if (!controller.signal.aborted) { setUids(nextUids); setIndex(Math.floor(nextUids.length / 2)); setLoading(false); }
      } catch (cause) {
        if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "DICOM 조회 중 오류가 발생했습니다."); setLoading(false); }
      }
    })();
    return () => controller.abort();
  }, [apiBaseUrl, asset, authorizedFetch, caseId]);

  const saveAnnotation = useCallback(async (annotation: Omit<Annotation, "id">) => {
    if (!asset) return;
    const id = `temp-${Date.now()}-${++nextTemporaryAnnotationIdRef.current}`;
    setDirtyAnnotationIds((current) => new Set(current).add(id));
    setAnnotations((current) => [...current, { id, ...annotation }]);
  }, [asset]);

  const deleteSelectedAnnotation = useCallback(async () => {
    const selected = annotations.find((annotation) => annotation.id === selectedAnnotationId);
    if (!selected) return;
    if (selected.id.startsWith("temp-")) {
      setDirtyAnnotationIds((current) => { const next = new Set(current); next.delete(selected.id); return next; });
      setAnnotations((current) => current.filter((annotation) => annotation.id !== selected.id));
      setSelectedAnnotationId(null);
      return;
    }
    try {
      setAnnotationMutationError("");
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-annotations/${selected.id}/`, { method: "DELETE" });
      const body: unknown = response.ok ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(body, "선택한 주석을 삭제하지 못했습니다."));
      setAnnotations((current) => current.filter((annotation) => annotation.id !== selected.id));
      setSelectedAnnotationId(null);
      if (asset?.series_instance_uid) {
        invalidateImageAnnotationRequest({ caseId, imageAssetId: asset.id, seriesInstanceUid: asset.series_instance_uid });
      }
    } catch (error) {
      const failure = error instanceof Error ? error.message : "선택한 주석을 삭제하지 못했습니다.";
      setAnnotationMutationError(failure);
      showToast.error(failure);
    }
  }, [annotations, apiBaseUrl, asset, authorizedFetch, caseId, selectedAnnotationId]);

  const deleteAllAnnotations = useCallback(async () => {
    if (!asset?.series_instance_uid || annotations.length === 0) return;
    if (!window.confirm("현재 영상의 의료진 주석을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    const query = new URLSearchParams({ image_asset_id: asset.id, series_instance_uid: asset.series_instance_uid });
    try {
      setAnnotationMutationError("");
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-annotations/?${query.toString()}`, { method: "DELETE" });
      const body: unknown = response.ok ? null : await response.json().catch(() => null);
      if (!response.ok) throw new Error(message(body, "주석 전체를 삭제하지 못했습니다."));
      setAnnotations([]);
      setDirtyAnnotationIds(new Set());
      setSelectedAnnotationId(null);
      invalidateImageAnnotationRequest({ caseId, imageAssetId: asset.id, seriesInstanceUid: asset.series_instance_uid });
    } catch (error) {
      const failure = error instanceof Error ? error.message : "주석 전체를 삭제하지 못했습니다.";
      setAnnotationMutationError(failure);
      showToast.error(failure);
    }
  }, [annotations.length, apiBaseUrl, asset, authorizedFetch, caseId]);

  const updateAnnotation = useCallback(async (annotationId: string, annotation: Omit<Annotation, "id">) => {
    setDirtyAnnotationIds((current) => new Set(current).add(annotationId));
    setAnnotations((current) => current.map((item) => item.id === annotationId ? { id: annotationId, ...annotation } : item));
  }, []);

  const persistAnnotations = useCallback(async () => {
    if (!asset) return;
    const pending = annotations.filter((annotation) => dirtyAnnotationIds.has(annotation.id));
    if (pending.length === 0) return;
    setAnnotationMutationError("");
    const results = await Promise.allSettled(pending.map(async (annotation) => {
        const temporary = annotation.id.startsWith("temp-");
        const response = await authorizedFetch(
          temporary
            ? `${apiBaseUrl}/api/doctor/cases/${caseId}/image-annotations/`
            : `${apiBaseUrl}/api/doctor/cases/${caseId}/image-annotations/${annotation.id}/`,
          {
            method: temporary ? "POST" : "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...(temporary ? { image_asset: asset.id } : {}), annotation_type: annotation.annotation_type, annotation_data: annotation.annotation_data }),
          },
        );
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !body || typeof body !== "object") throw new Error(message(body, "주석을 저장하지 못했습니다."));
        return [annotation.id, body as Annotation] as const;
      }));
    const saved = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    if (saved.length) {
      const savedById = new Map(saved);
      setAnnotations((current) => current.map((annotation) => savedById.get(annotation.id) ?? annotation));
      setDirtyAnnotationIds((current) => {
        const next = new Set(current);
        saved.forEach(([id]) => next.delete(id));
        return next;
      });
      if (asset?.series_instance_uid) {
        invalidateImageAnnotationRequest({ caseId, imageAssetId: asset.id, seriesInstanceUid: asset.series_instance_uid });
      }
    }
    const failed = results.find(result => result.status === "rejected");
    if (failed?.status === "rejected") {
      const failure = failed.reason instanceof Error ? failed.reason.message : "일부 주석을 저장하지 못했습니다.";
      setAnnotationMutationError(failure);
      showToast.error(failure);
    } else if (saved.length) showToast.success("주석이 저장되었습니다.");
  }, [annotations, apiBaseUrl, asset, authorizedFetch, caseId, dirtyAnnotationIds]);

  const retryAnnotationLoad = useCallback(() => {
    if (!asset?.series_instance_uid) return;
    invalidateImageAnnotationRequest({ caseId, imageAssetId: asset.id, seriesInstanceUid: asset.series_instance_uid });
    setAnnotationReloadNonce(current => current + 1);
  }, [asset, caseId]);

  useEffect(() => { annotationSaveRef.current = saveAnnotation; }, [saveAnnotation]);
  useEffect(() => { annotationUpdateRef.current = updateAnnotation; }, [updateAnnotation]);
  useEffect(() => { annotationTextRef.current = annotationText; }, [annotationText]);
  const selectAnnotation = (annotation: Annotation) => {
    setSelectedAnnotationId(annotation.id);
    setAnnotationText(typeof annotation.annotation_data.text === "string" ? annotation.annotation_data.text : "");
  };

  useEffect(() => {
    const imageAssetId = asset?.id?.trim();
    const seriesInstanceUid = asset?.series_instance_uid?.trim();
    if (assetCaseIdRef.current !== caseId || !imageAssetId || !seriesInstanceUid) {
      annotationRequestRef.current = "";
      setAnnotations([]);
      setDirtyAnnotationIds(new Set());
      setSelectedAnnotationId(null);
      setAnnotationLoading(false);
      setAnnotationLoadError("");
      return;
    }

    const requestKey = imageAnnotationRequestKey({ caseId, imageAssetId, seriesInstanceUid });
    annotationRequestRef.current = requestKey;
    let active = true;
    setAnnotations([]);
    setDirtyAnnotationIds(new Set());
    setSelectedAnnotationId(null);
    setAnnotationLoading(true);
    setAnnotationLoadError("");

    void loadImageAnnotations<Annotation>({
      apiBaseUrl,
      authorizedFetch,
      caseId,
      imageAssetId,
      seriesInstanceUid,
    })
      .then((nextAnnotations) => {
        if (!active || annotationRequestRef.current !== requestKey) return;
        setAnnotations(nextAnnotations);
      })
      .catch((cause: unknown) => {
        if (!active || annotationRequestRef.current !== requestKey) return;
        const errorMessage = cause instanceof Error ? cause.message : "Annotation request failed.";
        setAnnotationLoadError(errorMessage);
        if (shouldNotifyImageAnnotationLoadFailure(requestKey)) {
          showToast.error("영상 주석을 불러오지 못했습니다.", {
            id: `pet-annotations-load-${requestKey}`,
          });
        }
      })
      .finally(() => {
        if (active && annotationRequestRef.current === requestKey) {
          setAnnotationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [annotationReloadNonce, apiBaseUrl, asset?.id, asset?.series_instance_uid, authorizedFetch, caseId]);

  useEffect(() => {
    if (!asset || !uids[index] || !elementRef.current) return;
    let cancelled = false;
    let engine: import("@cornerstonejs/core").RenderingEngine | null = null;
    let cleanupTools: (() => void) | null = null;
    void (async () => {
      try {
        const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/${asset.id}/dicom-web/instances/${uids[index]}/`, { headers: { Accept: "application/dicom" } });
        if (!response.ok) throw new Error("원본 DICOM을 불러오지 못했습니다.");
        const blob = await response.blob();
        const { core, tools, dicomImageLoader } = await ensureCornerstoneInitialized();
        if (cancelled || !elementRef.current) return;
        const imageId = dicomImageLoader.wadouri.fileManager.add(new File([blob], `${uids[index]}.dcm`, { type: "application/dicom" }));
        engine = new core.RenderingEngine(`respiratory-dicom-engine-${reactId}`);
        const viewportId = `respiratory-dicom-viewport-${reactId}`;
        engine.enableElement({ viewportId, type: core.Enums.ViewportType.STACK, element: elementRef.current });
        const toolGroupId = `respiratory-dicom-tools-${reactId}`;
        if (tools.ToolGroupManager.getToolGroup(toolGroupId)) tools.ToolGroupManager.destroyToolGroup(toolGroupId);
        const toolGroup = tools.ToolGroupManager.createToolGroup(toolGroupId);
        const ownedAnnotationUids = new Set<string>();
        [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.LengthTool, tools.RectangleROITool, tools.ArrowAnnotateTool].forEach((Tool) => tools.addTool(Tool));
        [tools.WindowLevelTool, tools.PanTool, tools.ZoomTool, tools.LengthTool, tools.RectangleROITool].forEach((Tool) => toolGroup?.addTool(Tool.toolName));
        toolGroup?.addTool(tools.ArrowAnnotateTool.toolName, {
          configuration: {
            getTextCallback: (done: (value: string) => void) => done(annotationTextRef.current.trim()),
            changeTextCallback: (_annotation: unknown, _eventDetail: unknown, done: (value: string) => void) => done(annotationTextRef.current.trim()),
          },
        });
        toolGroup?.addViewport(viewportId, engine.id);
        const activeName = activeTool === "WL" ? tools.WindowLevelTool.toolName : activeTool === "ZOOM" ? tools.ZoomTool.toolName : activeTool === "PAN" ? tools.PanTool.toolName : activeTool === "LENGTH" ? tools.LengthTool.toolName : activeTool === "ROI" ? tools.RectangleROITool.toolName : tools.ArrowAnnotateTool.toolName;
        [tools.WindowLevelTool.toolName, tools.PanTool.toolName, tools.ZoomTool.toolName, tools.LengthTool.toolName, tools.RectangleROITool.toolName, tools.ArrowAnnotateTool.toolName].forEach((name) => toolGroup?.setToolPassive(name, { removeAllBindings: true }));
        toolGroup?.setToolActive(activeName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] });
        const runtimeTools = tools as unknown as { eventTarget?: EventTarget; Enums?: { Events?: Record<string, string> } };
        const eventName = runtimeTools.Enums?.Events?.ANNOTATION_COMPLETED;
        const modifiedEventName = runtimeTools.Enums?.Events?.ANNOTATION_MODIFIED;
        const syncAnnotation = (event: Event, completed: boolean) => {
          const annotation = (event as CustomEvent<{ annotation?: Record<string, unknown> }>).detail?.annotation;
          const metadata = annotation?.metadata as Record<string, unknown> | undefined;
          const data = annotation?.data as Record<string, unknown> | undefined;
          const toolName = metadata?.toolName;
          const annotation_type: Annotation["annotation_type"] | null = toolName === tools.LengthTool.toolName ? "LENGTH" : toolName === tools.RectangleROITool.toolName ? "BOUNDING_BOX" : toolName === tools.ArrowAnnotateTool.toolName ? "TEXT" : null;
          const points = (data?.handles as { points?: unknown } | undefined)?.points;
          if (!annotation_type || !Array.isArray(points) || !asset.series_instance_uid || !uids[index]) return;
          if (typeof annotation?.annotationUID === "string") ownedAnnotationUids.add(annotation.annotationUID);
          const annotationId = typeof annotation?.annotationUID === "string" && annotation.annotationUID.startsWith("clinician-") ? annotation.annotationUID.slice("clinician-".length) : null;
          const text = annotation_type === "TEXT" ? annotationTextRef.current.trim() : undefined;
          if (annotation_type === "TEXT" && !text) return;
          const payload = { annotation_type, annotation_data: { series_instance_uid: asset.series_instance_uid, sop_instance_uid: uids[index], tool_name: String(toolName), viewport: "axial", frame_of_reference_uid: metadata?.FrameOfReferenceUID, world_points: points, cached_stats: data?.cachedStats, text } };
          if (annotationId) annotationUpdateRef.current(annotationId, payload);
          else if (completed) annotationSaveRef.current(payload);
        };
        if (runtimeTools.eventTarget && eventName) {
          const onCompleted = (event: Event) => syncAnnotation(event, true);
          const onModified = (event: Event) => syncAnnotation(event, false);
          runtimeTools.eventTarget.addEventListener(eventName, onCompleted);
          if (modifiedEventName) runtimeTools.eventTarget.addEventListener(modifiedEventName, onModified);
          cleanupTools = () => {
            runtimeTools.eventTarget?.removeEventListener(eventName, onCompleted);
            if (modifiedEventName) runtimeTools.eventTarget?.removeEventListener(modifiedEventName, onModified);
            ownedAnnotationUids.forEach((uid) => tools.annotation.state.removeAnnotation(uid));
            tools.ToolGroupManager.destroyToolGroup(toolGroupId);
          };
        }
        const viewport = engine.getViewport(viewportId) as InstanceType<typeof core.StackViewport>;
        await viewport.setStack([imageId]);
        const annotationState = (tools as unknown as { annotation?: { state?: { addAnnotation?: (annotation: Record<string, unknown>, element: HTMLDivElement) => void } } }).annotation?.state;
        const addAnnotation = annotationState?.addAnnotation;
        const annotationElement = elementRef.current;
        if (addAnnotation && annotationElement) {
          annotations
            .filter((saved) => saved.annotation_data.sop_instance_uid === uids[index])
            .forEach((saved) => {
              const points = saved.annotation_data.world_points;
              if (!Array.isArray(points)) return;
              const toolName = saved.annotation_type === "LENGTH" ? tools.LengthTool.toolName : saved.annotation_type === "BOUNDING_BOX" ? tools.RectangleROITool.toolName : tools.ArrowAnnotateTool.toolName;
              const annotationUID = `clinician-${saved.id}`;
              ownedAnnotationUids.add(annotationUID);
              addAnnotation({ annotationUID, highlighted: false, invalidated: false, isLocked: false, isVisible: true, metadata: { toolName, referencedImageId: imageId, FrameOfReferenceUID: saved.annotation_data.frame_of_reference_uid }, data: { handles: { points }, cachedStats: saved.annotation_data.cached_stats ?? {}, label: saved.annotation_data.text } }, annotationElement);
            });
        }
        viewport.render();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "원본 DICOM을 표시하지 못했습니다.");
      }
    })();
    return () => { cancelled = true; cleanupTools?.(); engine?.destroy(); };
  }, [activeTool, annotations, apiBaseUrl, asset, authorizedFetch, caseId, index, reactId, uids]);

  const resetSlice = () => setIndex(Math.floor(uids.length / 2));
  const openFullscreen = async () => { if (viewerFrameRef.current?.requestFullscreen) await viewerFrameRef.current.requestFullscreen(); };

  return (
    <section ref={viewerFrameRef} className="relative grid h-full min-h-0 min-w-0 grid-rows-[48px_38px_minmax(0,1fr)_40px] overflow-hidden rounded-md border border-slate-800 bg-[#050914] shadow-inner">
      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-800 bg-[#0b1220] px-3">
        <div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-wide text-cyan-300">DICOM evidence</p><div className="flex items-center gap-2"><h2 className="truncate text-xs font-semibold text-slate-100">{isTnm ? "PET-CT / TNM 검토 영상" : "흉부 CT 원본 영상"}</h2>{annotationLoading && <span className="text-[8px] font-semibold text-slate-400">주석 로딩</span>}{annotationLoadError && <button type="button" onClick={retryAnnotationLoad} className="text-[8px] font-semibold text-amber-300 underline" title={annotationLoadError}>주석 조회 재시도</button>}{annotationMutationError && <span role="alert" className="text-[8px] font-semibold text-rose-300" title={annotationMutationError}>주석 처리 실패</span>}</div></div>
        <div className="flex shrink-0 items-center gap-1 text-[9px]">
          <ToolButton active label="1×1" title="현재 단일 Stack Viewport" />
          <ToolButton disabled label="2×2" title="현재 MPR·다중 Viewport는 지원하지 않습니다." />
          <ToolButton active={activeTool === "WL"} onClick={() => setActiveTool("WL")} label="WL/WW" title="Window/Level" />
          <ToolButton active={activeTool === "ZOOM"} onClick={() => setActiveTool("ZOOM")} label="Zoom" title="Zoom" />
          <ToolButton active={activeTool === "PAN"} onClick={() => setActiveTool("PAN")} label="Pan" title="Pan" />
          <ToolButton active={activeTool === "LENGTH"} onClick={() => setActiveTool("LENGTH")} label="측정" title="Length measurement" />
          <ToolButton active={activeTool === "ROI"} onClick={() => setActiveTool("ROI")} label="ROI" title="Rectangle ROI" />
          <ToolButton active={activeTool === "TEXT"} onClick={() => setActiveTool("TEXT")} label="Text" title="Text annotation" />
          {activeTool === "TEXT" && <input aria-label="텍스트 주석 내용" value={annotationText} onChange={(event) => setAnnotationText(event.target.value)} placeholder="내용 입력 후 위치 선택" className="h-6 w-32 rounded border border-slate-700 bg-slate-950 px-1.5 text-[9px] text-white placeholder:text-slate-500" />}
          <ToolButton disabled={dirtyAnnotationIds.size === 0} onClick={() => void persistAnnotations()} label="주석 저장" title="작성하거나 수정한 의료진 주석 저장" />
          <ToolButton disabled={!selectedAnnotationVisible} onClick={() => void deleteSelectedAnnotation()} label="선택 삭제" title="현재 슬라이스에서 선택한 의료진 주석 삭제" />
          <ToolButton disabled={annotations.length === 0} onClick={() => void deleteAllAnnotations()} label="전체 삭제" title="현재 영상의 의료진 주석 전체 삭제" />
          <ToolButton label="Reset" disabled={!uids.length} onClick={resetSlice} title="중앙 슬라이스로 이동" />
          <ToolButton label="전체화면" disabled={!asset} onClick={() => void openFullscreen()} title="전체화면" />
        </div>
      </header>

      <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-slate-800 bg-[#101827] px-2 py-1.5" aria-label="DICOM series">
        {assets.map((item) => <button key={item.id} type="button" onClick={() => setSelectedAssetId(item.id)} className={`shrink-0 rounded px-2 py-1 text-[9px] font-semibold transition ${item.id === selectedAssetId ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{item.image_type === "PET" ? "PET" : "CT"} Series</button>)}
        {isTnm && <span className="ml-1 shrink-0 rounded border border-slate-700 px-2 py-1 text-[8px] text-slate-500" title="현재 CT-PET Fusion Viewport는 지원하지 않습니다.">Fusion 미지원</span>}
      </div>

      {annotations.length > 0 && (
        <div className="absolute inset-x-0 top-[86px] z-30 flex min-w-0 items-center gap-1 overflow-x-auto border-b border-slate-800 bg-slate-950/95 px-2 py-1" aria-label="의료진 주석 목록">
          <span className="shrink-0 px-1 text-[8px] text-slate-500">의료진 주석</span>
          {annotations.filter((annotation) => annotation.annotation_data.sop_instance_uid === uids[index]).map((annotation, index) => (
            <button key={annotation.id} type="button" aria-pressed={selectedAnnotationId === annotation.id} onClick={() => selectAnnotation(annotation)} className={`shrink-0 rounded px-1.5 py-1 text-[8px] font-semibold ${selectedAnnotationId === annotation.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-300"}`}>
              {annotation.annotation_type === "LENGTH" ? "길이" : annotation.annotation_type === "BOUNDING_BOX" ? "ROI" : "Text"} {index + 1}
            </button>
          ))}
          {selectedAnnotationId && annotations.find((annotation) => annotation.id === selectedAnnotationId)?.annotation_type === "TEXT" && (
            <>
              <input aria-label="선택한 텍스트 주석 내용" value={annotationText} onChange={(event) => {
                const value = event.target.value;
                setAnnotationText(value);
                const selected = annotations.find((annotation) => annotation.id === selectedAnnotationId);
                if (selected && value.trim()) void updateAnnotation(selected.id, { annotation_type: selected.annotation_type, annotation_data: { ...selected.annotation_data, text: value } });
              }} className="h-6 w-28 rounded border border-slate-700 bg-slate-900 px-1.5 text-[8px] text-white" />
            </>
          )}
        </div>
      )}

      <div className="relative min-h-0 overflow-hidden bg-black">
        <div ref={elementRef} tabIndex={0} onContextMenu={preventMedicalImageContextMenu} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); } if (event.key === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.min(uids.length - 1, value + 1)); } }} className="absolute inset-0 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400" aria-label="DICOM 원본 영상 뷰어. 좌우 화살표로 슬라이스 이동" />
        {asset && <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1"><HudChip>{asset.image_type || "DICOM"} Series</HudChip><HudChip>Axial stack</HudChip><HudChip>Slice {uids.length ? `${index + 1} / ${uids.length}` : "-"}</HudChip></div>}
        {loading && <p role="status" className="grid h-full place-items-center text-xs text-slate-300">DICOM Series를 불러오는 중입니다.</p>}
        {!loading && error && <p role="alert" className="grid h-full place-items-center px-8 text-center text-xs text-rose-200">{error}</p>}
        {!loading && !error && <p className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/55 px-2 py-1 text-[8px] text-slate-400">← / → 슬라이스 이동</p>}
      </div>

      <footer className="flex min-w-0 items-center gap-2 border-t border-slate-800 bg-[#0b1220] px-3">
        <button type="button" disabled={!uids.length || index === 0} onClick={() => setIndex((value) => value - 1)} className="rounded border border-slate-700 px-2 py-1 text-[9px] font-medium text-slate-200 disabled:opacity-35">이전</button>
        <input aria-label="DICOM 슬라이스" type="range" min={0} max={Math.max(0, uids.length - 1)} value={Math.min(index, Math.max(0, uids.length - 1))} disabled={!uids.length} onChange={(event) => setIndex(Number(event.target.value))} className="min-w-0 flex-1 accent-blue-500" />
        <span className="w-14 text-right text-[9px] tabular-nums text-slate-400">{uids.length ? `${index + 1}/${uids.length}` : "-"}</span>
        <button type="button" disabled={!uids.length || index >= uids.length - 1} onClick={() => setIndex((value) => value + 1)} className="rounded border border-slate-700 px-2 py-1 text-[9px] font-medium text-slate-200 disabled:opacity-35">다음</button>
      </footer>
    </section>
  );
}

function ToolButton({ label, title, onClick, disabled = false, active = false }: { label: string; title: string; onClick?: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" title={title} aria-label={label} disabled={disabled} onClick={onClick} className={`rounded border px-1.5 py-1 font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? "border-blue-400/70 bg-blue-500/20 text-blue-200" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{label}</button>;
}

function HudChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-white/10 bg-black/55 px-1.5 py-0.5 text-[8px] font-medium text-slate-200 backdrop-blur-sm">{children}</span>;
}
