import { staffAuthenticatedFetch } from "@/lib/api";

export type RadiologyCaseStage =
  | "XRAY"
  | "CT"
  | "PATHOLOGY"
  | "PET_CT_TNM"
  | "GENE"
  | "TREATMENT"
  | "PRESCRIPTION";

export type RadiologyWorklistFilters = {
  order_type?: "XRAY" | "CT" | "PET_CT_TNM";
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
  | "AI_COMPLETED"
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
    order_type: "XRAY" | "CT" | "PET_CT_TNM";
    order_type_label: string;
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
  responsible_doctor: {
    id: string;
    name: string;
  } | null;
  scheduled_at: string | null;
  image_asset_count: number;
  latest_image_asset: RadiologyImageAsset | null;
  latest_ai_analysis: RadiologyAiAnalysis | null;
  workflow_status: RadiologyWorkflowStatus;
  workflow_status_label: string;
};

export type RadiologyCaseWorklistItem = {
  patient: RadiologyWorklistItem["patient"];
  case: RadiologyWorklistItem["case"];
  responsible_doctor: RadiologyWorklistItem["responsible_doctor"];
  exam_count: number;
  current_exam: RadiologyWorklistItem;
  workflow_status: RadiologyWorkflowStatus;
  workflow_status_label: string;
};

export type RadiologyWorkflowExam = RadiologyWorklistItem & {
  ai_result: RadiologyAnalysisResult["result"] | null;
  review: {
    id: string;
    status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
    assigned_doctor: { id: string; name: string };
    submitted_at: string;
  } | null;
};

export type RadiologyCaseWorkflow = {
  case: RadiologyWorklistItem["case"];
  patient: RadiologyWorklistItem["patient"];
  responsible_doctor: RadiologyWorklistItem["responsible_doctor"];
  exams: RadiologyWorkflowExam[];
};

export type RadiologyCompletedExam = RadiologyWorkflowExam & {
  completed_at: string | null;
};

export type RadiologyCompletedExamHistory = {
  patient: RadiologyWorklistItem["patient"];
  case: RadiologyWorklistItem["case"];
  responsible_doctor: RadiologyWorklistItem["responsible_doctor"];
  completed_exams: RadiologyCompletedExam[];
};

export type RadiologyAnalysisDetail = {
  analysis_id: string;
  case_id: string;
  order_id: string | null;
  analysis_type: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  model_version: {
    id: string;
    model_name: string;
    version: string;
  };
  source_image_asset: {
    id: string;
    image_type: string;
    workflow_stage: string;
    storage_type: string;
    status: string;
  } | null;
  created_at: string;
};

export type RadiologyVisualizationLayer = {
  id: string;
  name: string;
  category: "NODULE" | "LUNG_LOBE" | "ANATOMY";
  color: string;
  default_visible: boolean;
  default_opacity: number;
  supported_render_modes: Array<"surface" | "wireframe">;
  vertex_count: number;
  face_count: number;
  size_bytes: number;
  mesh_url: string;
};

export type RadiologyVisualization = {
  schema_version: string;
  case_id: string;
  coordinate_system: string;
  source_geometry: string;
  layers: RadiologyVisualizationLayer[];
};

export type RadiologyTnmPayload = {
  t?: {
    t_candidate?: string | null;
    size_only_t_candidate?: string | null;
    tumor_volume_ml?: number | string | null;
    mask_bbox_diagonal_mm?: number | string | null;
    component_count?: number | null;
    t_candidate_status?: string | null;
    physician_review_required?: boolean | null;
    [key: string]: unknown;
  };
  phase2?: Record<string, unknown>;
  n?: {
    nplus_probability?: number | string | null;
    risk_tier?: string | null;
    review_threshold?: number | string | null;
    elevated_threshold?: number | string | null;
    may_assign_cn?: boolean | null;
    categorical_ood_warning?: boolean | null;
    physician_review_required?: boolean | null;
    [key: string]: unknown;
  };
  m?: {
    m_candidate?: string | null;
    model_support?: {
      m_positive_probability?: number | string | null;
      review_threshold?: number | string | null;
      model_review_positive?: boolean | null;
      [key: string]: unknown;
    } | null;
    m_rule_result?: {
      m_candidate?: string | null;
      stage_group_if_m_positive?: string | null;
      evidence?: Record<string, unknown> | null;
      [key: string]: unknown;
    } | null;
    imaging_evidence?: Record<string, unknown> | null;
    [key: string]: unknown;
  };
};

export type RadiologyAnalysisResult = {
  analysis_id: string;
  analysis_type: "XRAY_ANALYSIS" | "CT_ANALYSIS" | "PET_CT_TNM_ANALYSIS";
  result:
    | {
        assessment: string;
        assessment_label: string;
        suspicion_score: string | null;
        image: { width: number | null; height: number | null };
        classification: {
          prediction: string | null;
          assessment: string | null;
          suspicion_score: number | string | null;
          probabilities: Record<string, number | string> | null;
        };
        detections: Array<{
          class_id: number | null;
          class_name: string | null;
          score: number | string | null;
          bbox_xyxy: [number, number, number, number] | null;
        }>;
        model_revision: string | null;
      }
    | {
        overall_malignancy_risk: string | null;
        nodules: Array<{
          nodule_no: number;
          detection_confidence: string | null;
          malignancy_risk: string | null;
          finding_payload: unknown;
        }>;
        visualization: RadiologyVisualization | null;
      }
      | {
        predicted_t: string | null;
        predicted_n: string | null;
        predicted_m: string | null;
        predicted_stage_group: string | null;
        confidence: string | null;
        result_payload?: RadiologyTnmPayload;
      };
};

export type RadiologyReviewSubmission = {
  submitted: boolean;
  review_id: string;
  case_id: string;
  examination_order_id: string;
  analysis_id: string;
  assigned_doctor: { id: string; name: string };
  review_status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  submitted_at: string;
};

export type RadiologyImageRegistration = {
  storage_type: "ORTHANC" | "GCS";
  storage_uri: string;
  file_format: string;
  acquired_at?: string | null;
  metadata?: unknown;
};

export type RadiologyRegisteredImage = RadiologyImageRegistration & {
  id: string;
  status: string;
  image_type: string;
  workflow_stage: string;
  created_at: string;
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
  filters: RadiologyWorklistFilters,
  signal: AbortSignal,
): Promise<RadiologyWorklistItem[]> {
  const query = new URLSearchParams();
  if (filters.order_type) query.set("order_type", filters.order_type);
  if (filters.status) query.set("status", filters.status);
  if (filters.priority) query.set("priority", filters.priority);

  const queryString = query.toString();
  const response = await staffAuthenticatedFetch(
    `${getApiBaseUrl()}/api/radiology/worklist/${queryString ? `?${queryString}` : ""}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
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

export async function fetchRadiologyCaseWorklist(
  filters: RadiologyWorklistFilters,
  signal: AbortSignal,
): Promise<RadiologyCaseWorklistItem[]> {
  const query = new URLSearchParams();
  if (filters.order_type) query.set("order_type", filters.order_type);
  if (filters.status) query.set("status", filters.status);
  if (filters.priority) query.set("priority", filters.priority);
  const queryString = query.toString();
  return radiologyRequest<RadiologyCaseWorklistItem[]>(
    `/api/radiology/cases/${queryString ? `?${queryString}` : ""}`,
    { method: "GET", signal },
  );
}

export function fetchRadiologyCaseWorkflow(caseId: string, signal?: AbortSignal) {
  return radiologyRequest<RadiologyCaseWorkflow>(
    `/api/radiology/cases/${caseId}/workflow/`,
    { method: "GET", signal },
  );
}

export function fetchRadiologyCompletedExams(signal?: AbortSignal) {
  return radiologyRequest<RadiologyCompletedExamHistory[]>(
    "/api/radiology/completed-exams/",
    { method: "GET", signal },
  );
}

async function radiologyRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await staffAuthenticatedFetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const errorData: unknown = await response.json().catch(() => null);
    throw new RadiologyApiError(
      getErrorMessage(errorData) ?? "영상의학과 요청을 처리하지 못했습니다.",
      response.status,
    );
  }
  return response.json();
}

export async function uploadRadiologyXrayImage(orderId: string, image: File) {
  const formData = new FormData();
  formData.set("image", image);
  const response = await staffAuthenticatedFetch(
    `${getApiBaseUrl()}/api/radiology/orders/${orderId}/images/upload/`,
    { method: "POST", headers: { Accept: "application/json" }, body: formData },
  );
  if (!response.ok) {
    const errorData: unknown = await response.json().catch(() => null);
    throw new RadiologyApiError(
      getErrorMessage(errorData) ?? "X-ray 영상을 업로드하지 못했습니다.",
      response.status,
    );
  }
  return response.json() as Promise<RadiologyRegisteredImage>;
}

export async function uploadRadiologyCtSeries(
  orderId: string,
  files: File[],
  seriesInstanceUid: string,
) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.set("series_instance_uid", seriesInstanceUid);
  const response = await staffAuthenticatedFetch(
    `${getApiBaseUrl()}/api/radiology/orders/${orderId}/images/ct-series/upload/`,
    { method: "POST", headers: { Accept: "application/json" }, body: formData },
  );
  if (!response.ok) {
    const errorData: unknown = await response.json().catch(() => null);
    throw new RadiologyApiError(
      getErrorMessage(errorData) ?? "CT Series를 업로드하지 못했습니다.",
      response.status,
    );
  }
  return response.json() as Promise<RadiologyRegisteredImage>;
}

export async function uploadRadiologyPetSeries(
  orderId: string,
  files: File[],
  seriesInstanceUid: string,
) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.set("series_instance_uid", seriesInstanceUid);
  const response = await staffAuthenticatedFetch(
    `${getApiBaseUrl()}/api/radiology/orders/${orderId}/images/pet-series/upload/`,
    { method: "POST", headers: { Accept: "application/json" }, body: formData },
  );
  if (!response.ok) {
    const errorData: unknown = await response.json().catch(() => null);
    throw new RadiologyApiError(getErrorMessage(errorData) ?? "PET Series 업로드에 실패했습니다.", response.status);
  }
  return response.json() as Promise<RadiologyRegisteredImage>;
}

export async function fetchRadiologyXrayImage(orderId: string, assetId: string, signal?: AbortSignal) {
  const response = await staffAuthenticatedFetch(
    `${getApiBaseUrl()}/api/radiology/orders/${orderId}/images/${assetId}/content/`,
    { method: "GET", headers: { Accept: "image/png,image/jpeg" }, signal },
  );
  if (!response.ok) {
    throw new RadiologyApiError("X-ray 영상을 불러오지 못했습니다.", response.status);
  }
  return response.blob();
}

export function registerRadiologyImage(
  orderId: string,
  data: RadiologyImageRegistration,
  signal?: AbortSignal,
) {
  return radiologyRequest<RadiologyRegisteredImage>(
    `/api/radiology/orders/${orderId}/images/`,
    { method: "POST", body: JSON.stringify(data), signal },
  );
}

export function startRadiologyAnalysis(orderId: string, signal?: AbortSignal) {
  return radiologyRequest<RadiologyAnalysisDetail>(
    `/api/radiology/orders/${orderId}/analyses/`,
    { method: "POST", body: JSON.stringify({}), signal },
  );
}

export function fetchRadiologyAnalysis(analysisId: string, signal?: AbortSignal) {
  return radiologyRequest<RadiologyAnalysisDetail>(
    `/api/radiology/analyses/${analysisId}/`,
    { method: "GET", signal },
  );
}

export function fetchRadiologyAnalysisResult(analysisId: string, signal?: AbortSignal) {
  return radiologyRequest<RadiologyAnalysisResult>(
    `/api/radiology/analyses/${analysisId}/result/`,
    { method: "GET", signal },
  );
}

export async function fetchRadiologyVisualizationLayer(
  analysisId: string,
  layerId: string,
  signal?: AbortSignal,
) {
  const response = await staffAuthenticatedFetch(
    `${getApiBaseUrl()}/api/radiology/analyses/${analysisId}/visualization/${layerId}/`,
    { method: "GET", headers: { Accept: "*/*" }, signal },
  );
  if (!response.ok) {
    throw new RadiologyApiError("CT 3D 레이어를 불러오지 못했습니다.", response.status);
  }
  return response.arrayBuffer();
}

export type RadiologyCornerstoneSegment = {
  segment_index: number;
  id: string;
  name: string;
  category: "NODULE" | "LUNG_LOBE" | "ANATOMY";
  color: [number, number, number];
  default_visible?: boolean;
  default_opacity?: number;
};

export type RadiologyCornerstoneSegmentationMetadata = {
  schema_version: string;
  scalar_type: "uint8" | "uint16";
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  direction: number[];
  segments: RadiologyCornerstoneSegment[];
  labelmap_url: string;
};

export function fetchRadiologyCornerstoneSegmentationMetadata(analysisId: string, signal?: AbortSignal) {
  return radiologyRequest<RadiologyCornerstoneSegmentationMetadata>(
    `/api/radiology/analyses/${analysisId}/cornerstone-segmentation/`,
    { method: "GET", signal },
  );
}

export async function fetchRadiologyCornerstoneLabelmap(analysisId: string, signal?: AbortSignal) {
  const response = await staffAuthenticatedFetch(
    `${getApiBaseUrl()}/api/radiology/analyses/${analysisId}/cornerstone-segmentation/labelmap/`,
    { method: "GET", headers: { Accept: "*/*" }, signal },
  );
  if (!response.ok) {
    throw new RadiologyApiError("CT labelmap을 불러오지 못했습니다.", response.status);
  }
  return response.arrayBuffer();
}

export function ctDicomWebMetadataUrl(orderId: string, assetId: string) {
  return `${getApiBaseUrl()}/api/radiology/orders/${orderId}/images/${assetId}/dicom-web/metadata/`;
}

export function ctDicomWebInstancesUrl(orderId: string, assetId: string) {
  return `${getApiBaseUrl()}/api/radiology/orders/${orderId}/images/${assetId}/dicom-web/instances/`;
}

export function ctDicomWebInstanceUrl(orderId: string, assetId: string, sopInstanceUid: string) {
  return `${getApiBaseUrl()}/api/radiology/orders/${orderId}/images/${assetId}/dicom-web/instances/${sopInstanceUid}/`;
}

export function ctDicomWebFrameUrl(
  orderId: string,
  assetId: string,
  sopInstanceUid: string,
  frameNumber = 1,
) {
  return `${getApiBaseUrl()}/api/radiology/orders/${orderId}/images/${assetId}/dicom-web/instances/${sopInstanceUid}/frames/${frameNumber}/`;
}

export async function fetchCtDicomWebJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await staffAuthenticatedFetch(url, {
    method: "GET",
    headers: { Accept: "application/dicom+json" },
    signal,
  });
  if (!response.ok) {
    throw new RadiologyApiError("CT DICOMweb 데이터를 불러오지 못했습니다.", response.status);
  }
  return response.json();
}

export async function fetchCtDicomWebInstance(
  orderId: string,
  assetId: string,
  sopInstanceUid: string,
  signal?: AbortSignal,
) {
  const response = await staffAuthenticatedFetch(ctDicomWebInstanceUrl(orderId, assetId, sopInstanceUid), {
    method: "GET",
    headers: { Accept: "application/dicom" },
    signal,
  });
  if (!response.ok) {
    throw new RadiologyApiError("CT instance를 불러오지 못했습니다.", response.status);
  }
  return response.arrayBuffer();
}

export function submitRadiologyAnalysisForReview(analysisId: string, signal?: AbortSignal) {
  return radiologyRequest<RadiologyReviewSubmission>(
    `/api/radiology/analyses/${analysisId}/submit-for-review/`,
    { method: "POST", body: JSON.stringify({}), signal },
  );
}
