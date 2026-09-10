import type { HospitalAdminUser } from "./hospital-admin-session";

export type DepartmentRole = { id: string; role: string; display_name: string };
export type Department = { id: string; code: string; name: string; roles: DepartmentRole[] };
export type Staff = {
  id: string; login_id: string; name: string; account_status: string;
  department: { id: string; code: string; name: string };
  role: string; role_display_name: string;
};
export type StaffCreateRequest = { login_id: string; name: string; password: string; department_role_id: string };
export type HospitalAdminLoginResponse = { access: string; refresh: string; user: HospitalAdminUser };

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
  return response.json();
}

const jsonHeaders = (token?: string) => ({ Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });
const authHeaders = (token: string) => ({ Accept: "application/json", Authorization: `Bearer ${token}` });

export const loginHospitalAdmin = (username: string, password: string) => request<HospitalAdminLoginResponse>("/api/auth/hospital-admin/login/", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ username, password }) });
export const fetchDepartments = (token: string, signal?: AbortSignal) => request<Department[]>("/api/hospital-admin/departments/", { headers: authHeaders(token), signal });
export const fetchStaff = (token: string, signal?: AbortSignal) => request<Staff[]>("/api/hospital-admin/staff/", { headers: authHeaders(token), signal });
export const createStaff = (token: string, data: StaffCreateRequest) => request<Staff>("/api/hospital-admin/staff/", { method: "POST", headers: jsonHeaders(token), body: JSON.stringify(data) });
