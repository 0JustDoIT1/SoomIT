import { describe, expect, it } from "vitest";

import { getClinicalResultHttpError, getClinicalResultNetworkError } from "./clinical-result-errors";

describe("clinical result errors", () => {
  it("distinguishes authentication and permission failures", () => {
    expect(getClinicalResultHttpError(401)).toContain("인증이 만료");
    expect(getClinicalResultHttpError(403)).toContain("조회 권한이 없습니다");
  });

  it("describes a network failure separately", () => {
    const message = getClinicalResultNetworkError();
    expect(message).toContain("서버에 연결할 수 없습니다");
    expect(message).not.toContain("인증");
  });

  it("uses a general message for other failures", () => {
    expect(getClinicalResultHttpError(500)).toBe("전문과 결과를 불러오지 못했습니다.");
  });
});
