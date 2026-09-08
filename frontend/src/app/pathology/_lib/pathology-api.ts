export type WorkItem = {
  id: string;
  case_id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  specimen_id: string | null;
  specimen_code: string | null;
  wsi_id: string | null;
  slide_code: string | null;
  task_type: string;
  status: string;
  priority: string;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PathologyCase = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  current_stage: string;
  case_status: string;
  created_at: string;
  updated_at: string;
};

export type PathologySpecimen = {
  id: string;
  case_id: string;
  case_code: string;
  patient_id: string;
  patient_code: string;
  patient_name: string;
  examination_order_id: string | null;
  specimen_code: string;
  specimen_type: string;
  body_site: string | null;
  collected_at: string | null;
  received_at: string | null;
  status: string;
  wsi_count: number;
  created_at: string;
  updated_at: string;
};

export type WholeSlideImage = {
  id: string;
  specimen_id: string;
  image_asset_id: string;
  slide_code: string;
  block_code: string | null;
  version: number;
  stain: string;
  original_filename: string;
  sha256: string;
  mpp: string | number | null;
  is_current: boolean;
  storage_uri: string;
  file_format: string;
  image_status: string;
  invalidated_at: string | null;
  invalidation_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PathologyAiResultDetail = {
  schema_version: string;
  result_payload: unknown;
  result_files: unknown[];
  pathology?: {
    malignancy_assessment: string;
    malignancy_assessment_label: string;
    malignancy_probability: string | number | null;
    predicted_histologic_type: string | null;
    predicted_subtype: string | null;
    subtype_confidence: string | number | null;
  };
  specimen_adequacy?: {
    adequacy_status: string;
    adequacy_status_label: string;
    tumor_cell_ratio: string | number | null;
    confidence: string | number | null;
  };
};

export type PathologyAiAnalysis = {
  id: string;
  case_id: string;
  source_image_asset_id: string | null;
  analysis_type: string;
  analysis_type_label: string;
  status: string;
  status_label: string;
  model_name: string;
  model_version_name: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  result_detail: PathologyAiResultDetail | null;
  created_at: string;
};

export type PathologyDiagnosis = {
  id: string;
  case_id: string;
  source_image_asset_id: string | null;
  reviewed_ai_result_id: string | null;
  result_status: string;
  result_status_label: string;
  confirmed_by_user_id: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  pathology: {
    malignancy_status: string;
    malignancy_status_label: string;
    histologic_type: string | null;
    subtype: string | null;
    diagnosis_summary: string | null;
  } | null;
  created_at: string;
  updated_at: string;
};

export type PathologyReport = {
  id: string;
  case_id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  source_image_asset_id: string | null;
  reviewed_ai_result_id: string | null;
  confirmed_by_user_id: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  specimen: {
    id: string;
    specimen_code: string;
    specimen_type: string;
    body_site: string | null;
  } | null;
  wsi: {
    id: string;
    slide_code: string;
    stain: string;
    original_filename: string;
  } | null;
  diagnosis: {
    malignancy_status: string;
    malignancy_status_label: string;
    histologic_type: string | null;
    subtype: string | null;
    diagnosis_summary: string | null;
  };
  created_at: string;
  updated_at: string;
};

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

export const WORK_ITEMS_API_URL = `${API_BASE_URL}/api/pathology/work-items/`;
export const CASES_API_URL = `${API_BASE_URL}/api/cases/`;

export function workItemDetailApiUrl(itemId: string) {
  return `${WORK_ITEMS_API_URL}${encodeURIComponent(itemId)}/`;
}

export function caseSpecimensApiUrl(caseId: string) {
  return `${API_BASE_URL}/api/pathology/cases/${encodeURIComponent(caseId)}/specimens/`;
}

export function specimenSlidesApiUrl(specimenId: string) {
  return `${API_BASE_URL}/api/pathology/specimens/${encodeURIComponent(specimenId)}/wsis/`;
}

export function casePathologyAiResultsApiUrl(caseId: string) {
  return `${API_BASE_URL}/api/pathology/cases/${encodeURIComponent(caseId)}/ai-results/`;
}

export function caseAdequacyAiResultsApiUrl(caseId: string) {
  return `${API_BASE_URL}/api/pathology/cases/${encodeURIComponent(caseId)}/adequacy-results/`;
}

export function casePathologyDiagnosesApiUrl(caseId: string) {
  return `${API_BASE_URL}/api/pathology/cases/${encodeURIComponent(caseId)}/diagnoses/`;
}

export function pathologyDiagnosisApiUrl(diagnosisId: string) {
  return `${API_BASE_URL}/api/pathology/diagnoses/${encodeURIComponent(diagnosisId)}/`;
}

export function pathologyDiagnosisConfirmApiUrl(diagnosisId: string) {
  return `${pathologyDiagnosisApiUrl(diagnosisId)}confirm/`;
}

export function casePathologyReportsApiUrl(caseId: string) {
  return `${API_BASE_URL}/api/pathology/cases/${encodeURIComponent(caseId)}/reports/`;
}

export const statusLabel: Record<string, string> = {
  PENDING: "대기",
  IN_PROGRESS: "진행 중",
  BLOCKED: "차단",
  COMPLETED: "완료",
  CANCELLED: "취소",
  FAILED: "실패",
};

export const taskLabel: Record<string, string> = {
  WSI_UPLOAD: "WSI 등록",
  QUALITY_CHECK: "WSI 품질검증",
  ADEQUACY_ANALYSIS: "적정성 AI 분석",
  ADEQUACY_REVIEW: "적정성 전문의 판정",
  PATHOLOGY_ANALYSIS: "병리 AI 분석",
  DIAGNOSTIC_REVIEW: "병리 판독",
  REPORT_REVIEW: "병리 보고서 검토",
  AI_ANALYSIS: "AI 분석",
  PATHOLOGIC_REVIEW: "병리 판독",
  PATHOLOGY_REVIEW: "병리 판독",
  PD_L1_REVIEW: "PD-L1 검토",
};

export function statusStyle(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700";
    case "IN_PROGRESS":
      return "bg-blue-50 text-blue-700";
    case "BLOCKED":
    case "FAILED":
      return "bg-red-50 text-red-700";
    case "CANCELLED":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

export async function readWorkItems(response: Response): Promise<WorkItem[]> {
  if (response.status === 401 || response.status === 403) {
    throw new Error("인증에 실패했습니다. 계정 정보를 확인해 주세요.");
  }

  if (!response.ok) {
    throw new Error(`API 요청 실패 (${response.status})`);
  }

  const data: unknown = await response.json();

  if (Array.isArray(data)) {
    return data as WorkItem[];
  }

  if (
    data &&
    typeof data === "object" &&
    "results" in data &&
    Array.isArray(data.results)
  ) {
    return data.results as WorkItem[];
  }

  return [];
}

export async function readWorkItem(response: Response): Promise<WorkItem> {
  if (response.status === 401 || response.status === 403) {
    throw new Error("인증에 실패했습니다. 계정 정보를 확인해 주세요.");
  }

  if (response.status === 404) {
    throw new Error("해당 병리 작업을 찾을 수 없습니다.");
  }

  if (!response.ok) {
    throw new Error(`API 요청 실패 (${response.status})`);
  }

  return (await response.json()) as WorkItem;
}

async function readCollection<T>(response: Response): Promise<T[]> {
  if (response.status === 401 || response.status === 403) {
    throw new Error("인증에 실패했습니다. 계정 정보를 확인해 주세요.");
  }

  if (!response.ok) {
    throw new Error(`API 요청 실패 (${response.status})`);
  }

  const data: unknown = await response.json();

  if (Array.isArray(data)) return data as T[];

  if (
    data &&
    typeof data === "object" &&
    "results" in data &&
    Array.isArray(data.results)
  ) {
    return data.results as T[];
  }

  return [];
}

export function readCases(response: Response) {
  return readCollection<PathologyCase>(response);
}

export function readSpecimens(response: Response) {
  return readCollection<PathologySpecimen>(response);
}

export function readSlides(response: Response) {
  return readCollection<WholeSlideImage>(response);
}

export function readPathologyAiAnalyses(response: Response) {
  return readCollection<PathologyAiAnalysis>(response);
}

export function readPathologyDiagnoses(response: Response) {
  return readCollection<PathologyDiagnosis>(response);
}

export async function readPathologyDiagnosis(response: Response) {
  return (await response.json()) as PathologyDiagnosis;
}

export function readPathologyReports(response: Response) {
  return readCollection<PathologyReport>(response);
}
