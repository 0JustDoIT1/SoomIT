"use client";

import { useCallback, useEffect, useState } from "react";

import { CtDicomViewer } from "@/components/medical-imaging/ct-dicom-viewer";
import type { CtCornerstoneSegmentation } from "@/app/radiology/_lib/cornerstone-labelmap";
import { ensureCornerstoneInitialized } from "@/app/radiology/_lib/cornerstone-init";

import { CaseCtVisualization } from "./case-ct-visualization";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Asset = { id: string; workflow_stage: string; image_type: string; status: string; series_instance_uid?: string | null };
type DicomRow = Record<string, { Value?: unknown[] }>;
export type CtEvidenceInfo = { seriesInstanceUid?: string | null; imageCount?: number; segmentationAvailable?: boolean };

function sopUid(row: DicomRow) { const value = row["00080018"]?.Value?.[0]; return typeof value === "string" ? value : null; }
function detail(body: unknown, fallback: string) { return body && typeof body === "object" && "detail" in body && typeof body.detail === "string" ? body.detail : fallback; }

export function CaseCtSegmentationEvidence({ apiBaseUrl, authorizedFetch, caseId, analysisId, onEvidenceInfoChange }: { apiBaseUrl: string; authorizedFetch: AuthorizedFetch; caseId: string; analysisId?: string; onEvidenceInfoChange?: (info: CtEvidenceInfo) => void }) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"DICOM" | "SEGMENTATION">("DICOM");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true); setError("");
      try {
        const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/`, { signal: controller.signal });
        const body: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(detail(body, "CT 영상 목록을 불러오지 못했습니다."));
        const selected = (Array.isArray(body) ? body : []).find((item): item is Asset => Boolean(item) && typeof item === "object" && "id" in item && typeof item.id === "string" && item.workflow_stage === "CT" && item.image_type === "CT" && item.status === "READY");
        if (!selected) throw new Error("조회 가능한 CT DICOM Series가 없습니다.");
        if (!controller.signal.aborted) {
          setAsset(selected);
          onEvidenceInfoChange?.({ seriesInstanceUid: selected.series_instance_uid });
        }
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "CT 영상을 불러오지 못했습니다."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [apiBaseUrl, authorizedFetch, caseId, onEvidenceInfoChange]);

  const loadSeries = useCallback(async (_orderId: string, assetId: string) => {
    const instancesResponse = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/${assetId}/dicom-web/instances/`);
    const instanceBody: unknown = await instancesResponse.json().catch(() => ({}));
    if (!instancesResponse.ok || !Array.isArray(instanceBody)) throw new Error(detail(instanceBody, "CT DICOM instance 목록을 불러오지 못했습니다."));
    const uids = instanceBody.map((item) => sopUid(item as DicomRow)).filter((value): value is string => Boolean(value));
    if (!uids.length) throw new Error("CT DICOM instance가 없습니다.");
    onEvidenceInfoChange?.({ imageCount: uids.length });
    const { dicomImageLoader } = await ensureCornerstoneInitialized();
    const imageIds = await Promise.all(uids.map(async (uid) => {
      const response = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/${assetId}/dicom-web/instances/${uid}/`, { headers: { Accept: "application/dicom" } });
      if (!response.ok) throw new Error("CT 원본 DICOM을 불러오지 못했습니다.");
      const blob = await response.blob();
      return dicomImageLoader.wadouri.fileManager.add(new File([blob], `${uid}.dcm`, { type: "application/dicom" }));
    }));
    return { imageIds };
  }, [apiBaseUrl, authorizedFetch, caseId, onEvidenceInfoChange]);

  const loadSegmentation = useCallback(async (id: string): Promise<CtCornerstoneSegmentation> => {
    const [metadataResponse, labelmapResponse] = await Promise.all([
      authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/ct-analyses/${id}/segmentation/`),
      authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/ct-analyses/${id}/segmentation/labelmap/`, { headers: { Accept: "application/octet-stream" } }),
    ]);
    const metadata: unknown = await metadataResponse.json().catch(() => ({}));
    if (!metadataResponse.ok) throw new Error(detail(metadata, "CT 분할 결과를 불러오지 못했습니다."));
    if (!labelmapResponse.ok) throw new Error("CT 분할 labelmap을 불러오지 못했습니다.");
    if (!metadata || typeof metadata !== "object" || !("scalar_type" in metadata) || !("dimensions" in metadata)) throw new Error("CT 분할 metadata 형식이 올바르지 않습니다.");
    const bytes = await labelmapResponse.arrayBuffer();
    const ScalarArray = metadata.scalar_type === "uint16" ? Uint16Array : Uint8Array;
    const voxels = new ScalarArray(bytes);
    const dimensions = metadata.dimensions;
    if (!Array.isArray(dimensions) || dimensions.length !== 3 || voxels.length !== Number(dimensions[0]) * Number(dimensions[1]) * Number(dimensions[2])) throw new Error("CT 분할 labelmap 크기가 올바르지 않습니다.");
    onEvidenceInfoChange?.({ segmentationAvailable: true });
    return { metadata: metadata as CtCornerstoneSegmentation["metadata"], voxels };
  }, [apiBaseUrl, authorizedFetch, caseId, onEvidenceInfoChange]);

  if (loading) return <p className="rounded border border-slate-200 bg-white px-3 py-5 text-center text-xs text-slate-500">CT 원본 영상과 분할 결과를 준비하는 중입니다.</p>;
  if (error) return <p role="alert" className="rounded border border-rose-100 bg-rose-50 px-3 py-3 text-xs text-rose-700">{error}</p>;
  if (!asset) return null;
  return <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2"><div><p className="text-[10px] font-semibold text-blue-600">원본 근거 · CT 분할</p><h2 className="mt-0.5 text-sm font-bold text-slate-800">흉부 CT</h2></div><div className="flex rounded-md bg-slate-100 p-0.5"><button type="button" onClick={() => setView("DICOM")} className={`rounded px-2 py-1 text-[10px] font-semibold ${view === "DICOM" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>원본 영상</button><button type="button" onClick={() => setView("SEGMENTATION")} className={`rounded px-2 py-1 text-[10px] font-semibold ${view === "SEGMENTATION" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>분할 결과</button></div></header><div className="min-h-0 flex-1 overflow-hidden">{view === "DICOM" ? <CtDicomViewer orderId={asset.id} assetId={asset.id} analysisId={analysisId} loadSeries={loadSeries} loadSegmentation={loadSegmentation} /> : <CaseCtVisualization apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} caseId={caseId} analysisId={analysisId} />}</div></section>;
}
