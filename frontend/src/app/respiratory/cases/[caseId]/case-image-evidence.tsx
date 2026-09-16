"use client";

import { useEffect, useState } from "react";

import { EvidenceViewerPanel, type ImageAsset, type XrayDetection } from "./evidence-viewer-panel";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type CaseImageEvidenceProps = {
  apiBaseUrl: string;
  authorizedFetch: AuthorizedFetch;
  caseId: string;
  stage: string;
};

type AiAnalysis = {
  analysis_type?: string;
  status?: string;
  result_detail?: { result_payload?: { image?: { width?: number; height?: number }; detections?: unknown } };
};

function errorMessage(response: Response, fallback: string) {
  return response.json()
    .then((body: unknown) => {
      if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") return body.detail;
      return fallback;
    })
    .catch(() => fallback);
}

export function CaseImageEvidence({ apiBaseUrl, authorizedFetch, caseId, stage }: CaseImageEvidenceProps) {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const [detections, setDetections] = useState<XrayDetection[]>([]);
  const [detectionImageSize, setDetectionImageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const objectUrls: string[] = [];

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [response, aiResponse] = await Promise.all([
          authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/image-assets/`, { signal: controller.signal }),
          authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/ai-results/`, { signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error(await errorMessage(response, "영상 목록을 불러오지 못했습니다."));
        const payload: unknown = await response.json();
        const aiPayload: unknown = aiResponse.ok ? await aiResponse.json() : [];
        const stageAssets = (Array.isArray(payload) ? payload : [])
          .filter((item): item is ImageAsset => Boolean(item) && typeof item === "object" && "id" in item)
          .filter((item) => item.workflow_stage === stage);

        const resolvedAssets = await Promise.all(stageAssets.map(async (asset) => {
          if (asset.image_type !== "XRAY" || !asset.preview_url) return asset;
          const previewUrl = asset.preview_url.startsWith("http") ? asset.preview_url : `${apiBaseUrl}${asset.preview_url}`;
          const previewResponse = await authorizedFetch(previewUrl, { signal: controller.signal, headers: { Accept: "image/png,image/jpeg" } });
          if (!previewResponse.ok) throw new Error(await errorMessage(previewResponse, "X-ray 영상을 불러오지 못했습니다."));
          const browserUrl = URL.createObjectURL(await previewResponse.blob());
          objectUrls.push(browserUrl);
          return { ...asset, browser_url: browserUrl };
        }));
        if (!controller.signal.aborted) setAssets(resolvedAssets);
        const xrayAnalysis = (Array.isArray(aiPayload) ? aiPayload as AiAnalysis[] : []).find((item) => item.analysis_type === "XRAY_ANALYSIS" && item.status === "SUCCEEDED");
        const resultPayload = xrayAnalysis?.result_detail?.result_payload;
        const image = resultPayload?.image;
        const rawDetections = Array.isArray(resultPayload?.detections) ? resultPayload.detections : [];
        const nextDetections = rawDetections.filter((item): item is XrayDetection => Boolean(item) && typeof item === "object" && typeof (item as XrayDetection).class_name === "string" && typeof (item as XrayDetection).score === "number" && Array.isArray((item as XrayDetection).bbox_xyxy) && (item as XrayDetection).bbox_xyxy.length === 4);
        if (!controller.signal.aborted) {
          setDetections(nextDetections);
          setDetectionImageSize(typeof image?.width === "number" && typeof image?.height === "number" ? { width: image.width, height: image.height } : null);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setAssets([]);
          setError(cause instanceof Error ? cause.message : "영상 조회 중 오류가 발생했습니다.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => {
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [apiBaseUrl, authorizedFetch, caseId, retryVersion, stage]);

  return <EvidenceViewerPanel assets={assets} loading={loading} error={error} retrying={loading && retryVersion > 0} onRetry={() => setRetryVersion((value) => value + 1)} detections={detections} detectionImageSize={detectionImageSize} />;
}
