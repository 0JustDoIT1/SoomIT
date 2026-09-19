import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CtWorkflowDecision } from "./ct-workflow-decision";

describe("CtWorkflowDecision", () => {
  it("disables confirmation until a CT AI result is available", () => {
    render(<CtWorkflowDecision caseId="case-1" authorizedFetch={vi.fn()} onCompleted={vi.fn()} />);

    expect(screen.getByRole("button", { name: "결과 입력 및 처리" })).toBeDisabled();
  });

  it("saves a CT draft before confirming it", async () => {
    const authorizedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-1" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "draft-1", result_status: "CONFIRMED" }), { status: 200 }));
    const onCompleted = vi.fn();

    render(<CtWorkflowDecision caseId="case-1" aiResultId="ai-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);

    fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
    fireEvent.change(screen.getByLabelText("종합 판정"), { target: { value: "NODULE_DETECTED" } });
    fireEvent.change(screen.getByLabelText("악성 위험도 (%)"), { target: { value: "82.5" } });
    fireEvent.change(screen.getByLabelText("호흡기내과 소견"), { target: { value: "우상엽 결절을 확인했습니다." } });
    fireEvent.click(screen.getByRole("button", { name: "결과 확정 및 PET-CT/TNM 진행" }));

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

    fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
    fireEvent.change(screen.getByLabelText("악성 위험도 (%)"), { target: { value: "101" } });
    fireEvent.click(screen.getByRole("button", { name: "결과 확정 및 PET-CT/TNM 진행" }));

    expect(authorizedFetch).not.toHaveBeenCalled();
  });
});

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

it("confirms CT before referral and does not expose Case closure", async () => {
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response({ id: "ct-1" }))
    .mockResolvedValueOnce(response({ id: "ct-1", result_status: "CONFIRMED" }))
    .mockResolvedValueOnce(response({ case_status: "REFERRED_OUT" }));
  const onCompleted = vi.fn();
  render(<CtWorkflowDecision caseId="case-1" aiResultId="ai-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  fireEvent.change(screen.getByLabelText("종합 판정"), { target: { value: "NO_NODULE" } });
  expect(screen.getByLabelText("처리 방법")).toHaveValue("PROCEED_NEXT_STAGE");
  expect(screen.queryByRole("option", { name: "Case 종료" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("처리 방법"), { target: { value: "REFERRED_OUT" } });
  expect(screen.queryByRole("option", { name: /재검/ })).not.toBeInTheDocument();
  const submit = screen.getByRole("button", { name: "결과 확정 및 의뢰 처리" });
  expect(submit).toBeDisabled();
  fireEvent.change(screen.getByPlaceholderText("결정 사유"), { target: { value: "추가 검사 불필요 또는 전원" } });
  fireEvent.click(submit);
  await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ closed: true })));
  expect(JSON.parse(authorizedFetch.mock.calls[1][1].body)).toEqual({ advance_to_next_stage: false });
  expect(JSON.parse(authorizedFetch.mock.calls[2][1].body)).toMatchObject({ action: "REFERRED_OUT", source_clinical_result_id: "ct-1", target_stage: null });
});

it("retries only the downstream decision after CT confirmation succeeded", async () => {
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response({ id: "ct-1" }))
    .mockResolvedValueOnce(response({ result_status: "CONFIRMED" }))
    .mockResolvedValueOnce(response({ detail: "전원 실패" }, 400))
    .mockResolvedValueOnce(response({ case_status: "REFERRED_OUT" }));
  const onCompleted = vi.fn();
  render(<CtWorkflowDecision caseId="case-1" aiResultId="ai-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  fireEvent.change(screen.getByLabelText("처리 방법"), { target: { value: "REFERRED_OUT" } });
  fireEvent.change(screen.getByPlaceholderText("결정 사유"), { target: { value: "전원" } });
  fireEvent.click(screen.getByRole("button", { name: "결과 확정 및 의뢰 처리" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("전원 실패");
  expect(screen.getByLabelText("종합 판정")).toBeDisabled();
  expect(screen.getByPlaceholderText("결정 사유")).toHaveValue("전원");
  fireEvent.click(screen.getByRole("button", { name: "의뢰 처리" }));
  await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
  expect(authorizedFetch).toHaveBeenCalledTimes(4);
  expect(authorizedFetch.mock.calls[3][0]).toContain("/workflow-decision/");
});

it("reconciles a committed confirmation after advancement failed without resaving", async () => {
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response({ id: "ct-1" }))
    .mockResolvedValueOnce(response({ detail: "다음 검사 생성 실패" }, 400))
    .mockResolvedValueOnce(response([{ id: "ct-1", result_status: "CONFIRMED" }]))
    .mockResolvedValueOnce(response({ current_stage: "CT", case_status: "ACTIVE" }))
    .mockResolvedValueOnce(response({ current_stage: "PET_CT_TNM", case_status: "ACTIVE" }));
  const onCompleted = vi.fn();
  render(<CtWorkflowDecision caseId="case-1" aiResultId="ai-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  fireEvent.click(screen.getByRole("button", { name: "결과 확정 및 PET-CT/TNM 진행" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("다음 검사 생성 실패");
  const retry = await screen.findByRole("button", { name: "PET-CT/TNM 진행" });
  await vi.waitFor(() => expect(retry).toBeEnabled());
  fireEvent.click(retry);
  await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
  expect(authorizedFetch).toHaveBeenCalledTimes(5);
  expect(authorizedFetch.mock.calls[4][0]).toContain("/workflow-decision/");
});

it("does not duplicate CT requests and locks all fields while processing", async () => {
  let resolve!: (value: Response) => void;
  const authorizedFetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }))
    .mockResolvedValueOnce(response({ result_status: "CONFIRMED" }));
  render(<CtWorkflowDecision caseId="case-1" aiResultId="ai-1" authorizedFetch={authorizedFetch} onCompleted={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  const button = screen.getByRole("button", { name: "결과 확정 및 PET-CT/TNM 진행" });
  act(() => { button.click(); button.click(); });
  expect(authorizedFetch).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("처리 방법")).toBeDisabled();
  expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await act(async () => resolve(response({ id: "ct-1" })));
  expect(authorizedFetch).toHaveBeenCalledTimes(2);
});

it("loads a confirmed CT result delivered after mount and skips save/confirm", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(response({ case_status: "REFERRED_OUT" }));
  const props = { caseId: "case-1", authorizedFetch, onCompleted: vi.fn() };
  const { rerender } = render(<CtWorkflowDecision {...props} />);
  rerender(<CtWorkflowDecision {...props} clinicalResult={{ id: "ct-1", result_status: "CONFIRMED", result_detail: { ct: { overall_assessment: "NO_NODULE", finding_summary: "정상 소견" } } }} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  expect(screen.getByLabelText("종합 판정")).toHaveValue("NO_NODULE");
  expect(screen.getByLabelText("호흡기내과 소견")).toHaveValue("정상 소견");
  fireEvent.change(screen.getByLabelText("처리 방법"), { target: { value: "REFERRED_OUT" } });
  fireEvent.change(screen.getByPlaceholderText("결정 사유"), { target: { value: "추가 검사 불필요" } });
  fireEvent.click(screen.getByRole("button", { name: "의뢰 처리" }));
  await vi.waitFor(() => expect(props.onCompleted).toHaveBeenCalledOnce());
  expect(authorizedFetch).toHaveBeenCalledOnce();
  expect(authorizedFetch.mock.calls[0][0]).toContain("/workflow-decision/");
});
