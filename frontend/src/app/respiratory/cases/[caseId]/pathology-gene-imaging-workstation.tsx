import { EvidenceViewerPanel } from "./evidence-viewer-panel";
import { ResultReviewPanel } from "./result-review-panel";
import { CaseWsiEvidence } from "./case-wsi-evidence";

type ClinicalResult = {
  workflow_stage: string;
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
  lastSyncedAt?: Date | null;
  syncingResults?: boolean;
  onRefreshResults?: () => void;
  syncNotice?: string;
  caseId?: string;
  apiBaseUrl?: string;
  authorizedFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
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
  lastSyncedAt,
  syncingResults,
  onRefreshResults,
  syncNotice,
  caseId,
  apiBaseUrl,
  authorizedFetch,
}: Props) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
        <div>
          <p className="text-[10px] font-semibold text-blue-600">검사 결과 · 영상 작업공간</p>
          <h1 className="mt-0.5 text-base font-bold text-slate-900">조직/유전자</h1>
        </div>
        <p className="text-right text-[10px] text-slate-500">병리과 확정 결과와 병리 AI 후보 및 원본 병리 근거를 확인합니다.</p>
      </header>

      <div className="grid min-h-0 flex-1 gap-2 bg-slate-100/70 p-2 xl:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]">
        <div className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {caseId && apiBaseUrl && authorizedFetch ? (
            <CaseWsiEvidence caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} stain="HE" />
          ) : (
            <EvidenceViewerPanel />
          )}
        </div>

        <aside className="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 [scrollbar-gutter:stable]" aria-label="병리 검사 결과 rail">
          <ResultReviewPanel
            stage="PATHOLOGY_GENE"
            clinicalResult={pathologyClinicalResult ?? geneClinicalResult}
            aiResult={pathologyAiResult ?? geneAiResult}
            clinicalError={clinicalError}
            aiError={aiError}
            clinicalRetrying={clinicalRetrying}
            aiRetrying={aiRetrying}
            onRetryClinical={onRetryClinical}
            onRetryAi={onRetryAi}
            showEvidence={false}
            showWorkspaceHeader={false}
            compactRail
            lastSyncedAt={lastSyncedAt}
            syncingResults={syncingResults}
            onRefreshResults={onRefreshResults}
            syncNotice={syncNotice}
          />
        </aside>
      </div>
    </section>
  );
}
