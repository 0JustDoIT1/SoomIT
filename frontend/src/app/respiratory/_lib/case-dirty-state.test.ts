import { describe, expect, it } from "vitest";
import { hasChangedFields, hasPrescriptionDraftChanges, hasUnsavedCaseChanges } from "./case-dirty-state";

describe("case dirty state", () => {
  it("detects treatment changes and clears after the saved baseline matches", () => {
    const draft = { treatment_type: "CHEMO", rationale: "근거" };
    expect(hasChangedFields(draft, { treatment_type: "", rationale: "" })).toBe(true);
    expect(hasChangedFields(draft, draft)).toBe(false);
  });

  it("detects prescription creation and item changes", () => {
    expect(hasPrescriptionDraftChanges({ cycleNumber: "2", phase: "INDUCTION", cycleStartDate: "", itemDirty: {} })).toBe(true);
    expect(hasPrescriptionDraftChanges({ cycleNumber: "1", phase: "INDUCTION", cycleStartDate: "", itemDirty: { item1: true } })).toBe(true);
    expect(hasPrescriptionDraftChanges({ cycleNumber: "1", phase: "INDUCTION", cycleStartDate: "", itemDirty: {} })).toBe(false);
  });

  it("warns only when a Case-scoped source is dirty", () => {
    expect(hasUnsavedCaseChanges({ tnm: false, treatment: true, prescription: false, unacknowledgedWarnings: false })).toBe(true);
    expect(hasUnsavedCaseChanges({ tnm: false, treatment: false, prescription: false, unacknowledgedWarnings: false })).toBe(false);
  });
});
