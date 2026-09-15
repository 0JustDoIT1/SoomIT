const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

export type ExaminationOrderType = "CT" | "PET_CT_TNM" | "PATHOLOGY_GENE" | "PDL1";
export type ExaminationOrderPriority = "NORMAL" | "URGENT";
export type ExaminationOrderStatus = "ORDERED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type ExaminationOrder = { id: string; case_id: string; order_type: ExaminationOrderType; order_type_label: string; priority: ExaminationOrderPriority; status: ExaminationOrderStatus; purpose?: string; clinical_note?: string | null; pathology_work_item_id?: string | null; created_at: string };
export type ExaminationOrderRequest = { order_type: ExaminationOrderType; priority: ExaminationOrderPriority; purpose: string; clinical_note: string };
type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchExaminationOrders(authorizedFetch: AuthorizedFetch, caseId: string) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/orders/`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "검사 오더를 불러오지 못했습니다.");
  return Array.isArray(data) ? data as ExaminationOrder[] : [];
}

export async function createExaminationOrder(authorizedFetch: AuthorizedFetch, caseId: string, order: ExaminationOrderRequest) {
  const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseId}/orders/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "검사 오더 생성에 실패했습니다.");
  return data as ExaminationOrder;
}
