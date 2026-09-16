"use client";

import { useRef, useState } from "react";

export type ImageAsset = {
  id: string;
  workflow_stage?: string;
  image_type?: string;
  file_format?: string;
  acquired_at?: string | null;
  status?: string;
  storage_type?: string;
  storage_uri?: string;
  preview_url?: string | null;
  viewer_url?: string | null;
  browser_url?: string | null;
};

export type XrayDetection = { class_name: string; score: number; bbox_xyxy: [number, number, number, number] };

type EvidenceViewerPanelProps = {
  assets?: ImageAsset[];
  selectedAssetId?: string;
  loading?: boolean;
  error?: string;
  retrying?: boolean;
  onRetry?: () => void;
  detections?: XrayDetection[];
  detectionImageSize?: { width: number; height: number } | null;
};

export function EvidenceViewerPanel({
  assets = [],
  selectedAssetId,
  loading = false,
  error = "",
  retrying = false,
  onRetry,
  detections = [],
  detectionImageSize,
}: EvidenceViewerPanelProps) {
  const [activeAssetId, setActiveAssetId] = useState(selectedAssetId ?? assets[0]?.id ?? "");
  const [minimumDetectionScore, setMinimumDetectionScore] = useState(0.5);
  const viewerRef = useRef<HTMLDivElement>(null);
  const unavailableId = "tnm-reference-api-unavailable";
  const activeAsset = assets.find((asset) => asset.id === (selectedAssetId ?? activeAssetId)) ?? assets[0];
  const imageUrl = getBrowserImageUrl(activeAsset);
  const visibleDetections = detections.filter((detection) => detection.score >= minimumDetectionScore);

  const openFullscreen = async () => {
    if (!imageUrl || !viewerRef.current?.requestFullscreen) return;
    await viewerRef.current.requestFullscreen();
  };

  return (
    <section className="grid h-full min-h-[360px] grid-rows-[32px_minmax(290px,1fr)_38px] overflow-hidden border-t border-slate-200 bg-white">
      <header className="flex items-center justify-between gap-3 px-3">
        <h3 className="whitespace-nowrap text-[11px] font-bold text-slate-900">영상 미리보기</h3>
        <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-700">Annotation API 연동 대기</span>
      </header>

      <div className="grid min-h-0 grid-cols-2 border-y border-slate-100">
        <div ref={viewerRef} className="relative flex min-h-0 items-center justify-center overflow-hidden bg-slate-950 text-white">
          {loading ? (
            <p role="status" className="text-xs font-semibold text-slate-300">원본 영상을 불러오는 중입니다.</p>
          ) : error ? (
            <div role="alert" className="px-6 text-center">
              <p className="text-xs font-semibold text-rose-200">원본 영상을 불러오지 못했습니다.</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">{error}</p>
              {onRetry && (
                <button type="button" disabled={retrying} onClick={onRetry} className="mt-3 rounded border border-rose-300 px-3 py-1.5 text-[10px] font-semibold text-rose-100 disabled:opacity-50">
                  {retrying ? "재시도 중" : "영상만 다시 시도"}
                </button>
              )}
            </div>
          ) : imageUrl ? (
            <div className="relative inline-block h-full max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={`${activeAsset?.image_type ?? "검사"} 원본 영상`} className="block h-full max-w-full object-contain" />
              {activeAsset?.image_type === "XRAY" && detectionImageSize && visibleDetections.map((detection, index) => <DetectionBox key={`${detection.class_name}-${index}`} detection={detection} width={detectionImageSize.width} height={detectionImageSize.height} />)}
            </div>
          ) : (
            <div className="px-6 text-center">
              <p className="text-xs font-semibold text-slate-200">표시 가능한 원본 영상이 없습니다.</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                {activeAsset ? "현재 저장소 형식은 영상 제공 API 연결 후 이 영역에 표시됩니다." : "Case 영상 API가 연결되면 이 영역에서 원본 영상을 바로 확인할 수 있습니다."}
              </p>
            </div>
          )}
          {imageUrl && <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[9px]">{activeAsset?.image_type || "영상"} · {activeAsset?.file_format || "형식 미상"}</span>}
        </div>

        <aside className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white p-3" aria-label="원본 영상 목록">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold text-slate-700">영상 목록 및 정보</p>
            <span className="text-[9px] text-slate-400">{assets.length}건</span>
          </div>
          {assets.length === 0 ? (
            <p className="py-6 text-center text-[10px] text-slate-400">연결된 영상이 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {assets.map((asset) => (
                <button key={asset.id} type="button" onClick={() => setActiveAssetId(asset.id)} className={`w-full rounded border px-2 py-2 text-left text-[9px] ${asset.id === activeAsset?.id ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <span className="block truncate font-semibold">{asset.image_type || "영상"} · {asset.file_format || "-"}</span>
                  <span className="mt-1 block truncate text-slate-400">{asset.storage_type || "저장소 정보 없음"} · {asset.status || "상태 없음"}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      <footer className={`relative flex items-center gap-1.5 px-3 ${activeAsset?.image_type === "XRAY" ? "[&>button:nth-of-type(n+2)]:hidden" : ""}`}>
        <button type="button" disabled={!imageUrl} onClick={openFullscreen} aria-describedby={!imageUrl ? unavailableId : undefined} className="whitespace-nowrap rounded border border-blue-300 px-2 py-1 text-[9px] font-semibold text-blue-700 disabled:border-slate-200 disabled:text-slate-400">크게 보기</button>
        {activeAsset?.image_type === "XRAY" && detections.length > 0 && <span className="flex items-center gap-1"><span className="text-[9px] text-slate-500">AI 병변 {visibleDetections.length}/{detections.length}</span>{([0, 0.5, 0.7] as const).map((score) => <button key={score} type="button" onClick={() => setMinimumDetectionScore(score)} className={`rounded px-1.5 py-1 text-[9px] ${minimumDetectionScore === score ? "bg-rose-600 font-semibold text-white" : "bg-rose-50 text-rose-700"}`}>{score === 0 ? "전체" : `${Math.round(score * 100)}%+`}</button>)}</span>}
        <button type="button" disabled aria-describedby={unavailableId} className="whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-[9px] font-semibold text-slate-400">관심 위치 표시</button>
        {["T 소견에 참조", "N 소견에 참조", "M 소견에 참조"].map((label) => <button key={label} type="button" disabled aria-describedby={unavailableId} className="whitespace-nowrap rounded bg-slate-100 px-2 py-1 text-[9px] text-slate-400">{label}</button>)}
        <span id={unavailableId} className="ml-auto truncate text-[8px] text-slate-500">영상·Annotation API가 연결된 기능만 활성화됩니다.</span>
        {activeAsset?.image_type === "XRAY" && <span className="absolute inset-y-0 right-0 flex items-center bg-white px-3 text-[9px] text-slate-500">X-ray는 AI 병변 박스와 판독 소견을 참고합니다.</span>}
      </footer>
    </section>
  );
}

export function getBrowserImageUrl(asset?: ImageAsset) {
  if (asset?.browser_url) return asset.browser_url;
  if (asset?.preview_url && /^https?:\/\//i.test(asset.preview_url)) return asset.preview_url;
  if (!asset?.storage_uri || !/^https?:\/\//i.test(asset.storage_uri)) return null;
  if (!asset.file_format) return asset.storage_uri;
  return ["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(asset.file_format.toUpperCase()) ? asset.storage_uri : null;
}

function DetectionBox({ detection, width, height }: { detection: XrayDetection; width: number; height: number }) {
  const [x1, y1, x2, y2] = detection.bbox_xyxy;
  if (![x1, y1, x2, y2, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const left = Math.max(0, Math.min(100, (x1 / width) * 100));
  const top = Math.max(0, Math.min(100, (y1 / height) * 100));
  const boxWidth = Math.max(0, Math.min(100 - left, ((x2 - x1) / width) * 100));
  const boxHeight = Math.max(0, Math.min(100 - top, ((y2 - y1) / height) * 100));
  if (!boxWidth || !boxHeight) return null;
  return <div className="pointer-events-none absolute border-2 border-rose-500 bg-rose-500/10 shadow-[0_0_0_1px_rgba(255,255,255,.65)]" style={{ left: `${left}%`, top: `${top}%`, width: `${boxWidth}%`, height: `${boxHeight}%` }}>
    <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{detection.class_name} {(detection.score * 100).toFixed(0)}%</span>
  </div>;
}
