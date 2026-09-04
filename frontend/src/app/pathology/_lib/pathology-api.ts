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

export const WORK_ITEMS_API_URL =
  "http://127.0.0.1:8000/api/pathology/work-items/";

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
