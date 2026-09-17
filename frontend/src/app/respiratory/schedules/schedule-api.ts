import { API_BASE_URL } from "@/lib/api";

export type DoctorAvailability = { id: string; weekday: number; start_time: string; end_time: string; slot_minutes: 30; enabled: boolean };
export type DoctorUnavailableSchedule = { id: string; start_at: string; end_at: string; reason: string | null };
type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function request<T>(authorizedFetch: AuthorizedFetch, path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(`${API_BASE_URL}${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "요청을 처리하지 못했습니다.");
  return data as T;
}

export const fetchWeeklyAvailability = (fetcher: AuthorizedFetch) => request<DoctorAvailability[]>(fetcher, "/api/scheduling/doctor/weekly-availability/");
export const createWeeklyAvailability = (fetcher: AuthorizedFetch, body: Pick<DoctorAvailability, "weekday" | "start_time" | "end_time" | "enabled">) => request<DoctorAvailability>(fetcher, "/api/scheduling/doctor/weekly-availability/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const updateWeeklyAvailability = (fetcher: AuthorizedFetch, id: string, body: Partial<Pick<DoctorAvailability, "enabled" | "weekday" | "start_time" | "end_time">>) => request<DoctorAvailability>(fetcher, `/api/scheduling/doctor/weekly-availability/${id}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const deleteWeeklyAvailability = (fetcher: AuthorizedFetch, id: string) => request<void>(fetcher, `/api/scheduling/doctor/weekly-availability/${id}/`, { method: "DELETE" });
export const fetchUnavailableSchedules = (fetcher: AuthorizedFetch) => request<DoctorUnavailableSchedule[]>(fetcher, "/api/scheduling/doctor/unavailable/");
export const createUnavailableSchedule = (fetcher: AuthorizedFetch, body: Pick<DoctorUnavailableSchedule, "start_at" | "end_at" | "reason">) => request<DoctorUnavailableSchedule>(fetcher, "/api/scheduling/doctor/unavailable/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const updateUnavailableSchedule = (fetcher: AuthorizedFetch, id: string, body: Partial<Pick<DoctorUnavailableSchedule, "start_at" | "end_at" | "reason">>) => request<DoctorUnavailableSchedule>(fetcher, `/api/scheduling/doctor/unavailable/${id}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const deleteUnavailableSchedule = (fetcher: AuthorizedFetch, id: string) => request<void>(fetcher, `/api/scheduling/doctor/unavailable/${id}/`, { method: "DELETE" });
