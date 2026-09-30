import { expect, it } from "vitest";
import { hasChangedFields, reconcileSavedFields } from "./case-dirty-state";

it("preserves typing during a save, including clearing a field, and remains dirty", () => {
  const submitted = { plan: "initial", rationale: "reason", type: "drug" };
  const saved = { ...submitted, type: "DRUG" };
  const current = { ...submitted, plan: "new plan", rationale: "" };
  const result = reconcileSavedFields(current, submitted, saved);
  expect(result).toEqual({ plan: "new plan", rationale: "", type: "DRUG" });
  expect(hasChangedFields(result, saved)).toBe(true);
});
