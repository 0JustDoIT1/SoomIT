import type { WholeSlideImage } from "../_lib/pathology-api";
import { OrthancWsiViewer } from "./orthanc-wsi-viewer";
import { PathologyStateMessage } from "./pathology-state-message";

const imageStatusLabel: Record<string, string> = {
  UPLOADING: "업로드 중", VALIDATING: "검증 중", READY: "사용 가능",
  FAILED: "처리 실패", INVALID: "무효",
};
const stainLabel: Record<string, string> = { HE: "H&E", PDL1: "PD-L1", OTHER: "기타" };

type Props = { slide: WholeSlideImage | null; loading: boolean; emptyMessage: string };
const display = (value: string | number | null) => value === null || value === "" ? "-" : String(value);

export function WsiViewerPanel({ slide, loading, emptyMessage }: Props) {
  const canView = Boolean(slide?.orthanc_series_id && slide.image_status === "READY" && slide.is_current);
  return <section className="min-w-0 border border-slate-200 bg-white">
    <div className="border-b border-slate-200 px-5 py-4">
      <h2 className="text-sm font-semibold text-slate-900">WSI 뷰어</h2>
      <p className="mt-1 text-xs text-slate-500">Orthanc WSI 타일을 OpenSeadragon으로 표시합니다.</p>
    </div>
    <div className="p-5">
      {canView && slide ? <OrthancWsiViewer slide={slide} /> : <PathologyStateMessage
        variant={loading ? "loading" : slide ? "info" : "empty"}
        title={loading ? "WSI 정보를 불러오는 중입니다." : slide ? "Orthanc WSI 연결 대기" : emptyMessage}
        description={slide ? "이 WSI에 사용 가능한 Orthanc series가 아직 연결되지 않았습니다." : "검체에 등록된 WSI가 있으면 목록에서 선택할 수 있습니다."}
        className="flex min-h-72 items-center justify-center border-dashed px-6 text-center"
      />}
      {slide && <div className="mt-5 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">선택한 WSI 정보</h3>
        <dl className="mt-4 space-y-3 text-sm">{[
          ["슬라이드 코드", slide.slide_code], ["파일명", slide.original_filename],
          ["염색", stainLabel[slide.stain] ?? slide.stain], ["파일 형식", slide.file_format],
          ["MPP", display(slide.mpp)], ["상태", slide.is_current ? (imageStatusLabel[slide.image_status] ?? slide.image_status) : "무효"],
          ["저장 위치", slide.storage_uri], ["Orthanc Series", slide.orthanc_series_id ?? "-"],
        ].map(([label, value]) => <div key={label} className="grid grid-cols-[100px_minmax(0,1fr)] gap-3"><dt className="text-slate-500">{label}</dt><dd className="min-w-0 break-all font-medium text-slate-900">{value}</dd></div>)}</dl>
      </div>}
    </div>
  </section>;
}
