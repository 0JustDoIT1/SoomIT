import { describe, expect, it } from "vitest";
import { canApplyCaseResponse } from "./case-request-guard";

describe("Case response guard", () => {
  it("does not allow a late Case A response to overwrite Case B", () => {
    const activeCaseId = "case-b";
    expect(canApplyCaseResponse("case-b", activeCaseId, false)).toBe(true);
    expect(canApplyCaseResponse("case-a", activeCaseId, false)).toBe(false);
    expect(canApplyCaseResponse("case-a", activeCaseId, true)).toBe(false);
  });
});
