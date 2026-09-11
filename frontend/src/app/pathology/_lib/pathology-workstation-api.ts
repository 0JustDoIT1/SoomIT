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
  workflow_status: PathologyWorkflowStatus;
  workflow_status_label: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

function url(path: string) {
  if (!apiBaseUrl) throw new Error("API 서버 환경 설정을 확인해 주세요.");
  return `${apiBaseUrl}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const message = data && typeof data === "object" && "detail" in data && typeof data.detail === "string"
      ? data.detail : `병리 API 요청에 실패했습니다. (${response.status})`;
    throw new Error(message);
  }
  return response.json();
}

export async function fetchPathologyWorkstation(signal?: AbortSignal) {
  const response = await staffAuthenticatedFetch(url("/api/pathology/workstation/"), { signal });
  const data = await readJson<PathologyWorkstationItem[] | { results: PathologyWorkstationItem[] }>(response);
  return Array.isArray(data) ? data : data.results;
}

export async function fetchPathologyAnalyses(caseId: string, kind: "pathology" | "pdl1", signal?: AbortSignal) {
  const suffix = kind === "pathology" ? "ai-results" : "pdl1-results";
  const response = await staffAuthenticatedFetch(url(`/api/pathology/cases/${encodeURIComponent(caseId)}/${suffix}/`), { signal });
  return readJson<PathologyAiAnalysis[]>(response);
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
