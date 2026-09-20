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
  analysisStatus?: string;
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
  analysisStatus,
}: EvidenceViewerPanelProps) {
  const [activeAssetId, setActiveAssetId] = useState(selectedAssetId ?? assets[0]?.id ?? "");
  const [showAllDetections, setShowAllDetections] = useState(false);
  const [selectedDetectionIndex, setSelectedDetectionIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const viewerRef = useRef<HTMLDivElement>(null);
  const activeAsset = assets.find((asset) => asset.id === (selectedAssetId ?? activeAssetId)) ?? assets[0];
  const imageUrl = getBrowserImageUrl(activeAsset);
  const rankedDetections = [...detections].sort((left, right) => right.score - left.score);
  const priorityDetections = rankedDetections.filter((detection) => detection.score >= 0.7).slice(0, 3);
  const visibleDetections = showAllDetections ? rankedDetections : priorityDetections.length ? priorityDetections : rankedDetections.slice(0, 1);

  const openFullscreen = async () => {
    if (!imageUrl || !viewerRef.current?.requestFullscreen) return;
    await viewerRef.current.requestFullscreen();
  };

  const zoomIn = () => {
    setZoom((value) => Math.min(3, Number((value + 0.2).toFixed(1))));
  };

  const zoomOut = () => {
    setZoom((value) => Math.max(0.6, Number((value - 0.2).toFixed(1))));
  };

  const resetViewer = () => {
    setZoom(1);
    setSelectedDetectionIndex(null);
  };

  const onViewerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "f" || event.key === "F") { event.preventDefault(); void openFullscreen(); }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomIn(); }
    if (event.key === "-") { event.preventDefault(); zoomOut(); }
    if (event.key === "r" || event.key === "R") { event.preventDefault(); resetViewer(); }
  };

  return (
    <section className="grid h-full min-h-0 grid-rows-[40px_minmax(0,1fr)] overflow-hidden rounded-md border border-slate-800 bg-[#050812] shadow-inner">
      <span className="sr-only">
        {activeAsset?.storage_type || "-"} · {activeAsset?.status || "-"}
      </span>

      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-800 bg-[#101827] px-2.5 text-slate-100">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-[9px] font-bold text-blue-300">
            XR
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[10px] font-bold text-slate-100">
                X-ray Viewer
              </h3>
              {analysisStatus && (
                <span className="hidden rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[8px] font-semibold text-blue-300 sm:inline">
                  AI {analysisStatus}
                </span>
              )}
            </div>
            <p className="hidden truncate text-[8px] text-slate-500 md:block">
              F 전체화면 · +/- 확대 · R 초기화
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden min-w-10 text-center text-[8px] tabular-nums text-slate-400 sm:inline">
            {Math.round(zoom * 100)}%
          </span>

          <ViewerToolButton
            label="축소"
            disabled={!imageUrl || zoom <= 0.6}
            onClick={zoomOut}
          >
            −
          </ViewerToolButton>

          <ViewerToolButton
            label="확대"
            disabled={!imageUrl || zoom >= 3}
            onClick={zoomIn}
          >
            +
          </ViewerToolButton>

          <ViewerToolButton
            label="초기화"
            disabled={!imageUrl}
            onClick={resetViewer}
          >
            R
          </ViewerToolButton>

          {activeAsset?.image_type === "XRAY" && detections.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAllDetections((current) => !current)}
              aria-pressed={showAllDetections}
              className={`h-7 whitespace-nowrap rounded-md border px-2 text-[8px] font-semibold transition ${
                showAllDetections
                  ? "border-rose-400/70 bg-rose-500/15 text-rose-200"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-700"
              }`}
              title={showAllDetections ? "주요 병변만 표시" : "전체 병변 표시"}
            >
              병변 {showAllDetections ? "전체" : "주요"} {visibleDetections.length}/{detections.length}
            </button>
          )}

          <ViewerToolButton
            label="전체화면"
            disabled={!imageUrl}
            onClick={() => void openFullscreen()}
            wide
          >
            전체화면
          </ViewerToolButton>
        </div>
      </header>

      <div className="relative min-h-0 overflow-hidden bg-[#02050d]">
        <div
          ref={viewerRef}
          tabIndex={0}
          onKeyDown={onViewerKeyDown}
          className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-[#02050d] text-white outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
          aria-label="원본 영상 뷰어. F 전체화면, 더하기·빼기 확대·축소, R 초기화"
        >
          {imageUrl && (
            <>
              <div className="pointer-events-none absolute left-2.5 top-2.5 z-30 flex max-w-[60%] flex-wrap items-center gap-1.5">
                <HudChip strong>
                  {activeAsset?.image_type || "IMAGE"}
                </HudChip>
                <HudChip>
                  {activeAsset?.file_format || "형식 미상"}
                </HudChip>
                {assets.length > 1 && (
                  <HudChip>
                    Series {assets.findIndex((asset) => asset.id === activeAsset?.id) + 1}/{assets.length}
                  </HudChip>
                )}
              </div>

              <div className="pointer-events-none absolute right-2.5 top-2.5 z-30 max-w-[38%] text-right">
                <div className="inline-flex rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[8px] text-slate-300 backdrop-blur-sm">
                  {activeAsset?.acquired_at
                    ? new Date(activeAsset.acquired_at).toLocaleString("ko-KR")
                    : "촬영일 정보 없음"}
                </div>
              </div>
            </>
          )}

          {loading ? (
            <ViewerState
              title="원본 영상을 불러오는 중입니다."
              description="영상 데이터를 준비하고 있습니다."
            />
          ) : error ? (
            <div role="alert" className="max-w-sm px-6 text-center">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-rose-400/30 bg-rose-500/10 text-sm text-rose-300">
                !
              </div>
              <p className="mt-3 text-xs font-semibold text-rose-200">
                원본 영상을 불러오지 못했습니다.
              </p>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                {error}
              </p>
              {onRetry && (
                <button
                  type="button"
                  disabled={retrying}
                  onClick={onRetry}
                  className="mt-3 rounded-md border border-rose-400/40 bg-rose-500/10 px-3 py-1.5 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  {retrying ? "재시도 중" : "영상 다시 시도"}
                </button>
              )}
            </div>
          ) : imageUrl ? (
            <div
              className="relative inline-block h-full max-w-full origin-center transition-transform duration-150"
              style={{ transform: `scale(${zoom})` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={`${activeAsset?.image_type ?? "검사"} 원본 영상`}
                className="block h-full max-w-full select-none object-contain"
                draggable={false}
              />

              {activeAsset?.image_type === "XRAY" &&
                detectionImageSize &&
                visibleDetections.map((detection, index) => (
                  <DetectionBox
                    key={`${detection.class_name}-${index}`}
                    detection={detection}
                    index={index}
                    width={detectionImageSize.width}
                    height={detectionImageSize.height}
                    selected={selectedDetectionIndex === index}
                    onSelect={() => setSelectedDetectionIndex(index)}
                  />
                ))}
            </div>
          ) : (
            <ViewerState
              title="표시 가능한 원본 영상이 없습니다."
              description={
                activeAsset
                  ? "현재 저장소 형식은 영상 제공 API 연결 후 이 영역에 표시됩니다."
                  : "Case 영상 API가 연결되면 이 영역에서 원본 영상을 바로 확인할 수 있습니다."
              }
            />
          )}

          {imageUrl && (
            <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-30 flex items-center gap-1.5">
              <span className="rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[8px] font-semibold text-slate-300 backdrop-blur-sm">
                {Math.round(zoom * 100)}%
              </span>
              {activeAsset?.image_type === "XRAY" && detections.length > 0 && (
                <span className="rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[8px] text-slate-400 backdrop-blur-sm">
                  AI 병변 {visibleDetections.length}개 표시
                </span>
              )}
            </div>
          )}

          {imageUrl && activeAsset?.image_type === "XRAY" && detections.length > 0 && (
            <p className="pointer-events-none absolute bottom-2.5 right-2.5 z-30 hidden rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[8px] text-slate-500 backdrop-blur-sm lg:block">
              병변 박스를 클릭하면 선택 상태로 강조됩니다.
            </p>
          )}
        </div>

        <aside className="hidden" aria-label="원본 영상 목록 및 촬영 정보">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => setActiveAssetId(asset.id)}
            >
              {asset.image_type || "영상"}
            </button>
          ))}
        </aside>
      </div>
    </section>
  );
}

function ViewerToolButton({
  label,
  disabled = false,
  onClick,
  children,
  wide = false,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-7 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-[9px] font-bold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-35 ${
        wide ? "px-2.5" : "w-7"
      }`}
    >
      {children}
    </button>
  );
}

function HudChip({
  children,
  strong = false,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <span
      className={`rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[8px] backdrop-blur-sm ${
        strong ? "font-bold text-white" : "font-medium text-slate-300"
      }`}
    >
      {children}
    </span>
  );
}

function ViewerState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="max-w-sm px-6 text-center">
      <div className="mx-auto h-8 w-8 animate-pulse rounded-full border border-slate-700 bg-slate-900" />
      <p className="mt-3 text-xs font-semibold text-slate-200">{title}</p>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">{description}</p>
    </div>
  );
}

export function getBrowserImageUrl(asset?: ImageAsset) {
  if (asset?.browser_url) return asset.browser_url;
  if (asset?.preview_url && /^https?:\/\//i.test(asset.preview_url)) return asset.preview_url;
  if (!asset?.storage_uri || !/^https?:\/\//i.test(asset.storage_uri)) return null;
  if (!asset.file_format) return asset.storage_uri;
  return ["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(asset.file_format.toUpperCase()) ? asset.storage_uri : null;
}

function DetectionBox({ detection, index, width, height, selected, onSelect }: { detection: XrayDetection; index: number; width: number; height: number; selected: boolean; onSelect: () => void }) {
  const [x1, y1, x2, y2] = detection.bbox_xyxy;
  if (![x1, y1, x2, y2, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const left = Math.max(0, Math.min(100, (x1 / width) * 100));
  const top = Math.max(0, Math.min(100, (y1 / height) * 100));
  const boxWidth = Math.max(0, Math.min(100 - left, ((x2 - x1) / width) * 100));
  const boxHeight = Math.max(0, Math.min(100 - top, ((y2 - y1) / height) * 100));
  if (!boxWidth || !boxHeight) return null;
  return <button type="button" aria-label={`L${index + 1} ${detection.class_name}`} onClick={onSelect} className={`absolute bg-rose-500/[0.06] transition ${selected ? "z-20 border-2 border-amber-300 ring-2 ring-amber-300/30" : "border border-rose-400/90 hover:border-rose-300"}`} style={{ left: `${left}%`, top: `${top}%`, width: `${boxWidth}%`, height: `${boxHeight}%` }}>
    <span className={`absolute -top-[18px] left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[8px] font-bold text-white shadow-sm ${selected ? "bg-amber-500" : "bg-rose-600/95"}`}>L{index + 1} · {detection.class_name} {(detection.score * 100).toFixed(0)}%</span>
  </button>;
}
