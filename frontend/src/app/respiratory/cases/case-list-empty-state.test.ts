import { describe, expect, it } from "vitest";

import { getCaseListEmptyState } from "./case-list-empty-state";

describe("getCaseListEmptyState", () => {
  it("explains the signed-in doctor scope when no assigned cases exist", () => {
    expect(getCaseListEmptyState("")).toEqual({
      title: "현재 배정된 진행 중 Case가 없습니다.",
      description: "이 목록에는 현재 로그인한 담당의에게 배정된 진행 중 Case만 표시됩니다.",
    });
  });

  it("distinguishes an empty search result from an empty assignment", () => {
    expect(getCaseListEmptyState("강테스트").title).toBe("검색 조건에 맞는 Case가 없습니다.");
  });

  it("explains which actual Case status filter produced an empty list", () => {
    expect(getCaseListEmptyState("", "ACTIVE").title).toBe("진행 중인 담당 Case가 없습니다.");
    expect(getCaseListEmptyState("", "IMAGING").title).toBe("진행 중인 X-ray 또는 흉부 CT Case가 없습니다.");
    expect(getCaseListEmptyState("", "NOTIFIED").title).toBe("새 알림이 연결된 담당 Case가 없습니다.");
  });
});
