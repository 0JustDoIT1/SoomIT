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
    <section aria-label="조직/유전자 작업공간" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"><h1 className="sr-only">조직/유전자</h1>
      <div className="grid min-h-0 flex-1 gap-2 bg-slate-50 p-1 grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]">
        <div className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {caseId && apiBaseUrl && authorizedFetch ? (
            <CaseWsiEvidence caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} stain="HE" fillHeight />
          ) : (
            <EvidenceViewerPanel />
          )}
        </div>

        <aside data-clinical-rail className="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 [scrollbar-gutter:stable]" aria-label="병리 검사 결과 rail">
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
