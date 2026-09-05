import type { WholeSlideImage } from "../_lib/pathology-api";

const imageStatusLabel: Record<string, string> = {
  UPLOADING: "업로드 중",
  READY: "사용 가능",
  FAILED: "처리 실패",
  INVALIDATED: "무효",
};

const stainLabel: Record<string, string> = {
  HE: "H&E",
  PDL1: "PD-L1",
  OTHER: "기타",
};

type WsiViewerPanelProps = {
  slide: WholeSlideImage | null;
  loading: boolean;
};

function displayValue(value: string | number | null) {
  return value === null || value === "" ? "-" : String(value);
}

export function WsiViewerPanel({ slide, loading }: WsiViewerPanelProps) {
  return (
    <section className="min-w-0 border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-900">WSI 뷰어</h2>
        <p className="mt-1 text-xs text-slate-500">
          향후 OpenSeadragon 기반 원본 영상 뷰어가 연결될 영역입니다.
        </p>
      </div>

      <div className="p-5">
        <div className="flex min-h-72 items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {loading
                ? "WSI 정보를 불러오는 중입니다."
                : slide
                  ? "WSI 원본 영상 API 연동 대기"
                  : "표시할 WSI가 없습니다."}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {slide
                ? "썸네일·타일·원본 파일 제공 API가 준비되면 이 영역에 뷰어를 연결합니다."
                : "검체에 등록된 WSI가 있으면 목록에서 선택할 수 있습니다."}
            </p>
          </div>
        </div>

        {slide && (
          <div className="mt-5 border-t border-slate-200 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">선택한 WSI 정보</h3>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ["슬라이드 코드", slide.slide_code],
                ["파일명", slide.original_filename],
                ["염색", stainLabel[slide.stain] ?? slide.stain],
                ["파일 형식", slide.file_format],
                ["MPP", displayValue(slide.mpp)],
                [
                  "상태",
                  slide.is_current
                    ? (imageStatusLabel[slide.image_status] ?? slide.image_status)
                    : "무효",
                ],
                ["저장 위치", slide.storage_uri],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="min-w-0 break-all font-medium text-slate-900">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            {!slide.is_current && slide.invalidation_reason && (
              <div className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-semibold">무효 처리 사유</p>
                <p className="mt-1">{slide.invalidation_reason}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
