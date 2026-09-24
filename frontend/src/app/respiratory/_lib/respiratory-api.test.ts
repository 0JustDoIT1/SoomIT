import { describe, expect, it, vi } from "vitest";
import { cancelExaminationOrder, createExaminationOrder, createFollowUpPathologyOrder, fetchExaminationOrders, updateExaminationOrder } from "./respiratory-api";

describe("examination order API", () => {
  it("uses the common orders endpoint for listing", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    await fetchExaminationOrders(authorizedFetch, "case-1");
    expect(authorizedFetch).toHaveBeenCalledWith(expect.stringContaining("/api/doctor/cases/case-1/orders/"));
  });

  it("sends PET_CT_TNM to the common order API", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "order-1", order_type: "PET_CT_TNM" }), { status: 201 }));
    await createExaminationOrder(authorizedFetch, "case-1", { order_type: "PET_CT_TNM", priority: "URGENT", purpose: "TNM 병기 평가", clinical_note: "CT 확정 결과 참고" });
    expect(authorizedFetch.mock.calls[0][0]).toContain("/api/doctor/cases/case-1/orders/");
    expect(JSON.parse((authorizedFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ order_type: "PET_CT_TNM", priority: "URGENT", purpose: "TNM 병기 평가", clinical_note: "CT 확정 결과 참고" });
  });

  it("uses the existing follow-up pathology endpoint for a PD-L1 reorder", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ examination_order_id: "order-2", pathology_work_item_id: "work-item-2", order_type: "PDL1", order_status: "ORDERED" }), { status: 201 }));
    await createFollowUpPathologyOrder(authorizedFetch, "case-1", { pathology_test_type: "PDL1", priority: "NORMAL", purpose: "Cancelled PD-L1 reorder", clinical_note: "" });
    expect(authorizedFetch.mock.calls[0][0]).toContain("/api/doctor/cases/case-1/pathology-orders/");
    expect((authorizedFetch.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(JSON.parse((authorizedFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ pathology_test_type: "PDL1", priority: "NORMAL", purpose: "Cancelled PD-L1 reorder", clinical_note: "" });
  });

  it("updates an ordered examination through its order detail endpoint", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "order-1", status: "ORDERED" }), { status: 200 }));
    await updateExaminationOrder(authorizedFetch, "case-1", "order-1", { priority: "URGENT", purpose: "revised purpose" });
    expect(authorizedFetch.mock.calls[0][0]).toContain("/api/doctor/cases/case-1/orders/order-1/");
    expect((authorizedFetch.mock.calls[0][1] as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((authorizedFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ priority: "URGENT", purpose: "revised purpose" });
  });

  it("cancels an examination through its order detail endpoint", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "order-1", status: "CANCELLED" }), { status: 200 }));
    await cancelExaminationOrder(authorizedFetch, "case-1", "order-1");
    expect(authorizedFetch.mock.calls[0][0]).toContain("/api/doctor/cases/case-1/orders/order-1/");
    expect((authorizedFetch.mock.calls[0][1] as RequestInit).method).toBe("DELETE");
  });
});
