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
      [{ id: "ai-1", analysis_type: "PET_CT_TNM_ANALYSIS", status: "COMPLETED", status_label: "완료" }],
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

  it("opens gene review in the combined pathology and gene workspace", () => {
    const actions = deriveCurrentActions(
      { ...activeCase, current_stage: "PATHOLOGY_GENE" },
      [],
      [{ id: "gene-ai", analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "COMPLETED" }],
      [],
    );
    expect(actions[0]).toMatchObject({ target: "PATHOLOGY_GENE" });
  });
});
