import { EvidenceViewerPanel } from "./evidence-viewer-panel";
import { ResultReviewPanel } from "./result-review-panel";

type ClinicalResult = {
  exam_type: string;
  exam_name?: string;
  result_status?: string;
  result_status_label?: string;
  result_date?: string | null;
  result_detail?: unknown;
};

type AiResult = {
  analysis_type: string;
  analysis_type_label?: string;
  status?: string;
  status_label?: string;
  model_name?: string;
  model_version_name?: string;
  completed_at?: string | null;
  result_detail?: unknown;
};

type Props = {
  pathologyClinicalResult?: ClinicalResult;
  pathologyAiResult?: AiResult;
  geneClinicalResult?: ClinicalResult;
  geneAiResult?: AiResult;
  clinicalError?: string;
  aiError?: string;
  clinicalRetrying?: boolean;
  aiRetrying?: boolean;
  onRetryClinical?: () => void;
  onRetryAi?: () => void;
};

export function PathologyGeneReviewPanel({
  pathologyClinicalResult,
  pathologyAiResult,
  geneClinicalResult,
  geneAiResult,
  clinicalError,
  aiError,
  clinicalRetrying,
  aiRetrying,
  onRetryClinical,
  onRetryAi,
}: Props) {
  const sharedProps = {
    clinicalError,
    aiError,
    clinicalRetrying,
    aiRetrying,
    onRetryClinical,
    onRetryAi,
    showEvidence: false,
  };

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-5 py-3">
        <p className="text-[10px] font-semibold text-blue-600">검사 결과</p>
        <h1 className="mt-0.5 text-lg font-bold text-slate-900">조직/유전자 검사·결과</h1>
        <p className="mt-1 text-xs text-slate-600">
          조직검사와 유전자검사의 전문과 확정 결과 및 AI 후보를 항목별로 구분해 확인합니다.
        </p>
      </header>

      <div className="border-b border-slate-200 bg-slate-50/50 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold text-blue-600">원본 근거</p>
            <h2 className="mt-0.5 text-sm font-bold text-slate-800">조직 원본 영상</h2>
          </div>
          <p className="whitespace-nowrap text-[10px] text-slate-400">
            연결된 원본 근거만 표시하며, 필요할 때 전체 화면으로 확인합니다.
          </p>
        </div>
        <div className="overflow-x-auto"><EvidenceViewerPanel /></div>
      </div>

      <div className="grid min-w-[920px] grid-cols-2 gap-3 bg-slate-50 p-3">
        <ResultReviewPanel stage="PATHOLOGY" clinicalResult={pathologyClinicalResult} aiResult={pathologyAiResult} {...sharedProps} />
        <ResultReviewPanel stage="GENE" clinicalResult={geneClinicalResult} aiResult={geneAiResult} {...sharedProps} />
      </div>
    </section>
  );
}
