import { staffAuthenticatedFetch } from "@/lib/api";
import type { PathologyAiAnalysis, WholeSlideImage } from "./pathology-api";

export type PathologyWorkflowStatus =
  | "CANCELLED" | "SCHEDULED" | "SPECIMEN_COMPLETED" | "IMAGE_PENDING"
  | "AI_READY" | "AI_RUNNING" | "AI_COMPLETED" | "REVIEW_PENDING" | "REVIEW_COMPLETED";

export type PathologyWorkstationItem = {
  id: string;
  case_id: string;
  patient: { id: string; name: string; patient_code: string; birth_date: string; sex: string };
  case: { id: string; case_code: string; current_stage: string; case_status: string };
  specimen: { id: string; specimen_code: string; specimen_type: string; body_site: string | null; status: string } | null;
  pathology_test_type: "SUBTYPE" | "PDL1" | "GENE" | null;
  pathology_test_type_label: string | null;
  current_exam_or_task: string;
  task_type: string;
  status: string;
  priority: string;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  requesting_doctor: { id: string; name: string } | null;
  wsi_count: number;
  latest_wsi: WholeSlideImage | null;
  latest_ai_analysis: PathologyAiAnalysis | null;
  latest_gene_analysis: PathologyAiAnalysis | null;
  diagnostic_review_status: string | null;
  diagnostic_review: {
    id: string;
    status: string;
    assigned_to_id: string | null;
    completed_at: string | null;
  } | null;
  clinical_result: unknown | null;
  examination_order: {
    id: string;
    status: string;
    priority: string;
    pathology_test_type: "SUBTYPE" | "PDL1" | "GENE" | null;
    pathology_test_type_label: string | null;
    created_at: string;
  } | null;
  workflow_status: PathologyWorkflowStatus;
  workflow_status_label: string;
};

export type PathologyCaseWorkflow = {
  case: PathologyWorkstationItem["case"];
  patient: PathologyWorkstationItem["patient"];
  orders: PathologyWorkstationItem[];
};

export type PathologyWorkstationPage = {
  count: number;
  next: string | null;
  previous: string | null;
  results: PathologyWorkstationItem[];
};

export type PathologyReviewSubmission = {
  review_work_item_id: string;
  case_id: string;
  status: string;
  task_type: string;
  submitted: boolean;
};

type PathologyWorkstationParams = {
  page: number;
  workflowStatus?: string;
  pathologyTestType?: string;
  assignedTo?: string;
  signal?: AbortSignal;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

function url(path: string) {
  if (!apiBaseUrl) throw new Error("API 서버 환경 설정을 확인해 주세요.");
  return `${apiBaseUrl}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    let message = `병리 API 요청에 실패했습니다. (${response.status})`;
    if (data && typeof data === "object") {
      if ("detail" in data && typeof data.detail === "string") {
        message = data.detail;
      } else {
        const firstError = Object.values(data)[0];
        if (Array.isArray(firstError) && typeof firstError[0] === "string") {
          message = firstError[0];
        } else if (typeof firstError === "string") {
          message = firstError;
        }
      }
    }
    throw new Error(message);
  }
  return response.json();
}

export async function fetchPathologyWorkstation({
  page,
  workflowStatus,
  pathologyTestType,
  assignedTo,
  signal,
}: PathologyWorkstationParams) {
  const params = new URLSearchParams({ page: String(page) });
  if (workflowStatus) params.set("workflow_status", workflowStatus);
  if (pathologyTestType) params.set("pathology_test_type", pathologyTestType);
  if (assignedTo) params.set("assigned_to", assignedTo);
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/workstation/?${params.toString()}`),
    { signal },
  );
  return readJson<PathologyWorkstationPage>(response);
}

export async function fetchPathologyCaseWorkflow(
  caseId: string,
  signal?: AbortSignal,
) {
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/cases/${encodeURIComponent(caseId)}/workflow/`),
    { signal },
  );
  return readJson<PathologyCaseWorkflow>(response);
}

export async function runPdl1Analysis(caseId: string, featureFile: File, wsiId?: string) {
  const body = new FormData();
  body.set("feature_file", featureFile);
  if (wsiId) body.set("wsi_id", wsiId);
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/cases/${encodeURIComponent(caseId)}/pdl1-results/run/`),
    { method: "POST", body },
  );
  return readJson<PathologyAiAnalysis>(response);
}

export async function submitPathologyForReview(
  caseId: string,
  workItemId: string,
  aiAnalysisId: string,
) {
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/cases/${encodeURIComponent(caseId)}/submit-for-review/`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        work_item_id: workItemId,
        ai_analysis_id: aiAnalysisId,
      }),
    },
  );
  return readJson<PathologyReviewSubmission>(response);
}
