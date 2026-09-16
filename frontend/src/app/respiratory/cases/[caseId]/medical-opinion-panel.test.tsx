import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MedicalOpinionPanel } from "./medical-opinion-panel";

describe("MedicalOpinionPanel", () => {
  it("does not call the API automatically and stays disabled without confirmed results", () => {
    const authorizedFetch = vi.fn();
    render(<MedicalOpinionPanel caseId="case-1" confirmedResultCount={0} apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);

    expect(screen.getByRole("button", { name: "소견 초안 생성" })).toBeDisabled();
    expect(screen.getByText("확정된 임상 결과가 없어 소견 초안을 생성할 수 없습니다.")).toBeTruthy();
    expect(authorizedFetch).not.toHaveBeenCalled();
  });

  it("generates a review-only draft from the existing endpoint", async () => {
    const user = userEvent.setup();
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      opinion: "확정 결과를 바탕으로 작성한 소견 초안입니다.",
      source_results: [{ id: "result-1", workflow_stage: "CT", confirmed_at: null }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    render(<MedicalOpinionPanel caseId="case-1" confirmedResultCount={1} apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    await user.click(screen.getByRole("button", { name: "소견 초안 생성" }));

    expect(await screen.findByText("확정 결과를 바탕으로 작성한 소견 초안입니다.")).toBeTruthy();
    expect(screen.getByText("근거로 사용된 확정 결과 1건 · 의료진 검토 전 초안")).toBeTruthy();
    expect(screen.getByLabelText("소견 근거 단계")).toHaveTextContent("흉부 CT");
    expect(authorizedFetch).toHaveBeenCalledWith(
      "http://api.test/api/doctor/cases/case-1/medical-opinion/",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("clears a generated draft when the Case changes", async () => {
    const user = userEvent.setup();
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ opinion: "Case A 초안", source_results: [] }), { status: 200 }));
    const { rerender } = render(<MedicalOpinionPanel key="case-a" caseId="case-a" confirmedResultCount={1} apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    await user.click(screen.getByRole("button", { name: "소견 초안 생성" }));
    expect(await screen.findByText("Case A 초안")).toBeTruthy();

    rerender(<MedicalOpinionPanel key="case-b" caseId="case-b" confirmedResultCount={1} apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    expect(screen.queryByText("Case A 초안")).toBeNull();
  });
});
