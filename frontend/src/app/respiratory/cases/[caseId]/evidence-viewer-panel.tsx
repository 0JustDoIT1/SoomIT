"use client";

import { useRef, useState } from "react";

type ImageAsset = {
  id: string;
  image_type?: string;
  file_format?: string;
  acquired_at?: string | null;
  status?: string;
  storage_type?: string;
  storage_uri?: string;
};

export function EvidenceViewerPanel({ assets = [], selectedAssetId }: { assets?: ImageAsset[]; selectedAssetId?: string }) {
  const [activeAssetId, setActiveAssetId] = useState(selectedAssetId ?? assets[0]?.id ?? "");
  const viewerRef = useRef<HTMLDivElement>(null);
  const unavailableId = "tnm-reference-api-unavailable";
  const activeAsset = assets.find((asset) => asset.id === (selectedAssetId ?? activeAssetId)) ?? assets[0];
  const imageUrl = getBrowserImageUrl(activeAsset);

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
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={`${activeAsset?.image_type ?? "검사"} 원본 영상`} className="h-full w-full object-contain" />
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

      <footer className="flex items-center gap-1.5 px-3">
        <button type="button" disabled={!imageUrl} onClick={openFullscreen} aria-describedby={!imageUrl ? unavailableId : undefined} className="whitespace-nowrap rounded border border-blue-300 px-2 py-1 text-[9px] font-semibold text-blue-700 disabled:border-slate-200 disabled:text-slate-400">크게 보기</button>
        <button type="button" disabled aria-describedby={unavailableId} className="whitespace-nowrap rounded border border-slate-200 px-2 py-1 text-[9px] font-semibold text-slate-400">관심 위치 표시</button>
        {["T 소견에 참조", "N 소견에 참조", "M 소견에 참조"].map((label) => <button key={label} type="button" disabled aria-describedby={unavailableId} className="whitespace-nowrap rounded bg-slate-100 px-2 py-1 text-[9px] text-slate-400">{label}</button>)}
        <span id={unavailableId} className="ml-auto truncate text-[8px] text-slate-500">영상·Annotation API가 연결된 기능만 활성화됩니다.</span>
      </footer>
    </section>
  );
}

function getBrowserImageUrl(asset?: ImageAsset) {
  if (!asset?.storage_uri || !/^https?:\/\//i.test(asset.storage_uri)) return null;
  if (!asset.file_format) return asset.storage_uri;
  return ["PNG", "JPG", "JPEG", "WEBP", "GIF"].includes(asset.file_format.toUpperCase()) ? asset.storage_uri : null;
}
