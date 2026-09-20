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
  order_type: "PATHOLOGY_GENE" | "PDL1" | null;
  order_type_label: string | null;
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
    order_type: "PATHOLOGY_GENE" | "PDL1" | null;
    order_type_label: string | null;
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

export type PathologyCompletedExam = PathologyWorkstationItem & {
  completed_at: string | null;
};

export type PathologyCompletedExamHistory = {
  patient: PathologyWorkstationItem["patient"];
  case: PathologyWorkstationItem["case"];
  completed_exams: PathologyCompletedExam[];
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

export type PDL1DraftResult = {
  id: string;
  workflow_stage: "PDL1";
  result_status: "DRAFT";
  confirmed_by_user_id: null;
  confirmed_at: null;
  pdl1: { tps_percent: string; interpretation: string; note: string | null; source_wsi_id: string };
};


type PathologyWorkstationParams = {
  page: number;
  workflowStatus?: string;
  orderType?: string;
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
  orderType,
  assignedTo,
  signal,
}: PathologyWorkstationParams) {
  const params = new URLSearchParams({ page: String(page) });
  if (workflowStatus) params.set("workflow_status", workflowStatus);
  if (orderType) params.set("order_type", orderType);
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

export async function fetchPathologyCompletedExams(signal?: AbortSignal) {
  const response = await staffAuthenticatedFetch(
    url("/api/pathology/completed-exams/"),
    { signal },
  );
  return readJson<PathologyCompletedExamHistory[]>(response);
}

export async function fetchPdl1Analyses(caseId: string) {
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/cases/${encodeURIComponent(caseId)}/pdl1-results/`),
  );
  return readJson<PathologyAiAnalysis[]>(response);
}

export async function fetchPathologyGeneAnalyses(caseId: string) {
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/cases/${encodeURIComponent(caseId)}/ai-results/`),
  );
  return readJson<PathologyAiAnalysis[]>(response);
}

export async function fetchPathologyWsiPreview(wsiId: string, signal?: AbortSignal): Promise<Blob | null> {
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/wsis/${encodeURIComponent(wsiId)}/preview/`),
    { signal, headers: { Accept: "image/jpeg,image/png" } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    try {
      await readJson<never>(response);
    } catch (error) {
      if (error instanceof Error && error.message.includes("WSI preview is not available yet.")) {
        return null;
      }
      throw error;
    }
  }
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "image/jpeg" && contentType !== "image/png") {
    throw new Error(`WSI 미리보기 응답 형식이 이미지가 아닙니다. (${contentType ?? "content-type 없음"})`);
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("WSI 미리보기 응답이 비어 있습니다.");
  }
  return blob;
}

export async function fetchPathologyWsiTissueHeatmap(
  wsiId: string,
  signal?: AbortSignal,
): Promise<Blob | null> {
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/wsis/${encodeURIComponent(wsiId)}/tissue-heatmap/`),
    { signal, cache: "no-store", headers: { Accept: "image/jpeg" } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    try {
      await readJson<never>(response);
    } catch (error) {
      if (error instanceof Error && error.message.includes("WSI tissue heatmap is not available yet.")) {
        return null;
      }
      throw error;
    }
  }
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "image/jpeg") {
    throw new Error(`WSI tissue heatmap response is not JPEG (${contentType ?? "missing content-type"})`);
  }
  return response.blob();
}

export async function uploadPdl1Input(
  orderId: string,
  wsiFile: File,
  annotationFile: File,
  roiLayer: "Tumor" | "Tumor-JS",
) {
  const body = new FormData();
  body.set("wsi_file", wsiFile);
  body.set("annotation_file", annotationFile);
  body.set("roi_layer", roiLayer);
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/orders/${encodeURIComponent(orderId)}/pdl1-input/`),
    { method: "POST", body },
  );
  return readJson<{ upload_ready: boolean }>(response);
}

export async function uploadPathologyGeneInput(
  orderId: string,
  wsiFile: File,
) {
  const body = new FormData();
  body.set("wsi_file", wsiFile);
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/orders/${encodeURIComponent(orderId)}/pathology-gene-input/`),
    { method: "POST", body },
  );
  return readJson<{
    wsi_id: string;
    storage_uri: string;
    original_filename: string;
  }>(response);
}

export async function runPathologyGeneAnalysis(caseId: string, wsiId: string) {
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/cases/${encodeURIComponent(caseId)}/ai-results/run/`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wsi_id: wsiId }),
    },
  );
  return readJson<PathologyAiAnalysis>(response);
}

export async function cancelPathologyGeneAnalysis(caseId: string, analysisId: string) {
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/cases/${encodeURIComponent(caseId)}/ai-results/${encodeURIComponent(analysisId)}/cancel/`),
    { method: "POST" },
  );
  return readJson<PathologyAiAnalysis>(response);
}

export async function runPdl1Analysis(caseId: string) {
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/cases/${encodeURIComponent(caseId)}/pdl1-results/run/`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
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

export async function savePdl1Draft(
  caseId: string,
  payload: { ai_analysis_id: string; source_wsi_id: string; tps_percent: string; interpretation: string; note: string },
) {
  const response = await staffAuthenticatedFetch(
    url(`/api/pathology/cases/${encodeURIComponent(caseId)}/pdl1-results/draft/`),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
  );
  return readJson<PDL1DraftResult>(response);
}
