import { describe, expect, it } from "vitest";

import { getAiResultHttpError, getAiResultNetworkError } from "./ai-result-errors";

describe("AI result errors", () => {
  it("distinguishes an expired login from insufficient permission", () => {
    expect(getAiResultHttpError(401)).toContain("인증이 만료");
    expect(getAiResultHttpError(403)).toContain("조회 권한이 없습니다");
  });

  it("does not describe a network failure as an authentication failure", () => {
    const message = getAiResultNetworkError();

    expect(message).toContain("서버에 연결할 수 없습니다");
    expect(message).not.toContain("인증");
  });

  it("uses a general message for other response failures", () => {
    expect(getAiResultHttpError(500)).toBe("AI 결과를 불러오지 못했습니다.");
  });
});
