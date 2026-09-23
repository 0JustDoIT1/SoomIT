import { CaseWsiEvidence } from "./case-wsi-evidence";
import { Pdl1ResultPanel as Pdl1ResultRail } from "./pdl1-result-panel";
import { ResultSyncStatus } from "./result-review-panel";

type Pdl1AiResult = {
  status?: string;
  status_label?: string;
  model_name?: string;
  model_version_name?: string;
  completed_at?: string | null;
  result_detail: {
    pdl1: {
      predicted_tps_range_label?: string;
      confidence?: string | number;
      probabilities?: { class_0?: number | string; class_1?: number | string; class_2?: number | string };
    };
  };
};

type Pdl1ClinicalResult = {
  result_status?: string;
  result_date: string | null;
  result_detail: { pdl1?: { tps_percent: number | string | null; interpretation: string | null; note: string | null } };
};

export function Pdl1ResultPanel({
  aiResult,
  clinicalResult,
  aiError = "",
  retrying = false,
  onRetry,
  caseId,
  apiBaseUrl,
  authorizedFetch,
  lastSyncedAt,
  syncingResults = false,
  onRefreshResults,
  syncNotice = "",
}: {
  aiResult: Pdl1AiResult | null;
  clinicalResult?: Pdl1ClinicalResult;
  aiError?: string;
  retrying?: boolean;
  onRetry?: () => void;
  caseId?: string;
  apiBaseUrl?: string;
  authorizedFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  lastSyncedAt?: Date | null;
  syncingResults?: boolean;
  onRefreshResults?: () => void;
  syncNotice?: string;
}) {
  return (
    <section aria-label="PD-L1 작업공간" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white"><h1 className="sr-only">PD-L1</h1>
      <div className="grid min-h-0 flex-1 gap-2 bg-slate-50 p-1 grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]">
        <div className="min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {caseId && apiBaseUrl && authorizedFetch ? (
            <CaseWsiEvidence caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} stain="PDL1" fillHeight />
          ) : null}
        </div>

        <aside data-clinical-rail className="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 [scrollbar-gutter:stable]" aria-label="PD-L1 검사 결과 rail">
          <Pdl1ResultRail aiResult={aiResult} clinicalResult={clinicalResult} aiError={aiError} retrying={retrying} onRetry={onRetry} showSourceHeader={false} />
          {(onRefreshResults || lastSyncedAt) && <div className="mt-2"><ResultSyncStatus lastSyncedAt={lastSyncedAt} syncing={syncingResults} onRefresh={onRefreshResults} notice={syncNotice} /></div>}
        </aside>
      </div>
    </section>
  );
}
