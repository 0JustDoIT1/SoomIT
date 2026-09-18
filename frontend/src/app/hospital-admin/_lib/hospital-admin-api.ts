import type { HospitalAdminUser } from "./hospital-admin-session";

export type DepartmentRole = { id: string; role: string; display_name: string };
export type Department = { id: string; code: string; name: string; roles: DepartmentRole[] };
export type Staff = {
  id: string; login_id: string; name: string; account_status: string;
  department: { id: string; code: string; name: string };
  role: string; role_display_name: string; license_number: string | null;
};
export type StaffCreateRequest = { login_id: string; name: string; password: string; department_role_id: string; license_number?: string };
export type HospitalAdminLoginResponse = { access: string; refresh: string; user: HospitalAdminUser };

export type MonitoringKpi = {
  ai_queued: number;
  ai_running: number;
  ai_succeeded_today: number;
  ai_failed_today: number;
  exams_today: number;
  active_staff: number;
};
export type AiRequestRow = {
  id: string;
  case_code: string;
  patient_name: string;
  analysis_type: string;
  analysis_type_display: string;
  requested_at: string;
  status: string;
  wait_seconds: number | null;
  duration_seconds: number | null;
};
export type ExamSummaryRow = {
  order_type: string;
  order_type_display: string;
  ordered: number;
  scheduled: number;
  completed: number;
  cancelled: number;
};
export type FailedRequestRow = {
  id: string;
  case_id: string;
  case_code: string;
  analysis_type: string;
  analysis_type_display: string;
  queued_at: string;
  started_at: string | null;
  failed_at: string;
  elapsed_seconds: number | null;
  error_summary: string;
  error_message: string | null;
  retry_count: string;
  cloud_run_service: string;
  retry_available: boolean;
};
export type ActivityLogRow = {
  id: string;
  actor_name: string;
  action_type: string;
  action_type_display: string;
  target_table: string;
  created_at: string;
};
export type StaffRow = {
  id: string;
  name: string;
  department_name: string;
  role_display_name: string;
  account_status: string;
};
export type StaffOverview = {
  total_staff: number;
  active_staff: number;
  department_count: number;
  last_login_at: string | null;
};
export type IntegrationStatus = { name: string; status: string; detail: string };
export type PerformanceSummary = {
  ai_avg_duration_seconds: number | null;
  ai_avg_wait_seconds: number | null;
  sample_size: number;
  by_type: Array<{ analysis_type: string; analysis_type_display: string; avg_duration_seconds: number | null; sample_size: number }>;
};
export type RecentEvent = { label: string; detail: string; at: string };

export type HospitalMonitoringSnapshot = {
  hospital: { id: string; name: string; code: string };
  kpi: MonitoringKpi;
  ai_queue_summary: Record<string, number>;
  recent_ai_requests: AiRequestRow[];
  exam_summary: ExamSummaryRow[];
  failed_requests: FailedRequestRow[];
  activity_log: ActivityLogRow[];
  staff_overview: StaffOverview;
  staff: StaffRow[];
  integrations: IntegrationStatus[];
  performance: PerformanceSummary;
  recent_events: RecentEvent[];
};

export class HospitalAdminApiError extends Error {
  constructor(message: string, public status: number | null = null) { super(message); this.name = "HospitalAdminApiError"; }
}

function baseUrl() {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!value) throw new HospitalAdminApiError("API 서버 환경 설정을 확인해 주세요.");
  return value.replace(/\/$/, "");
}

function errorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) {
      const message = value.find((item): item is string => typeof item === "string" && Boolean(item.trim()));
      if (message) return message;
    }
  }
  return null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, options);
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    throw new HospitalAdminApiError(errorMessage(data) ?? "요청을 처리하지 못했습니다.", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

const jsonHeaders = (token?: string) => ({ Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
const authHeaders = (token: string) => ({ Accept: "application/json", Authorization: `Bearer ${token}` });

export const loginHospitalAdmin = (username: string, password: string) => request<HospitalAdminLoginResponse>("/api/auth/hospital-admin/login/", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ username, password }) });
export const fetchDepartments = (token: string, signal?: AbortSignal) => request<Department[]>("/api/hospital-admin/departments/", { headers: authHeaders(token), signal });
export const fetchStaff = (token: string, signal?: AbortSignal) => request<Staff[]>("/api/hospital-admin/staff/", { headers: authHeaders(token), signal });
export const createStaff = (token: string, data: StaffCreateRequest) => request<Staff>("/api/hospital-admin/staff/", { method: "POST", headers: jsonHeaders(token), body: JSON.stringify(data) });
export const deleteStaff = (token: string, staffId: string) => request<void>(`/api/hospital-admin/staff/${staffId}/`, { method: "DELETE", headers: authHeaders(token) });
export const fetchHospitalMonitoring = (token: string, signal?: AbortSignal) => request<HospitalMonitoringSnapshot>("/api/hospital-admin/monitoring/", { headers: authHeaders(token), signal });
