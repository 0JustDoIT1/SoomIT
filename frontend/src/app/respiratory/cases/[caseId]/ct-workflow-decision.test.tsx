import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CtWorkflowDecision } from "./ct-workflow-decision";

describe("CtWorkflowDecision", () => {
  it("disables confirmation until a CT AI result is available", () => {
    render(<CtWorkflowDecision caseId="case-1" authorizedFetch={vi.fn()} onCompleted={vi.fn()} />);

    expect(screen.getByRole("button", { name: "결과 입력 및 확정" })).toBeDisabled();
  });

  it("saves a CT draft before confirming it", async () => {
    const authorizedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-1" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-1", result_status: "CONFIRMED" }), { status: 200 }));
    const onCompleted = vi.fn();

    render(<CtWorkflowDecision caseId="case-1" aiResultId="ai-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);

    fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 확정" }));
    fireEvent.change(screen.getByLabelText("종합 판정"), { target: { value: "NODULE_DETECTED" } });
    fireEvent.change(screen.getByLabelText("악성 위험도 (%)"), { target: { value: "82.5" } });
    fireEvent.change(screen.getByLabelText("호흡기내과 소견"), { target: { value: "우상엽 결절을 확인했습니다." } });
    fireEvent.click(screen.getByRole("button", { name: "결과 확정" }));

    await vi.waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(2));
    const draftRequest = authorizedFetch.mock.calls[0];
    expect(draftRequest[0]).toContain("/api/doctor/cases/case-1/clinical-results/ct/");
    expect(JSON.parse((draftRequest[1] as RequestInit).body as string)).toEqual({
      reviewed_ai_result_id: "ai-1",
      overall_assessment: "NODULE_DETECTED",
      overall_malignancy_risk: 82.5,
      finding_summary: "우상엽 결절을 확인했습니다.",
    });
    expect(authorizedFetch.mock.calls[1][0]).toContain("/api/doctor/cases/case-1/clinical-results/ct/draft-1/confirm/");
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it("rejects an out-of-range malignancy risk before sending a request", () => {
    const authorizedFetch = vi.fn();
    render(<CtWorkflowDecision caseId="case-1" aiResultId="ai-1" authorizedFetch={authorizedFetch} onCompleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 확정" }));
    fireEvent.change(screen.getByLabelText("악성 위험도 (%)"), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 확정" }));

    expect(authorizedFetch).not.toHaveBeenCalled();
  });
});
