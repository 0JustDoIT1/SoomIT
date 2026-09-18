import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaseWorkflowDecision } from "./case-workflow-decision";

describe("CaseWorkflowDecision", () => {
  it("keeps actions disabled until the current result is confirmed", () => {
    render(<CaseWorkflowDecision caseId="case-1" currentStage="CT" authorizedFetch={vi.fn()} onCompleted={vi.fn()} />);

    expect(screen.getByRole("button", { name: "다음 단계 진행" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Case 종료" })).toBeDisabled();
  });

  it("sends the confirmed CT result and immediate PET-CT/TNM stage", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ current_stage: "PET_CT_TNM", case_status: "ACTIVE" }), { status: 200 }));
    const onCompleted = vi.fn();
    render(<CaseWorkflowDecision caseId="case-1" currentStage="CT" confirmedResultId="result-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);

    fireEvent.click(screen.getByRole("button", { name: "다음 단계 진행" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "결정 저장" }));

    await vi.waitFor(() => expect(authorizedFetch).toHaveBeenCalledOnce());
    const request = authorizedFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      action: "PROCEED_NEXT_STAGE",
      source_clinical_result_id: "result-1",
      target_stage: "PET_CT_TNM",
    });
    await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ closed: false })));
  });
});
