import { describe, expect, it } from "vitest";
import { deriveCurrentActions } from "./derive-current-actions";

const activeCase = { id: "case-1", current_stage: "PET_CT_TNM", case_status: "ACTIVE" };

describe("deriveCurrentActions", () => {
  it("creates no work when API-backed result states are absent", () => {
    expect(deriveCurrentActions(activeCase, [], [], [])).toEqual([]);
  });

  it("keeps confirmed specialist results separate from AI candidates", () => {
    const actions = deriveCurrentActions(
      activeCase,
      [{ id: "clinical-1", workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_status_label: "확정" }],
      [{ id: "ai-1", analysis_type: "PET_CT_TNM_ANALYSIS", status: "SUCCEEDED", status_label: "성공" }],
      [],
    );

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ source: "SPECIALIST", target: "PET_CT_TNM" });
    expect(actions[1]).toMatchObject({ source: "AI", title: "PET-CT 기반 TNM AI 후보 확인", target: "PET_CT_TNM" });
  });

  it("recalculates work from the newly selected Case", () => {
    const results = [{ id: "clinical-1", workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED" }];
    expect(deriveCurrentActions(activeCase, results, [], [])).toHaveLength(1);
    expect(deriveCurrentActions({ ...activeCase, id: "case-2", current_stage: "PATHOLOGY_GENE" }, results, [], [])).toHaveLength(0);
  });

  it("does not create unsupported work for inactive Cases", () => {
    expect(deriveCurrentActions({ ...activeCase, case_status: "CLOSED" }, [{ workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED" }], [], [])).toEqual([]);
  });

  it("creates PD-L1 work only from an actual clinical or AI result", () => {
    expect(deriveCurrentActions({ ...activeCase, current_stage: "PATHOLOGY_GENE" }, [], [], [])).toEqual([]);
    const actions = deriveCurrentActions(
      { ...activeCase, current_stage: "PATHOLOGY_GENE" },
      [{ id: "gene-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_status_label: "확정", result_detail: { pdl1: { tps_percent: 40 } } }],
      [],
      [],
    );
    expect(actions).toEqual(expect.arrayContaining([expect.objectContaining({ title: "PD-L1 확정 TPS 확인", target: "PDL1", source: "SPECIALIST" })]));
  });

  it("uses the dedicated PDL1 clinical result without duplicating current-stage work", () => {
    const actions = deriveCurrentActions(
      { ...activeCase, current_stage: "PDL1" },
      [{ id: "pdl1-1", workflow_stage: "PDL1", result_status: "CONFIRMED", result_detail: { pdl1: { tps_percent: 50 } } }],
      [{ id: "pdl1-ai", analysis_type: "PDL1_ANALYSIS", status: "SUCCEEDED" }],
      [],
    );

    expect(actions).toHaveLength(2);
    expect(actions.filter((action) => action.target === "PDL1")).toHaveLength(2);
  });

  it("opens gene review in the combined pathology and gene workspace", () => {
    const actions = deriveCurrentActions(
      { ...activeCase, current_stage: "PATHOLOGY_GENE" },
      [],
      [{ id: "gene-ai", analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED" }],
      [],
    );
    expect(actions[0]).toMatchObject({ target: "PATHOLOGY_GENE" });
  });

  it("creates work only for API-backed active examination orders", () => {
    const actions = deriveCurrentActions(
      { ...activeCase, current_stage: "CT" },
      [],
      [],
      [],
      [
        { id: "ct-ordered", order_type: "CT", order_type_label: "CT", status: "ORDERED" },
        { id: "pdl1-completed", order_type: "PDL1", order_type_label: "PD-L1 검사", status: "COMPLETED" },
        { id: "gene-cancelled", order_type: "PATHOLOGY_GENE", order_type_label: "조직·유전자 검사", status: "CANCELLED" },
      ],
    );

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ source: "ORDER", target: "CT", status: "오더 요청됨" });
  });

  it("includes confirmed appointment timing in active order work", () => {
    const actions = deriveCurrentActions(
      { ...activeCase, current_stage: "CT" },
      [],
      [],
      [],
      [{ id: "ct-scheduled", order_type: "CT", order_type_label: "흉부 CT", status: "SCHEDULED", appointment_status: "CONFIRMED", scheduled_at: "2026-09-20T01:30:00Z" }],
    );

    expect(actions).toHaveLength(1);
    expect(actions[0].status).toContain("예약 확정");
    expect(actions[0].status).toContain("2026");
  });

  it("does not create review work for AI analyses without a completed result", () => {
    for (const status of ["PENDING", "RUNNING", "FAILED"]) {
      expect(deriveCurrentActions(
        activeCase,
        [],
        [{ id: `ai-${status}`, analysis_type: "PET_CT_TNM_ANALYSIS", status }],
        [],
      )).toEqual([]);
    }
  });
});
