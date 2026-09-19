import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { XrayWorkflowDecision } from "./xray-workflow-decision";

it("closes the dialog on success and prevents duplicate X-ray submissions", async () => {
  let resolve!: (value: Response) => void;
  const authorizedFetch = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
  const onCompleted = vi.fn();
  render(<XrayWorkflowDecision caseId="case-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  const button = screen.getByRole("button", { name: "결과 확정 및 CT 오더 생성" });
  act(() => { button.click(); button.click(); });
  expect(authorizedFetch).toHaveBeenCalledOnce();
  await act(async () => resolve(new Response(JSON.stringify({ case_status: "ACTIVE" }))));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(onCompleted).toHaveBeenCalledOnce();
  expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ closed: false }));
});

it.each(["CLOSE_CASE", "REFERRED_OUT"])("keeps X-ray inputs after a failed %s and allows retry", async (action) => {
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "처리 실패" }), { status: 400 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ case_status: action === "CLOSE_CASE" ? "CLOSED" : "REFERRED_OUT" })));
  const onCompleted = vi.fn();
  render(<XrayWorkflowDecision caseId="case-1" authorizedFetch={authorizedFetch} onCompleted={onCompleted} />);
  fireEvent.click(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  fireEvent.change(screen.getByLabelText("판정"), { target: { value: "NEGATIVE" } });
  expect(screen.getByLabelText("처리 방법")).toHaveValue("CLOSE_CASE");
  fireEvent.change(screen.getByLabelText("처리 방법"), { target: { value: action } });
  expect(screen.queryByRole("option", { name: /재검/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("CT 오더 목적")).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("결정 사유"), { target: { value: "정상 소견" } });
  const label = action === "CLOSE_CASE" ? "결과 확정 및 Case 종료" : "결과 확정 및 의뢰 처리";
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(await screen.findByRole("alert")).toHaveTextContent("X-ray 결과 처리에 실패했습니다.");
  expect(screen.getByPlaceholderText("결정 사유")).toHaveValue("정상 소견");
  expect(onCompleted).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: label }));
  await vi.waitFor(() => expect(onCompleted).toHaveBeenCalledWith(expect.objectContaining({ closed: true })));
  expect(JSON.parse(authorizedFetch.mock.calls[1][1].body)).toMatchObject({ assessment: "NEGATIVE", next_action: action, closure_reason: "정상 소견" });
});
