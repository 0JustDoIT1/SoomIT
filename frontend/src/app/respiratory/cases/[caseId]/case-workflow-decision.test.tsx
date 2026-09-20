import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaseWorkflowDecision } from "./case-workflow-decision";

it("does not expose a second TNM progression path alongside the workspace", () => {
  render(<CaseWorkflowDecision caseId="case-1" currentStage="PET_CT_TNM" confirmedResultId="tnm-1" confirmedStageGroup="IIA" exceptionsOnly authorizedFetch={vi.fn()} onCompleted={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "종료·의뢰 처리" }));
  expect(screen.queryByRole("option", { name: /진행/ })).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "의뢰·전원" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Case 종료" })).not.toBeInTheDocument();
});

it("keeps a failed PD-L1 decision open and retries without a biopsy option", async () => {
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "선행 결과 확인 필요" }), { status: 400 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ case_status: "ACTIVE" })));
  const onCompleted = vi.fn();
  render(<CaseWorkflowDecision caseId="case-1" currentStage="PDL1" confirmedResultId="pdl1-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  expect(screen.queryByRole("option", { name: "재생검" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "치료결정으로 진행" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("다음 단계 전환에 실패했습니다.");
  expect(onCompleted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "치료결정으로 진행" }));
  await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
});

describe("CaseWorkflowDecision", () => {
  it("keeps actions disabled until the current result is confirmed", () => {
    render(<CaseWorkflowDecision caseId="case-1" currentStage="CT" authorizedFetch={vi.fn()} onCompleted={vi.fn()} />);

    expect(screen.getByRole("button", { name: "결과 입력 및 처리" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Case 종료" })).not.toBeInTheDocument();
  });

  it("sends the confirmed CT result and immediate PET-CT/TNM stage", async () => {
    const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ current_stage: "PET_CT_TNM", case_status: "ACTIVE" }), { status: 200 }));
    const onCompleted = vi.fn();
    render(<CaseWorkflowDecision caseId="case-1" currentStage="CT" confirmedResultId="result-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);

    fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계 진행" }));

    await vi.waitFor(() => expect(authorizedFetch).toHaveBeenCalledOnce());
    const request = authorizedFetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      action: "PROCEED_NEXT_STAGE",
      source_clinical_result_id: "result-1",
      target_stage: "PET_CT_TNM",
    });
    await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ closed: false })));
  });

  it("uses a clinical action label when a confirmed PD-L1 result can enter treatment", () => {
    render(<CaseWorkflowDecision caseId="case-1" currentStage="PDL1" confirmedResultId="result-1" authorizedFetch={vi.fn()} onCompleted={vi.fn()} />);

    expect(screen.getByRole("button", { name: "결과 입력 및 처리" })).toBeEnabled();
  });
});

it("blocks TNM advancement before final Stage Group confirmation, even with a confirmed result", () => {
  const authorizedFetch = vi.fn();
  render(<CaseWorkflowDecision caseId="case-1" currentStage="PET_CT_TNM" confirmedResultId="result-1" authorizedFetch={authorizedFetch} onCompleted={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  expect(screen.getByRole("option", { name: "조직/유전자 진행" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("처리 방법"), { target: { value: "PROCEED_NEXT_STAGE" } });
  fireEvent.click(screen.getByRole("button", { name: "다음 단계 진행" }));
  expect(authorizedFetch).not.toHaveBeenCalled();
});

it("allows TNM advancement after final Stage Group confirmation", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ case_status: "ACTIVE" })));
  render(<CaseWorkflowDecision caseId="case-1" currentStage="PET_CT_TNM" confirmedResultId="result-1" confirmedStageGroup="IIA" authorizedFetch={authorizedFetch} onCompleted={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  fireEvent.click(screen.getByRole("button", { name: "다음 단계 진행" }));
  await vi.waitFor(() => expect(authorizedFetch).toHaveBeenCalledOnce());
  expect(JSON.parse(authorizedFetch.mock.calls[0][1].body)).toMatchObject({ action: "PROCEED_NEXT_STAGE", target_stage: "PATHOLOGY_GENE", source_clinical_result_id: "result-1" });
});

it("allows referral from PRESCRIPTION without a FINAL prescription", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ case_status: "REFERRED_OUT" })));
  const onCompleted = vi.fn();
  render(<CaseWorkflowDecision caseId="case-1" currentStage="PRESCRIPTION" confirmedResultId="result-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);
  fireEvent.click(screen.getByRole("button", { name: "최종 확인" }));
  expect(screen.queryByRole("option", { name: /진행/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Case 종료" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("처리 방법"), { target: { value: "REFERRED_OUT" } });
  expect(screen.getByRole("button", { name: "의뢰·전원 처리" })).toBeDisabled();
  fireEvent.change(screen.getByPlaceholderText("결정 사유"), { target: { value: "사유 기록" } });
  fireEvent.click(screen.getByRole("button", { name: "의뢰·전원 처리" }));
  await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ closed: true })));
  expect(JSON.parse(authorizedFetch.mock.calls[0][1].body)).toMatchObject({ action: "REFERRED_OUT", target_stage: null, reason: "사유 기록" });
});

it("allows Case closure from PRESCRIPTION only with a FINAL prescription", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ case_status: "CLOSED" })));
  const onCompleted = vi.fn();
  render(<CaseWorkflowDecision caseId="case-1" currentStage="PRESCRIPTION" confirmedResultId="result-1" hasFinalPrescription authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);
  fireEvent.click(screen.getByRole("button", { name: "최종 확인" }));
  fireEvent.change(screen.getByLabelText("처리 방법"), { target: { value: "CASE_CLOSED" } });
  fireEvent.change(screen.getByPlaceholderText("결정 사유"), { target: { value: "정기 추적" } });
  fireEvent.click(screen.getByRole("button", { name: "Case 종료" }));
  await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ closed: true })));
  expect(JSON.parse(authorizedFetch.mock.calls[0][1].body)).toMatchObject({ action: "CASE_CLOSED", target_stage: null, reason: "정기 추적" });
});

it("requires both reason and purpose for a biopsy retry", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ case_status: "ACTIVE" })));
  render(<CaseWorkflowDecision caseId="case-1" currentStage="PATHOLOGY_GENE" confirmedResultId="result-1" authorizedFetch={authorizedFetch} onCompleted={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  fireEvent.change(screen.getByLabelText("처리 방법"), { target: { value: "RETRY" } });
  const save = screen.getByRole("button", { name: "재생검 요청" });
  fireEvent.change(screen.getByPlaceholderText("부적정 또는 재생검 사유"), { target: { value: "   " } });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByPlaceholderText("부적정 또는 재생검 사유"), { target: { value: "검체 부족" } });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByPlaceholderText("재생검 오더 목적"), { target: { value: "검체 재채취" } });
  fireEvent.click(save);
  await vi.waitFor(() => expect(authorizedFetch).toHaveBeenCalledOnce());
  expect(JSON.parse(authorizedFetch.mock.calls[0][1].body)).toMatchObject({ action: "RETRY", target_stage: null, reason: "검체 부족", retry_purpose: "검체 재채취" });
});

it("prevents repeated workflow submissions before the first response", async () => {
  let resolve!: (value: Response) => void;
  const authorizedFetch = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
  render(<CaseWorkflowDecision caseId="case-1" currentStage="CT" confirmedResultId="result-1" authorizedFetch={authorizedFetch} onCompleted={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  const save = screen.getByRole("button", { name: "다음 단계 진행" });
  act(() => { save.click(); save.click(); });
  expect(authorizedFetch).toHaveBeenCalledOnce();
  await act(async () => resolve(new Response(JSON.stringify({ case_status: "ACTIVE" }))));
});
