"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CtDicomViewer, type ClinicianImageAnnotation, type PendingImageAnnotation } from "@/components/medical-imaging/ct-dicom-viewer";
import { showToast } from "@/components/ui/toast/toast";
import type { CtCornerstoneSegmentation } from "@/app/radiology/_lib/cornerstone-labelmap";
import { ensureCornerstoneInitialized } from "@/app/radiology/_lib/cornerstone-init";

import { CaseCtVisualization } from "./case-ct-visualization";
import {
  ImageAnnotationLoadError,
  imageAnnotationRequestKey,
  invalidateImageAnnotationRequest,
  loadImageAnnotations,
  shouldNotifyImageAnnotationLoadFailure,
} from "./image-annotation-request";

type AuthorizedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type Asset = {
  id: string;
  workflow_stage: string;
  image_type: string;
  status: string;
  series_instance_uid?: string | null;
};

type DicomRow = Record<string, { Value?: unknown[] }>;

type SeriesData = { imageIds: string[]; sopInstanceUids: string[] };

const assetRequestCache = new Map<string, Promise<Asset>>();
const seriesRequestCache = new Map<string, Promise<SeriesData>>();
const segmentationRequestCache = new Map<string, Promise<CtCornerstoneSegmentation>>();
const MAX_CT_CACHE_ENTRIES = 8;

function cachedRequest<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>) {
  const existing = cache.get(key);
  if (existing) return existing;
  const request = load().catch((reason) => {
    cache.delete(key);
    throw reason;
  });
  cache.set(key, request);
  while (cache.size > MAX_CT_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== "string") break;
    cache.delete(oldest);
  }
  return request;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export type CtEvidenceInfo = {
  seriesInstanceUid?: string | null;
  imageCount?: number;
  segmentationAvailable?: boolean;
};

function sopUid(row: DicomRow) {
  const value = row["00080018"]?.Value?.[0];
  return typeof value === "string" ? value : null;
}

function detail(body: unknown, fallback: string) {
  return body &&
    typeof body === "object" &&
    "detail" in body &&
    typeof body.detail === "string"
    ? body.detail
    : fallback;
}

export function CaseCtSegmentationEvidence({
  apiBaseUrl,
  authorizedFetch,
  caseId,
  analysisId,
  nodules = [],
  onEvidenceInfoChange,
}: {
  apiBaseUrl: string;
  authorizedFetch: AuthorizedFetch;
  caseId: string;
  analysisId?: string;
  nodules?: unknown[];
  onEvidenceInfoChange?: (info: CtEvidenceInfo) => void;
}) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"DICOM" | "SEGMENTATION">("DICOM");
  const [segmentationViewVisited, setSegmentationViewVisited] = useState(false);
  const [imageCount, setImageCount] = useState<number | null>(null);
  const [segmentationAvailable, setSegmentationAvailable] = useState(false);
  const [annotations, setAnnotations] = useState<ClinicianImageAnnotation[]>([]);
  const [annotationLoading, setAnnotationLoading] = useState(false);
  const [annotationLoadError, setAnnotationLoadError] = useState("");
  const mountedRef = useRef(true);
  const assetCaseIdRef = useRef("");
  const annotationRequestRef = useRef("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      setLoading(true);
      setError("");
      setImageCount(null);
      setSegmentationAvailable(false);

      try {
        const selected = await cachedRequest(
          assetRequestCache,
          `${caseId}:${analysisId ?? ""}`,
          async () => {
            const response = await authorizedFetch(
              `${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/`,
            );
            const body: unknown = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(detail(body, "CT 영상 목록을 불러오지 못했습니다."));
            }
            const selectedAsset = (Array.isArray(body) ? body : []).find(
              (item): item is Asset =>
                Boolean(item) &&
                typeof item === "object" &&
                "id" in item &&
                typeof item.id === "string" &&
                item.workflow_stage === "CT" &&
                item.image_type === "CT" &&
                item.status === "READY",
            );
            if (!selectedAsset) throw new Error("조회 가능한 CT DICOM Series가 없습니다.");
            return selectedAsset;
          },
        );

        if (!controller.signal.aborted) {
          assetCaseIdRef.current = caseId;
          setAsset(selected);
          onEvidenceInfoChange?.({
            seriesInstanceUid: selected.series_instance_uid,
          });
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "CT 영상을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [
    apiBaseUrl,
    authorizedFetch,
    caseId,
    analysisId,
    onEvidenceInfoChange,
  ]);

  const loadSeries = useCallback(
    async (_orderId: string, assetId: string) => {
      const cacheKey = `${caseId}:${assetId}:${asset?.series_instance_uid ?? ""}`;
      const series = await cachedRequest(seriesRequestCache, cacheKey, async () => {
        const instancesResponse = await authorizedFetch(
        `${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/${assetId}/dicom-web/instances/`,
        );

      const instanceBody: unknown = await instancesResponse
        .json()
        .catch(() => ({}));

      if (!instancesResponse.ok || !Array.isArray(instanceBody)) {
        throw new Error(
          detail(
            instanceBody,
            "CT DICOM instance 목록을 불러오지 못했습니다.",
          ),
        );
      }

      const uids = instanceBody
        .map((item) => sopUid(item as DicomRow))
        .filter((value): value is string => Boolean(value));

      if (!uids.length) {
        throw new Error("CT DICOM instance가 없습니다.");
      }

      const { dicomImageLoader } =
        await ensureCornerstoneInitialized();

      const imageIds = await mapWithConcurrency(
        uids,
        6,
        async (uid) => {
          const response = await authorizedFetch(
            `${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/${assetId}/dicom-web/instances/${uid}/`,
            {
              headers: {
                Accept: "application/dicom",
              },
            },
          );

          if (!response.ok) {
            throw new Error("CT 원본 DICOM을 불러오지 못했습니다.");
          }

          const blob = await response.blob();

          return dicomImageLoader.wadouri.fileManager.add(
            new File([blob], `${uid}.dcm`, {
              type: "application/dicom",
            }),
          );
        },
      );

      return { imageIds, sopInstanceUids: uids };
      });
      if (mountedRef.current) {
        setImageCount(series.sopInstanceUids.length);
        onEvidenceInfoChange?.({ imageCount: series.sopInstanceUids.length });
      }
      return series;
    },
    [
      apiBaseUrl,
      asset?.series_instance_uid,
      authorizedFetch,
      caseId,
      onEvidenceInfoChange,
    ],
  );

  useEffect(() => {
    const imageAssetId = asset?.id?.trim();
    const seriesInstanceUid = asset?.series_instance_uid?.trim();
    if (assetCaseIdRef.current !== caseId || !imageAssetId || !seriesInstanceUid) {
      annotationRequestRef.current = "";
      setAnnotations([]);
      setAnnotationLoading(false);
      setAnnotationLoadError("");
      return;
    }

    const requestKey = imageAnnotationRequestKey({ caseId, imageAssetId, seriesInstanceUid });
    annotationRequestRef.current = requestKey;
    let active = true;
    setAnnotations([]);
    setAnnotationLoading(true);
    setAnnotationLoadError("");

    void loadImageAnnotations<ClinicianImageAnnotation>({
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
        console.error("CT annotation request failed", {
          caseId,
          imageAssetId,
          seriesInstanceUid,
          status: cause instanceof ImageAnnotationLoadError ? cause.status : null,
          cause,
        });
        if (shouldNotifyImageAnnotationLoadFailure(requestKey)) {
          showToast.error("영상 주석을 불러오지 못했습니다.", {
            id: `ct-annotations-load-${requestKey}`,
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
  }, [apiBaseUrl, asset?.id, asset?.series_instance_uid, authorizedFetch, caseId]);

  const saveAnnotation = useCallback(async (pending: PendingImageAnnotation) => {
    if (!asset) return;
    try {
      const response = await authorizedFetch(
        `${apiBaseUrl}/api/doctor/cases/${caseId}/image-annotations/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_asset: asset.id, ...pending }),
        },
      );
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !body || typeof body !== "object") throw new Error("annotation save failed");
      setAnnotations((current) => [...current, body as ClinicianImageAnnotation]);
      if (asset.series_instance_uid) {
        invalidateImageAnnotationRequest({ caseId, imageAssetId: asset.id, seriesInstanceUid: asset.series_instance_uid });
      }
      showToast.success("영상 주석을 저장했습니다.");
    } catch (error) {
      console.error(error);
      showToast.error("영상 주석 저장에 실패했습니다.");
    }
  }, [apiBaseUrl, asset, authorizedFetch, caseId]);

  const deleteAnnotation = useCallback(async (annotationId: string) => {
    try {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-annotations/${annotationId}/`, { method: "DELETE" });
      if (!response.ok) throw new Error("annotation delete failed");
      setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));
      if (asset?.series_instance_uid) {
        invalidateImageAnnotationRequest({ caseId, imageAssetId: asset.id, seriesInstanceUid: asset.series_instance_uid });
      }
      showToast.success("영상 주석을 삭제했습니다.");
    } catch (error) {
      console.error(error);
      showToast.error("영상 주석 삭제에 실패했습니다.");
    }
  }, [apiBaseUrl, asset, authorizedFetch, caseId]);

  const updateAnnotation = useCallback(async (annotationId: string, pending: PendingImageAnnotation) => {
    try {
      const response = await authorizedFetch(
        `${apiBaseUrl}/api/doctor/cases/${caseId}/image-annotations/${annotationId}/`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pending) },
      );
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !body || typeof body !== "object") throw new Error("annotation update failed");
      setAnnotations((current) => current.map((annotation) => annotation.id === annotationId ? body as ClinicianImageAnnotation : annotation));
      if (asset?.series_instance_uid) {
        invalidateImageAnnotationRequest({ caseId, imageAssetId: asset.id, seriesInstanceUid: asset.series_instance_uid });
      }
      showToast.success("영상 주석을 수정했습니다.");
    } catch (error) {
      console.error(error);
      showToast.error("영상 주석 수정에 실패했습니다.");
    }
  }, [apiBaseUrl, asset, authorizedFetch, caseId]);

  const loadSegmentation = useCallback(
    async (
      id: string,
    ): Promise<CtCornerstoneSegmentation> => {
      const segmentation = await cachedRequest(
        segmentationRequestCache,
        `${caseId}:${asset?.id ?? ""}:${asset?.series_instance_uid ?? ""}:${id}`,
        async () => {
      const [metadataResponse, labelmapResponse] =
        await Promise.all([
          authorizedFetch(
            `${apiBaseUrl}/api/doctor/cases/${caseId}/ct-analyses/${id}/segmentation/`,
          ),
          authorizedFetch(
            `${apiBaseUrl}/api/doctor/cases/${caseId}/ct-analyses/${id}/segmentation/labelmap/`,
            {
              headers: {
                Accept: "application/octet-stream",
              },
            },
          ),
        ]);

      const metadata: unknown = await metadataResponse
        .json()
        .catch(() => ({}));

      if (!metadataResponse.ok) {
        throw new Error(
          detail(
            metadata,
            "CT 분할 결과를 불러오지 못했습니다.",
          ),
        );
      }

      if (!labelmapResponse.ok) {
        throw new Error("CT 분할 labelmap을 불러오지 못했습니다.");
      }

      if (
        !metadata ||
        typeof metadata !== "object" ||
        !("scalar_type" in metadata) ||
        !("dimensions" in metadata)
      ) {
        throw new Error(
          "CT 분할 metadata 형식이 올바르지 않습니다.",
        );
      }

      const bytes = await labelmapResponse.arrayBuffer();
      const ScalarArray =
        metadata.scalar_type === "uint16"
          ? Uint16Array
          : Uint8Array;

      const voxels = new ScalarArray(bytes);
      const dimensions = metadata.dimensions;

      if (
        !Array.isArray(dimensions) ||
        dimensions.length !== 3 ||
        voxels.length !==
          Number(dimensions[0]) *
            Number(dimensions[1]) *
            Number(dimensions[2])
      ) {
        throw new Error(
          "CT 분할 labelmap 크기가 올바르지 않습니다.",
        );
      }

      return {
        metadata:
          metadata as CtCornerstoneSegmentation["metadata"],
        voxels,
      };
        },
      );
      if (mountedRef.current) {
        setSegmentationAvailable(true);
        onEvidenceInfoChange?.({ segmentationAvailable: true });
      }
      return segmentation;
    },
    [
      apiBaseUrl,
      asset?.id,
      asset?.series_instance_uid,
      authorizedFetch,
      caseId,
      onEvidenceInfoChange,
    ],
  );

  if (loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center rounded-md border border-slate-800 bg-[#050812]">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-pulse rounded-full border border-slate-700 bg-slate-900" />
          <p className="mt-3 text-xs font-semibold text-slate-200">
            CT Series를 준비하는 중입니다.
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            DICOM 원본과 분할 결과를 연결하고 있습니다.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex h-full min-h-0 items-center justify-center overflow-y-auto rounded-md border border-rose-900/50 bg-[#050812]"
      >
        <div className="max-w-sm px-6 text-center">
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-sm font-bold text-rose-300">
            !
          </div>
          <p className="mt-3 text-xs font-semibold text-rose-200">
            CT 영상을 불러오지 못했습니다.
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!asset) {
    return null;
  }

  return (
    <section className="grid h-full min-h-0 grid-rows-[42px_minmax(0,1fr)] overflow-hidden rounded-md border border-slate-800 bg-[#050812] shadow-inner">
      <header className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-800 bg-[#101827] px-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-[9px] font-bold text-blue-300">
            CT
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[10px] font-bold text-slate-100">
                CT Workstation
              </h3>

              <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-emerald-300 sm:inline">
                Series READY
              </span>

              {segmentationAvailable && (
                <span className="hidden rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-violet-300 sm:inline">
                  SEG
                </span>
              )}
              {annotationLoading && (
                <span className="hidden rounded-full border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[8px] font-semibold text-slate-300 sm:inline">
                  주석 로딩
                </span>
              )}
              {annotationLoadError && (
                <span className="hidden rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-amber-300 sm:inline" title={annotationLoadError}>
                  주석 조회 불가
                </span>
              )}
            </div>

            <p
              className="max-w-[340px] truncate text-[8px] text-slate-500"
              title={asset.series_instance_uid ?? ""}
            >
              {imageCount
                ? `${imageCount} images`
                : "DICOM Series"}
              {asset.series_instance_uid
                ? ` · ${asset.series_instance_uid}`
                : ""}
            </p>
          </div>
        </div>

        <div
          className="flex shrink-0 items-center rounded-md border border-slate-700 bg-slate-900 p-0.5"
          aria-label="CT 표시 모드"
        >
          <button
            type="button"
            aria-pressed={view === "DICOM"}
            onClick={() => setView("DICOM")}
            className={`h-7 rounded px-2.5 text-[9px] font-semibold transition ${
              view === "DICOM"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            원본
          </button>

          <button
            type="button"
            aria-pressed={view === "SEGMENTATION"}
            onClick={() => { setSegmentationViewVisited(true); setView("SEGMENTATION"); }}
            className={`h-7 rounded px-2.5 text-[9px] font-semibold transition ${
              view === "SEGMENTATION"
                ? "bg-violet-600 text-white shadow-sm"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            분할 / 3D
          </button>
        </div>
      </header>

      <div className="min-h-0 overflow-hidden bg-[#02050d]">
        <div className={view === "DICOM" ? "h-full min-h-0" : "hidden h-full min-h-0"}>
          <CtDicomViewer
            key={`${caseId}:${asset.id}:${asset.series_instance_uid ?? ""}:${analysisId ?? ""}`}
            orderId={asset.id}
            assetId={asset.id}
            analysisId={analysisId}
            cacheKey={`${caseId}:${asset.id}:${asset.series_instance_uid ?? ""}:${analysisId ?? ""}`}
            nodules={nodules}
            loadSeries={loadSeries}
            loadSegmentation={loadSegmentation}
            seriesInstanceUid={asset.series_instance_uid}
            annotations={annotations}
            onAnnotationCreated={saveAnnotation}
            onAnnotationUpdated={updateAnnotation}
            onAnnotationDeleted={deleteAnnotation}
          />
        </div>
        <div className={view === "SEGMENTATION" ? "h-full min-h-0" : "hidden h-full min-h-0"}>
          {segmentationViewVisited && <CaseCtVisualization
            apiBaseUrl={apiBaseUrl}
            authorizedFetch={authorizedFetch}
            caseId={caseId}
            analysisId={analysisId}
          />}
        </div>
      </div>
    </section>
  );
}
