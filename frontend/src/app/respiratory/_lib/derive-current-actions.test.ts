import { describe, expect, it } from "vitest";
import { deriveCurrentActions } from "./derive-current-actions";

const activeCase = { id: "case-1", current_stage: "STAGING", case_status: "ACTIVE" };

describe("deriveCurrentActions", () => {
  it("creates no work when API-backed result states are absent", () => {
    expect(deriveCurrentActions(activeCase, [], [], [])).toEqual([]);
  });

  it("keeps confirmed specialist results separate from AI candidates", () => {
    const actions = deriveCurrentActions(
      activeCase,
      [{ id: "clinical-1", exam_type: "STAGING", result_status: "CONFIRMED", result_status_label: "확정" }],
      [{ id: "ai-1", analysis_type: "TNM_STAGING", status: "COMPLETED", status_label: "완료" }],
      [],
    );

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ source: "SPECIALIST", title: "전문과 확정 결과 확인" });
    expect(actions[1]).toMatchObject({ source: "AI", title: "AI 후보 결과 확인" });
  });

  it("recalculates work from the newly selected Case", () => {
    const results = [{ id: "clinical-1", exam_type: "STAGING", result_status: "CONFIRMED" }];
    expect(deriveCurrentActions(activeCase, results, [], [])).toHaveLength(1);
    expect(deriveCurrentActions({ ...activeCase, id: "case-2", current_stage: "GENE" }, results, [], [])).toHaveLength(0);
  });

  it("does not create unsupported work for inactive Cases", () => {
    expect(deriveCurrentActions({ ...activeCase, case_status: "CLOSED" }, [{ exam_type: "STAGING", result_status: "CONFIRMED" }], [], [])).toEqual([]);
  });
});
