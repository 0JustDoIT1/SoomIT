import { describe, expect, it } from "vitest";

import { getCaseListFetchError, getCaseListHttpError } from "./case-list-errors";

describe("case list errors", () => {
  it("distinguishes authentication and permission failures", () => {
    expect(getCaseListHttpError(401)).toContain("로그인이 만료");
    expect(getCaseListHttpError(403)).toContain("조회 권한");
  });

  it("does not expose the browser Failed to fetch message", () => {
    expect(getCaseListFetchError(new TypeError("Failed to fetch"))).toBe(
      "백엔드 API에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요.",
    );
  });
});
