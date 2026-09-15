import { describe, expect, it } from "vitest";
import { applyCaseResponse, canApplyCaseResponse } from "./case-request-guard";

describe("Case response guard", () => {
  it("does not allow a late Case A response to overwrite Case B", () => {
    const activeCaseId = "case-b";
    expect(canApplyCaseResponse("case-b", activeCaseId, false)).toBe(true);
    expect(canApplyCaseResponse("case-a", activeCaseId, false)).toBe(false);
    expect(canApplyCaseResponse("case-a", activeCaseId, true)).toBe(false);
  });

  it("keeps only Case B AI and clinical state when Case A resolves late", async () => {
    let activeCaseId = "case-a";
    const state = { ai: "", clinical: "", error: "", loading: true };
    let resolveCaseA!: () => void;
    const caseA = new Promise<void>((resolve) => { resolveCaseA = resolve; });

    const applyResult = async (requestCaseId: string, request: Promise<void>, values: { ai: string; clinical: string; error?: string }) => {
      await request;
      applyCaseResponse(requestCaseId, activeCaseId, false, () => {
        state.ai = values.ai;
        state.clinical = values.clinical;
        state.error = values.error ?? "";
        state.loading = false;
      });
    };

    const lateCaseA = applyResult("case-a", caseA, { ai: "A AI", clinical: "A 임상", error: "A 오류" });
    activeCaseId = "case-b";
    await applyResult("case-b", Promise.resolve(), { ai: "B AI", clinical: "B 임상" });
    resolveCaseA();
    await lateCaseA;

    expect(state).toEqual({ ai: "B AI", clinical: "B 임상", error: "", loading: false });
  });
});
