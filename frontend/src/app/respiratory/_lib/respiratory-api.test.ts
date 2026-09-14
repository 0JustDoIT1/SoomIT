import { describe, expect, it, vi } from "vitest";
import { createFollowUpPathologyOrder } from "./respiratory-api";

describe("createFollowUpPathologyOrder", () => {
  it("sends only the reviewed order fields to the existing doctor API", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      examination_order_id: "order-1",
      pathology_work_item_id: "work-1",
      pathology_test_type: "PDL1",
      pathology_test_type_label: "PD-L1 검사",
      order_status: "ORDERED",
      created_at: "2026-09-13T00:00:00Z",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));

    await createFollowUpPathologyOrder(authorizedFetch, "case-1", {
      pathology_test_type: "PDL1",
      priority: "URGENT",
      purpose: "치료 결정을 위한 발현 확인",
      clinical_note: "확정 병리 결과를 참고해 주세요.",
    });

    expect(authorizedFetch).toHaveBeenCalledOnce();
    expect(authorizedFetch.mock.calls[0][0]).toContain("/api/doctor/cases/case-1/pathology-orders/");
    const request = authorizedFetch.mock.calls[0][1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(JSON.parse(request.body as string)).toEqual({
      pathology_test_type: "PDL1",
      priority: "URGENT",
      purpose: "치료 결정을 위한 발현 확인",
      clinical_note: "확정 병리 결과를 참고해 주세요.",
    });
  });
});
