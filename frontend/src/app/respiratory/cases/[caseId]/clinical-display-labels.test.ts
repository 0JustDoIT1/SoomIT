import { describe, expect, it } from "vitest";
import { getCaseStatusLabel, getDecisionTypeLabel, getPrescriptionStatusLabel } from "./clinical-display-labels";

describe("clinical display labels", () => {
  it("translates only known backend codes", () => {
    expect(getCaseStatusLabel("ACTIVE")).toBe("진행 중");
    expect(getDecisionTypeLabel("PROCEED_NEXT_STAGE")).toBe("다음 단계 진행");
    expect(getPrescriptionStatusLabel("FINAL")).toBe("최종 확정");
  });

  it("keeps unknown values visible instead of inventing a meaning", () => {
    expect(getCaseStatusLabel("NEW_STATUS")).toBe("NEW_STATUS");
    expect(getDecisionTypeLabel(undefined)).toBe("-");
  });
});
