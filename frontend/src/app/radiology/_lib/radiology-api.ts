export type RadiologyCaseStage =
  | "XRAY"
  | "CT"
  | "PATHOLOGY"
  | "STAGING"
  | "GENE"
  | "TREATMENT"
  | "PRESCRIPTION";

export type RadiologyWorklistFilters = {
  exam_type?: "XRAY" | "CT";
  status?: "ORDERED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
  priority?: "NORMAL" | "URGENT";
};

export type RadiologyImageAsset = {
  id: string;
  image_type: string;
  storage_type: string;
  status: string;
  status_label: string;
  acquired_at: string | null;
  created_at: string;
};

export type RadiologyAiAnalysis = {
  id: string;
  analysis_type: string;
  status: string;
  status_label: string;
  model_name: string;
  model_version: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
};

export type RadiologyWorkflowStatus =
  | "CANCELLED"
  | "REVIEW_COMPLETED"
  | "REVIEW_PENDING"
  | "AI_FAILED"
  | "AI_RUNNING"
  | "AI_READY"
  | "IMAGE_PENDING"
  | "EXAM_PENDING";

export type RadiologyWorklistItem = {
  patient: {
    id: string;
    patient_code: string;
    name: string;
    birth_date: string;
    sex: string;
  };
  case: {
    id: string;
    case_code: string;
    current_stage: RadiologyCaseStage;
    case_status: string;
  };
  examination_order: {
    id: string;
    exam_type: "XRAY" | "CT";
    exam_type_label: string;
    priority: "NORMAL" | "URGENT";
    priority_label: string;
    status: "ORDERED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
    status_label: string;
    purpose: string;
    clinical_note: string | null;
    created_at: string;
    updated_at: string;
  };
  requesting_doctor: {
    id: string;
    name: string;
  };
  scheduled_at: string | null;
  image_asset_count: number;
  latest_image_asset: RadiologyImageAsset | null;
  latest_ai_analysis: RadiologyAiAnalysis | null;
  workflow_status: RadiologyWorkflowStatus;
  workflow_status_label: string;
};

export class RadiologyApiError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "RadiologyApiError";
    this.status = status;
  }
}

function getApiBaseUrl() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!apiBaseUrl) {
    throw new RadiologyApiError("API 서버 환경 설정을 확인해 주세요.");
  }
  return apiBaseUrl.replace(/\/$/, "");
}

function getErrorMessage(data: unknown) {
  if (!data || typeof data !== "object") return null;

  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) {
      const message = value.find(
        (item): item is string => typeof item === "string" && Boolean(item.trim()),
      );
      if (message) return message;
    }
  }
  return null;
}

export async function fetchRadiologyWorklist(
  accessToken: string,
  filters: RadiologyWorklistFilters,
  signal: AbortSignal,
): Promise<RadiologyWorklistItem[]> {
  const query = new URLSearchParams();
  if (filters.exam_type) query.set("exam_type", filters.exam_type);
  if (filters.status) query.set("status", filters.status);
  if (filters.priority) query.set("priority", filters.priority);

  const queryString = query.toString();
  const response = await fetch(
    `${getApiBaseUrl()}/api/radiology/worklist/${queryString ? `?${queryString}` : ""}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    },
  );

  if (!response.ok) {
    const errorData: unknown = await response.json().catch(() => null);
    throw new RadiologyApiError(
      getErrorMessage(errorData) ?? "Worklist를 불러오지 못했습니다.",
      response.status,
    );
  }

  return response.json();
}
