import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaseWorkflowDecision } from "./case-workflow-decision";

describe("CaseWorkflowDecision", () => {
  it("keeps decisions disabled until the current specialist result is confirmed", () => {
    render(<CaseWorkflowDecision caseId="case-1" currentStage="XRAY" authorizedFetch={vi.fn()} onCompleted={vi.fn()} />);

    expect(screen.getByRole("button", { name: "확정 및 다음 단계" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "검사 종료" })).toBeDisabled();
  });

  it("sends the confirmed result and immediate next stage", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ current_stage: "CT" }), { status: 200 }));
    const onCompleted = vi.fn();
    render(<CaseWorkflowDecision caseId="case-1" currentStage="XRAY" confirmedResultId="result-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);

    fireEvent.click(screen.getByRole("button", { name: "확정 및 다음 단계" }));
    fireEvent.click(screen.getByRole("button", { name: "다음 단계 진행" }));

    await vi.waitFor(() => expect(authorizedFetch).toHaveBeenCalledOnce());
    const request = authorizedFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({ action: "PROCEED_NEXT_STAGE", source_clinical_result_id: "result-1", target_stage: "CT" });
    await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith({ message: "흉부 CT 단계가 활성화되었습니다.", closed: false }));
  });

  it("requires a closure reason before ending a case", () => {
    render(<CaseWorkflowDecision caseId="case-1" currentStage="XRAY" confirmedResultId="result-1" authorizedFetch={vi.fn()} onCompleted={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "검사 종료" }));
    expect(screen.getByRole("button", { name: "Case 종료" })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("종결 사유를 입력하세요"), { target: { value: "추가 검사 불필요" } });
    expect(screen.getByRole("button", { name: "Case 종료" })).toBeEnabled();
  });
});
