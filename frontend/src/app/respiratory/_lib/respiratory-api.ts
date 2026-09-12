const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

export type FollowUpPathologyTestType = "PDL1" | "GENE";

export type FollowUpPathologyOrderAvailability = {
  subtype_review_completed: boolean;
  active_orders: Record<FollowUpPathologyTestType, boolean>;
};

export type FollowUpPathologyOrderResponse = {
  examination_order_id: string;
  pathology_work_item_id: string;
  pathology_test_type: FollowUpPathologyTestType;
  pathology_test_type_label: string;
  order_status: string;
  created_at: string;
};

export async function fetchFollowUpPathologyOrderAvailability(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  caseId: string,
) {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/doctor/cases/${caseId}/pathology-orders/`,
  );
  if (!response.ok) {
    throw new Error("추가 병리 검사 처방 상태를 불러오지 못했습니다.");
  }
  return response.json() as Promise<FollowUpPathologyOrderAvailability>;
}

export async function createFollowUpPathologyOrder(
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  caseId: string,
  pathologyTestType: FollowUpPathologyTestType,
) {
  const response = await authorizedFetch(
    `${API_BASE_URL}/api/doctor/cases/${caseId}/pathology-orders/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathology_test_type: pathologyTestType,
        priority: "NORMAL",
        purpose: "추가 병리 검사",
        clinical_note: "",
      }),
    },
  );
  const data = (await response.json()) as FollowUpPathologyOrderResponse & {
    detail?: string;
  };
  if (!response.ok) {
    throw new Error(data.detail || "추가 병리 검사 오더 생성에 실패했습니다.");
  }
  return data;
}
