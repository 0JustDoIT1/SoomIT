"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ensureCornerstoneInitialized } from "../../../radiology/_lib/cornerstone-init";
import { preventMedicalImageContextMenu } from "@/components/medical-imaging/medical-image-context-menu";
import { useAnnotationMutation } from "@/components/medical-imaging/use-annotation-mutation";
import { deleteImageAnnotations } from "@/components/medical-imaging/delete-image-annotations";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
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
  const sliceIndexRef = useRef(0);
  const changeSliceRef = useRef<((index: number) => void) | null>(null);
  const [sliceLoading, setSliceLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationLoading, setAnnotationLoading] = useState(false);
  const [annotationLoadError, setAnnotationLoadError] = useState("");
  const [annotationMutationError, setAnnotationMutationError] = useState("");
  const [annotationReloadNonce, setAnnotationReloadNonce] = useState(0);
  const { isLocked: isMutationLocked, busy: mutationBusy, begin: beginMutation, end: endMutation } = useAnnotationMutation();
  const [confirmDeleteAll, setConfirmDeleteAll] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolMode>("WL");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [dirtyAnnotationIds, setDirtyAnnotationIds] = useState<Set<string>>(() => new Set());
  const annotationSaveRef = useRef<(annotation: Omit<Annotation, "id">) => void>(() => undefined);
  const annotationUpdateRef = useRef<(annotationId: string, annotation: Omit<Annotation, "id">) => void>(() => undefined);
  const annotationTextRef = useRef("");
  const annotationsRef = useRef(annotations);
  const activeToolRef = useRef(activeTool);
  const syncViewerRef = useRef<(() => void) | null>(null);
  const setViewerToolRef = useRef<(() => void) | null>(null);
  useEffect(() => { annotationsRef.current = annotations; syncViewerRef.current?.(); }, [annotations]);
  useEffect(() => { activeToolRef.current = activeTool; setViewerToolRef.current?.(); }, [activeTool]);
  const nextTemporaryAnnotationIdRef = useRef(0);
  const assetCaseIdRef = useRef("");
  const annotationRequestRef = useRef("");
  const asset = assets.find((item) => item.id === selectedAssetId) ?? null;
  const isTnm = stage === "PET_CT_TNM";
  const selectedAnnotationVisible = Boolean(selectedAnnotationId && annotations.some(
    (annotation) => annotation.id === selectedAnnotationId && annotation.annotation_data.sop_instance_uid === uids[index],
  ));
  const selectSeries = (id: string) => {
    if (id === selectedAssetId || isMutationLocked()) return;
    if (dirtyAnnotationIds.size > 0 && !window.confirm("저장하지 않은 주석이 있습니다. 변경 사항을 버리고 다른 Series로 이동할까요?")) return;
    setSelectedAssetId(id);
  };
  useEffect(() => {
    sliceIndexRef.current = index;
    changeSliceRef.current?.(index);
  }, [index]);

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
    if (!asset || isMutationLocked()) return;
    const id = `temp-${Date.now()}-${++nextTemporaryAnnotationIdRef.current}`;
    setDirtyAnnotationIds((current) => new Set(current).add(id));
    setAnnotations((current) => [...current, { id, ...annotation }]);
    setSelectedAnnotationId(id);
  }, [asset, isMutationLocked]);

  const deleteSelectedAnnotation = useCallback(async () => {

    if (!beginMutation()) return false;
    const requestIdentity = annotationRequestRef.current;
    try {
      const selected = annotations.find((annotation) => annotation.id === selectedAnnotationId);
      if (!selected) return;
      if (selected.id.startsWith("temp-")) {
        if (annotationRequestRef.current !== requestIdentity) return false;
        setAnnotations((current) => current.filter((annotation) => annotation.id !== selected.id));
        setDirtyAnnotationIds((current) => { const next = new Set(current); next.delete(selected.id); return next; });
        setSelectedAnnotationId(null);
        return;
      }
      try {
        setAnnotationMutationError("");
        const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-annotations/${selected.id}/`, { method: "DELETE" });
        const body: unknown = response.ok ? null : await response.json().catch(() => null);
        if (!response.ok && response.status !== 404) throw new Error(message(body, "선택한 주석을 삭제하지 못했습니다."));
        if (annotationRequestRef.current !== requestIdentity) return false;
        setAnnotations((current) => current.filter((annotation) => annotation.id !== selected.id));
        setDirtyAnnotationIds((current) => { const next = new Set(current); next.delete(selected.id); return next; });
        setSelectedAnnotationId(null);
        if (asset?.series_instance_uid) {
          invalidateImageAnnotationRequest({ caseId, imageAssetId: asset.id, seriesInstanceUid: asset.series_instance_uid });
        }
      } catch (error) {
        const failure = error instanceof Error ? error.message : "선택한 주석을 삭제하지 못했습니다.";
        setAnnotationMutationError(failure);
        showToast.error(failure);
      }
    } finally {
      endMutation();
    }
  }, [annotations, apiBaseUrl, asset, authorizedFetch, caseId, selectedAnnotationId, beginMutation, endMutation]);

  const deleteAllAnnotations = useCallback(() => {
    if (!asset?.series_instance_uid || annotations.length === 0) return;
    setConfirmDeleteAll(`${caseId}:${asset.id}`);
  }, [annotations.length, asset, caseId]);

  const executeDeleteAllAnnotations = useCallback(async () => {

    if (!beginMutation()) return false;
    const requestIdentity = annotationRequestRef.current;
    try {
      if (!asset?.series_instance_uid || annotations.length === 0) return;
      setConfirmDeleteAll(null);
      const query = new URLSearchParams({ image_asset_id: asset.id, series_instance_uid: asset.series_instance_uid });
      try {
        setAnnotationMutationError("");
        const result = await deleteImageAnnotations(authorizedFetch, `${apiBaseUrl}/api/doctor/cases/${caseId}/image-annotations/?${query.toString()}`, annotations);
        if (annotationRequestRef.current !== requestIdentity) return false;
        setAnnotations((current) => current.filter((item) => !result.deleted.has(item.id)));
        setDirtyAnnotationIds((current) => new Set([...current].filter((id) => !result.deleted.has(id))));
        setSelectedAnnotationId((id) => id && !result.deleted.has(id) ? id : null);
        invalidateImageAnnotationRequest({ caseId, imageAssetId: asset.id, seriesInstanceUid: asset.series_instance_uid });
        if (result.failed) throw new Error("일부 주석을 삭제하지 못했습니다. 남은 주석을 다시 삭제해 주세요.");
      } catch (error) {
        const failure = error instanceof Error ? error.message : "주석 전체를 삭제하지 못했습니다.";
        setAnnotationMutationError(failure);
        showToast.error(failure);
      }
    } finally {
      endMutation();
    }
  }, [annotations, apiBaseUrl, asset, authorizedFetch, caseId, beginMutation, endMutation]);

  const updateAnnotation = useCallback(async (annotationId: string, annotation: Omit<Annotation, "id">) => {
    if (isMutationLocked()) return;
    setDirtyAnnotationIds((current) => new Set(current).add(annotationId));
    setAnnotations((current) => current.map((item) => item.id === annotationId ? { id: annotationId, ...annotation } : item));
  }, [isMutationLocked]);

  const persistAnnotations = useCallback(async () => {

    if (!beginMutation()) return false;
    const requestIdentity = annotationRequestRef.current;
    try {
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
      if (annotationRequestRef.current !== requestIdentity) return false;
      const saved = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
      if (saved.length) {
        const savedById = new Map(saved);
        setSelectedAnnotationId((current) => current ? savedById.get(current)?.id ?? current : null);
        if (annotationRequestRef.current !== requestIdentity) return false;
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
    } finally {
      endMutation();
    }
  }, [annotations, apiBaseUrl, asset, authorizedFetch, caseId, dirtyAnnotationIds, beginMutation, endMutation]);

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
    const sameSeries = annotationRequestRef.current === requestKey;
    annotationRequestRef.current = requestKey;
    let active = true;
    if (!sameSeries) {
      setAnnotations([]);
      setDirtyAnnotationIds(new Set());
      setSelectedAnnotationId(null);
    }
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
        // A delayed initial GET must not discard drafts or completed saves.
        setAnnotations((current) => Array.from(new Map(
          [...nextAnnotations, ...current].map((annotation) => [annotation.id, annotation]),
        ).values()));
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
    if (!asset || !uids.length || !elementRef.current) return;
    let cancelled = false;
    const controller = new AbortController();
    let engine: import("@cornerstonejs/core").RenderingEngine | null = null;
    let cleanupTools: (() => void) | null = null;
    const releaseFiles: Array<() => void> = [];
    let resizeObserver: ResizeObserver | null = null;
    void (async () => {
      try {
        const { core, tools, dicomImageLoader } = await ensureCornerstoneInitialized();
        if (cancelled || !elementRef.current) return;
        let imageId = "";
        let displayedUid = "";
        let switching = false;
        const images = new Map<string, string>();
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
        setViewerToolRef.current = () => {
        const activeName = activeToolRef.current === "WL" ? tools.WindowLevelTool.toolName : activeToolRef.current === "ZOOM" ? tools.ZoomTool.toolName : activeToolRef.current === "PAN" ? tools.PanTool.toolName : activeToolRef.current === "LENGTH" ? tools.LengthTool.toolName : activeToolRef.current === "ROI" ? tools.RectangleROITool.toolName : tools.ArrowAnnotateTool.toolName;
        [tools.WindowLevelTool.toolName, tools.PanTool.toolName, tools.ZoomTool.toolName, tools.LengthTool.toolName, tools.RectangleROITool.toolName, tools.ArrowAnnotateTool.toolName].forEach((name) => toolGroup?.setToolPassive(name, { removeAllBindings: true }));
        toolGroup?.setToolActive(activeName, { bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }] });
        };
        setViewerToolRef.current();
        const runtimeTools = { eventTarget: core.eventTarget, Enums: tools.Enums };
        const eventName = runtimeTools.Enums?.Events?.ANNOTATION_COMPLETED;
        const modifiedEventName = runtimeTools.Enums?.Events?.ANNOTATION_MODIFIED;
        const selectionEventName = runtimeTools.Enums?.Events?.ANNOTATION_SELECTION_CHANGE;
        const syncAnnotation = (event: Event, completed: boolean) => {
          // Rendering recalculates statistics; it is not a user edit.
          if ((event as CustomEvent<{ changeType?: string }>).detail?.changeType === "StatsUpdated") return;
          const annotation = (event as CustomEvent<{ annotation?: Record<string, unknown> }>).detail?.annotation;
          const metadata = annotation?.metadata as Record<string, unknown> | undefined;
          const data = annotation?.data as Record<string, unknown> | undefined;
          if (switching || metadata?.referencedImageId !== imageId) return;
          const toolName = metadata?.toolName;
          const annotation_type: Annotation["annotation_type"] | null = toolName === tools.LengthTool.toolName ? "LENGTH" : toolName === tools.RectangleROITool.toolName ? "BOUNDING_BOX" : toolName === tools.ArrowAnnotateTool.toolName ? "TEXT" : null;
          const points = (data?.handles as { points?: unknown } | undefined)?.points;
          if (!annotation_type || !Array.isArray(points) || !asset.series_instance_uid || !displayedUid) return;
          if (typeof annotation?.annotationUID === "string") ownedAnnotationUids.add(annotation.annotationUID);
          const annotationId = typeof annotation?.annotationUID === "string" && annotation.annotationUID.startsWith("clinician-") ? annotation.annotationUID.slice("clinician-".length) : null;
          const text = annotation_type === "TEXT" ? String(data?.text ?? data?.label ?? annotationTextRef.current).trim() : undefined;
          if (annotation_type === "TEXT" && !text) return;
          const payload = { annotation_type, annotation_data: { series_instance_uid: asset.series_instance_uid, sop_instance_uid: displayedUid, tool_name: String(toolName), viewport: "axial", frame_of_reference_uid: metadata?.FrameOfReferenceUID, world_points: points, cached_stats: data?.cachedStats, text } };
          if (annotationId) annotationUpdateRef.current(annotationId, payload);
          else if (completed) {
            annotationSaveRef.current(payload);
            if (typeof annotation?.annotationUID === "string") {
              ownedAnnotationUids.delete(annotation.annotationUID);
              tools.annotation.state.removeAnnotation(annotation.annotationUID);
            }
          }
        };
        if (runtimeTools.eventTarget && eventName) {
          const onCompleted = (event: Event) => syncAnnotation(event, true);
          const onModified = (event: Event) => syncAnnotation(event, false);
          const onSelection = (event: Event) => {
            const detail = (event as CustomEvent<{ selection?: string[]; removed?: string[] }>).detail;
            const selectedUid = detail?.selection?.find((uid) => ownedAnnotationUids.has(uid) && uid.startsWith("clinician-"));
            if (selectedUid) {
              const id = selectedUid.slice("clinician-".length);
              setSelectedAnnotationId(id);
              const selected = annotationsRef.current.find((item) => item.id === id);
              setAnnotationText(typeof selected?.annotation_data.text === "string" ? selected.annotation_data.text : "");
            } else if (detail?.removed?.some((uid) => ownedAnnotationUids.has(uid))) {
              setSelectedAnnotationId(null);
            }
          };
          runtimeTools.eventTarget.addEventListener(eventName, onCompleted);
          if (modifiedEventName) runtimeTools.eventTarget.addEventListener(modifiedEventName, onModified);
          if (selectionEventName) runtimeTools.eventTarget.addEventListener(selectionEventName, onSelection);
          cleanupTools = () => {
            runtimeTools.eventTarget?.removeEventListener(eventName, onCompleted);
            if (modifiedEventName) runtimeTools.eventTarget?.removeEventListener(modifiedEventName, onModified);
            if (selectionEventName) runtimeTools.eventTarget?.removeEventListener(selectionEventName, onSelection);
            ownedAnnotationUids.forEach((uid) => tools.annotation.state.removeAnnotation(uid));
            tools.ToolGroupManager.destroyToolGroup(toolGroupId);
          };
        }
        const viewport = engine.getViewport(viewportId) as InstanceType<typeof core.StackViewport>;
        if (typeof ResizeObserver !== "undefined" && elementRef.current) {
          resizeObserver = new ResizeObserver(() => {
            if (!cancelled) engine?.resize(true, true);
          });
          resizeObserver.observe(elementRef.current);
        }
        const annotationState = (tools as unknown as { annotation?: { state?: { addAnnotation?: (annotation: Record<string, unknown>, element: HTMLDivElement) => void } } }).annotation?.state;
        const addAnnotation = annotationState?.addAnnotation;
        const annotationElement = elementRef.current;
        syncViewerRef.current = () => {
        if (switching || !displayedUid) return;
        const visibleAnnotations = annotationsRef.current.filter((saved) => saved.annotation_data.sop_instance_uid === displayedUid);
        const visibleUids = new Set(visibleAnnotations.map((saved) => `clinician-${saved.id}`));
        ownedAnnotationUids.forEach((uid) => {
          if (!visibleUids.has(uid)) {
            ownedAnnotationUids.delete(uid);
            tools.annotation.state.removeAnnotation(uid);
          }
        });
        if (addAnnotation && annotationElement) {
          visibleAnnotations
            .forEach((saved) => {
              const points = saved.annotation_data.world_points;
              if (!Array.isArray(points)) return;
              const toolName = saved.annotation_type === "LENGTH" ? tools.LengthTool.toolName : saved.annotation_type === "BOUNDING_BOX" ? tools.RectangleROITool.toolName : tools.ArrowAnnotateTool.toolName;
              const annotationUID = `clinician-${saved.id}`;
              const existing = tools.annotation.state.getAnnotation?.(annotationUID);
              if (existing) {
                existing.data.text = saved.annotation_data.text as string;
                existing.data.label = saved.annotation_data.text as string;
                return;
              }
              ownedAnnotationUids.add(annotationUID);
              // Use Cornerstone's defaults (textBox, activeHandleIndex, etc.) so
              // restored annotations remain renderable and editable.
              const restored = tools.LengthTool.createAnnotation({
                annotationUID, highlighted: false, invalidated: true,
                metadata: { ...viewport.getViewReference?.(), toolName, referencedImageId: imageId },
                data: { handles: { points }, text: saved.annotation_data.text, label: saved.annotation_data.text },
              });
              addAnnotation(restored as unknown as Record<string, unknown>, annotationElement);
            });
        }
        viewport.render();
        };
        // Serialize stack changes and skip superseded requests. Keep the engine,
        // user display settings, and previously downloaded slices for this series.
        let requestedIndex = sliceIndexRef.current;
        const showSlice = async () => {
          if (switching || cancelled) return;
          switching = true;
          setSliceLoading(true);
          const pan = displayedUid ? viewport.getPan?.() : undefined;
          const zoom = displayedUid ? viewport.getZoom?.() : undefined;
          const properties = displayedUid ? viewport.getProperties?.() : undefined;
          let attemptedIndex = requestedIndex;
          try {
            while (!cancelled) {
              const targetIndex = requestedIndex;
              attemptedIndex = targetIndex;
              const uid = uids[targetIndex];
              if (!uid) break;
              let nextImageId = images.get(uid);
              if (!nextImageId) {
                const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/${asset.id}/dicom-web/instances/${uid}/`, { signal: controller.signal, headers: { Accept: "application/dicom" } });
                if (!response.ok) throw new Error("원본 DICOM을 불러오지 못했습니다.");
                const blob = await response.blob();
                if (cancelled) return;
                nextImageId = dicomImageLoader.wadouri.fileManager.add(new File([blob], `${uid}.dcm`, { type: "application/dicom" }));
                images.set(uid, nextImageId);
                const fileIndex = Number(nextImageId.split(":")[1]);
                releaseFiles.push(() => { if (Number.isInteger(fileIndex)) dicomImageLoader.wadouri.fileManager.remove(fileIndex); });
              }
              if (targetIndex !== requestedIndex) continue;
              await viewport.setStack([nextImageId]);
              if (cancelled) return;
              imageId = nextImageId;
              displayedUid = uid;
              if (properties) viewport.setProperties(properties);
              if (zoom !== undefined) viewport.setZoom(zoom);
              if (pan) viewport.setPan(pan);
              if (targetIndex === requestedIndex) break;
            }
            if (!cancelled) setError("");
          } catch (cause) {
            if (!cancelled && attemptedIndex === requestedIndex) setError(cause instanceof Error ? cause.message : "원본 DICOM을 표시하지 못했습니다.");
          } finally {
            switching = false;
            if (!cancelled && attemptedIndex !== requestedIndex) {
              void showSlice();
            } else if (!cancelled) {
              setSliceLoading(false);
              syncViewerRef.current?.();
            }
          }
        };
        changeSliceRef.current = (nextIndex) => { requestedIndex = nextIndex; void showSlice(); };
        void showSlice();
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "원본 DICOM을 표시하지 못했습니다.");
      }
    })();
    return () => { cancelled = true; controller.abort(); resizeObserver?.disconnect(); changeSliceRef.current = null; syncViewerRef.current = null; setViewerToolRef.current = null; cleanupTools?.(); engine?.destroy(); releaseFiles.forEach((release) => release()); };
  }, [apiBaseUrl, asset, authorizedFetch, caseId, reactId, uids]);

  const resetSlice = () => setIndex(Math.floor(uids.length / 2));
  const openFullscreen = async () => { if (viewerFrameRef.current?.requestFullscreen) await viewerFrameRef.current.requestFullscreen(); };

  return (
    <>
    <section inert={mutationBusy} aria-busy={mutationBusy} ref={viewerFrameRef} className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-slate-800 bg-[#050914] shadow-inner">
      <header className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-800 bg-[#0b1220] px-3 py-2">
        <div className="min-w-0 shrink-0 max-w-full"><p className="whitespace-nowrap text-[11px] font-semibold tracking-wide text-cyan-300">원본 DICOM 영상</p><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h2 className="text-sm font-semibold text-slate-100">{isTnm ? "PET-CT / TNM 검토 영상" : "흉부 CT 원본 영상"}</h2>{annotationLoading && <span className="text-xs font-semibold text-slate-400">주석 로딩</span>}{annotationLoadError && <button type="button" onClick={retryAnnotationLoad} className="text-xs font-semibold text-amber-300 underline" title={annotationLoadError}>주석 조회 재시도</button>}{annotationMutationError && <span role="alert" className="text-xs font-semibold text-rose-300" title={annotationMutationError}>주석 처리 실패</span>}</div></div>
        <div aria-label="DICOM 도구 모음" className="flex min-w-0 max-w-full flex-wrap items-center gap-1 text-xs">
          <ToolButton active label="1×1" title="현재 단일 Stack Viewport" />
          <ToolButton active={activeTool === "WL"} onClick={() => setActiveTool("WL")} label="WL/WW" title="Window/Level" />
          <ToolButton active={activeTool === "ZOOM"} onClick={() => setActiveTool("ZOOM")} label="Zoom" title="Zoom" />
          <ToolButton active={activeTool === "PAN"} onClick={() => setActiveTool("PAN")} label="Pan" title="Pan" />
          <ToolButton active={activeTool === "LENGTH"} onClick={() => setActiveTool("LENGTH")} label="측정" title="Length measurement" />
          <ToolButton active={activeTool === "ROI"} onClick={() => setActiveTool("ROI")} label="ROI" title="Rectangle ROI" />
          <ToolButton active={activeTool === "TEXT"} onClick={() => setActiveTool("TEXT")} label="Text" title="Text annotation" />
          {activeTool === "TEXT" && <input aria-label="텍스트 주석 내용" value={annotationText} onChange={(event) => setAnnotationText(event.target.value)} placeholder="내용 입력 후 위치 선택" className="h-6 w-32 rounded border border-slate-700 bg-slate-950 px-1.5 text-[9px] text-white placeholder:text-slate-500" />}
          <ToolButton disabled={mutationBusy} onClick={() => { if (dirtyAnnotationIds.size === 0) { showToast.info("저장할 변경 사항이 없습니다. 측정·ROI·Text 도구로 주석을 먼저 작성해 주세요."); return; } void persistAnnotations(); }} label="주석 저장" title="작성하거나 수정한 의료진 주석 저장" />
          <ToolButton disabled={mutationBusy} onClick={() => { if (!selectedAnnotationVisible) { showToast.info("현재 슬라이스의 주석을 영상 또는 주석 목록에서 먼저 선택해 주세요."); return; } void deleteSelectedAnnotation(); }} label="선택 삭제" title="현재 슬라이스에서 선택한 의료진 주석 삭제" />
          <ToolButton disabled={mutationBusy} onClick={() => { if (annotations.length === 0) { showToast.info("삭제할 주석이 없습니다."); return; } void deleteAllAnnotations(); }} label="전체 삭제" title="현재 영상의 의료진 주석 전체 삭제" />
          <ToolButton label="Reset" disabled={!uids.length} onClick={resetSlice} title="중앙 슬라이스로 이동" />
          <ToolButton label="전체화면" disabled={!asset} onClick={() => void openFullscreen()} title="전체화면" />
        </div>
      </header>

      <div className="flex h-[42px] min-h-0 min-w-0 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-800 bg-[#101827] px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="DICOM series">
        {assets.map((item) => <button key={item.id} type="button" disabled={mutationBusy} onClick={() => selectSeries(item.id)} className={`min-h-8 shrink-0 rounded px-3 py-1 text-xs font-semibold transition ${item.id === selectedAssetId ? "bg-blue-500 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{item.image_type === "PET" ? "PET" : "CT"} Series</button>)}
      {annotations.length > 0 && (
        <div className="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden border-l border-slate-700 px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="의료진 주석 목록">
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
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {(sliceLoading || error) && <div className="absolute inset-0 z-10 grid place-items-center bg-black/80 text-xs text-slate-300" role="status">{sliceLoading ? "슬라이스를 불러오는 중입니다." : error}</div>}
        <div ref={elementRef} tabIndex={0} onContextMenu={preventMedicalImageContextMenu} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); } if (event.key === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.min(uids.length - 1, value + 1)); } }} className="absolute inset-0 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-400" aria-label="DICOM 원본 영상 뷰어. 좌우 화살표로 슬라이스 이동" />
        {asset && <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1"><HudChip>{asset.image_type || "DICOM"} Series</HudChip><HudChip>Axial stack</HudChip><HudChip>Slice {uids.length ? `${index + 1} / ${uids.length}` : "-"}</HudChip></div>}
        {loading && <p role="status" className="grid h-full place-items-center text-xs text-slate-300">DICOM Series를 불러오는 중입니다.</p>}
        {!loading && error && <p role="alert" className="grid h-full place-items-center px-8 text-center text-xs text-rose-200">{error}</p>}
        {!loading && !error && <p className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/55 px-2 py-1 text-[10px] text-slate-400">{annotations.length === 0 ? "측정·ROI·Text로 주석을 그리면 저장·삭제할 수 있습니다" : dirtyAnnotationIds.size > 0 ? "저장하지 않은 주석이 있습니다" : "주석을 선택하면 삭제할 수 있습니다"} · ← / → 슬라이스 이동</p>}
      </div>

      <footer className="flex h-11 min-w-0 shrink-0 items-center gap-2 border-t border-slate-800 bg-[#0b1220] px-3">
        <button type="button" disabled={!uids.length || index === 0} onClick={() => setIndex((value) => value - 1)} className="rounded border border-slate-700 px-2 py-1 text-[9px] font-medium text-slate-200 disabled:opacity-35">이전</button>
        <input aria-label="DICOM 슬라이스" type="range" min={0} max={Math.max(0, uids.length - 1)} value={Math.min(index, Math.max(0, uids.length - 1))} disabled={!uids.length} onChange={(event) => setIndex(Number(event.target.value))} className="min-w-0 flex-1 accent-blue-500" />
        <span className="w-14 text-right text-[9px] tabular-nums text-slate-400">{uids.length ? `${index + 1}/${uids.length}` : "-"}</span>
        <button type="button" disabled={!uids.length || index >= uids.length - 1} onClick={() => setIndex((value) => value + 1)} className="rounded border border-slate-700 px-2 py-1 text-[9px] font-medium text-slate-200 disabled:opacity-35">다음</button>
      </footer>
    </section>
    {mutationBusy && <span role="status" className="fixed bottom-4 left-4 z-[100] rounded bg-slate-900 px-4 py-2 text-sm text-white">주석 처리 중…</span>}
    {confirmDeleteAll === `${caseId}:${asset?.id}` && <ConfirmActionDialog title="영상 주석 전체 삭제" description={`현재 영상의 의료진 주석 ${annotations.length}개를 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.`} confirmLabel="전체 삭제" onCancel={() => setConfirmDeleteAll(null)} onConfirm={() => void executeDeleteAllAnnotations()} />}
    </>
  );
}

function ToolButton({ label, title, onClick, disabled = false, active = false }: { label: string; title: string; onClick?: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" title={title} aria-label={label} disabled={disabled} onClick={onClick} className={`min-h-8 rounded border px-2 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? "border-blue-400/70 bg-blue-500/20 text-blue-200" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{label}</button>;
}

function HudChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-white/10 bg-black/55 px-2 py-1 text-xs font-medium text-slate-200 backdrop-blur-sm">{children}</span>;
}
