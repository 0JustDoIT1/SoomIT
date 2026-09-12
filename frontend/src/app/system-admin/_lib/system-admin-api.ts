import type { SystemAdminUser } from "./system-admin-session";

export type Hospital = {
  id: string; name: string; code: string; address: string | null;
  address_detail: string | null; postal_code: string | null;
  latitude: string | null; longitude: string | null; phone: string | null;
};
export type DepartmentRole = { id: string; role: string; display_name: string };
export type Department = { id: string; code: string; name: string; roles: DepartmentRole[] };
export type HospitalAdmin = {
  id: string; user_id: string; login_id: string; name: string; account_status: string;
  hospital: Pick<Hospital, "id" | "code" | "name">;
};
export type HospitalDetail = Hospital & {
  created_at: string; departments: Department[]; hospital_admins: HospitalAdmin[];
};
export type HospitalCreateRequest = {
  name: string;
  code: string;
  address: string | null;
  address_detail: string | null;
  postal_code: string | null;
  phone: string | null;
};
export type HospitalCreateResponse = { hospital: Hospital; departments: Department[] };
export type HospitalAdminCreateRequest = {
  hospital_id: string; login_id: string; name: string; password: string;
};
export type SystemAdminLoginResponse = {
  access: string; refresh: string; user: SystemAdminUser;
};

export class SystemAdminApiError extends Error {
  constructor(message: string, public status: number | null = null) {
    super(message); this.name = "SystemAdminApiError";
  }
}

function baseUrl() {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!value) throw new SystemAdminApiError("API 서버 환경 설정을 확인해 주세요.");
  return value.replace(/\/$/, "");
}

function errorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) {
      const text = value.find((item): item is string => typeof item === "string" && Boolean(item.trim()));
      if (text) return text;
    }
  }
  return null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, options);
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    throw new SystemAdminApiError(errorMessage(data) ?? "요청을 처리하지 못했습니다.", response.status);
  }
  return response.json();
}

const authHeaders = (token: string) => ({ Accept: "application/json", Authorization: `Bearer ${token}` });
const jsonHeaders = (token?: string) => ({
  Accept: "application/json", "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export const loginSystemAdmin = (username: string, password: string) =>
  request<SystemAdminLoginResponse>("/api/auth/system-admin/login/", {
    method: "POST", headers: jsonHeaders(), body: JSON.stringify({ username, password }),
  });
export const fetchHospitals = (token: string, signal?: AbortSignal) =>
  request<Hospital[]>("/api/system-admin/hospitals/", { headers: authHeaders(token), signal });
export const fetchHospitalDetail = (token: string, id: string, signal?: AbortSignal) =>
  request<HospitalDetail>(`/api/system-admin/hospitals/${id}/`, { headers: authHeaders(token), signal });
export const createHospital = (token: string, data: HospitalCreateRequest) =>
  request<HospitalCreateResponse>("/api/system-admin/hospitals/", {
    method: "POST", headers: jsonHeaders(token), body: JSON.stringify(data),
  });
export const fetchHospitalAdmins = (token: string, hospitalId?: string, signal?: AbortSignal) => {
  const query = hospitalId ? `?hospital_id=${encodeURIComponent(hospitalId)}` : "";
  return request<HospitalAdmin[]>(`/api/system-admin/hospital-admins/${query}`, { headers: authHeaders(token), signal });
};
export const createHospitalAdmin = (token: string, data: HospitalAdminCreateRequest) =>
  request<HospitalAdmin>("/api/system-admin/hospital-admins/", {
    method: "POST", headers: jsonHeaders(token), body: JSON.stringify(data),
  });
