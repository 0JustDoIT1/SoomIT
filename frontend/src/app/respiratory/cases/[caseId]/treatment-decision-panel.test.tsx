import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TreatmentDecisionPanel } from "./treatment-decision-panel";

vi.mock("./treatment-evidence-panel", () => ({ TreatmentEvidencePanel: () => null }));
vi.mock("./treatment-opinion-panel", () => ({ TreatmentOpinionPanel: () => null }));
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const initial = { treatment_type: "OBSERVATION", treatment_plan: "관찰", ai_recommendation_action: "NOT_USED", decision_status: "DRAFT", current_stage: "TREATMENT", case_status: "ACTIVE" };
const confirmed = { ...initial, decision_status: "CONFIRMED", current_stage: "PRESCRIPTION" };
const props = { caseId: "case-1", apiBaseUrl: "http://test" };
const setupFetch = () => vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(initial));

it("allows reviewing a waiting treatment stage but does not allow editing or submission", async () => {
  const authorizedFetch = setupFetch();
  render(<TreatmentDecisionPanel {...props} actionable={false} authorizedFetch={authorizedFetch} />);
  await screen.findByText("관찰");
  expect(screen.queryByRole("button", { name: "결과 입력 및 처리" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("관찰")).toBeInTheDocument();
  expect(authorizedFetch).toHaveBeenCalledTimes(2);
});

it("restores a confirmed treatment plan as read-only after entering prescription", async () => {
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response(confirmed));

  render(<TreatmentDecisionPanel {...props} actionable={false} authorizedFetch={authorizedFetch} />);

  expect(await screen.findByText("치료계획 확정 완료")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "결과 입력 및 처리" })).not.toBeInTheDocument();
});

it("saves the current treatment plan before confirming and only notifies completion once", async () => {
  let resolveConfirm!: (value: Response) => void;
  const authorizedFetch = setupFetch().mockResolvedValueOnce(response(initial))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveConfirm = resolve; }));
  const onTreatmentChanged = vi.fn();
  const onTreatmentConfirmed = vi.fn();
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} onTreatmentChanged={onTreatmentChanged} onTreatmentConfirmed={onTreatmentConfirmed} />);
  fireEvent.click(await screen.findByRole("button", { name: "결과 입력 및 처리" }));
  fireEvent.change(await screen.findByLabelText("치료 계획"), { target: { value: "최신 계획" } });
  fireEvent.click(screen.getByRole("button", { name: "치료계획 확정 및 처방 진행" }));
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(4));
  expect(onTreatmentChanged).not.toHaveBeenCalled();
  expect(onTreatmentConfirmed).not.toHaveBeenCalled();
  expect(authorizedFetch.mock.calls[2][0]).toBe("http://test/api/doctor/cases/case-1/treatment-decision/");
  expect(JSON.parse(authorizedFetch.mock.calls[2][1].body)).toMatchObject({ treatment_plan: "최신 계획", treatment_type: "OBSERVATION" });
  expect(authorizedFetch.mock.calls[3][0]).toBe("http://test/api/doctor/cases/case-1/treatment-decision/confirm/");
  await act(async () => resolveConfirm(response(confirmed)));
  expect(onTreatmentConfirmed).toHaveBeenCalledWith(expect.objectContaining({
    decision_status: "CONFIRMED",
    current_stage: "PRESCRIPTION",
    case_status: "ACTIVE",
  }));
  expect(onTreatmentChanged).not.toHaveBeenCalled();
});

it("keeps the panel and error after confirmation fails and allows a successful retry", async () => {
  const authorizedFetch = setupFetch()
    .mockResolvedValueOnce(response(initial))
    .mockResolvedValueOnce(response({ detail: "확정 실패" }, 400))
    .mockResolvedValueOnce(response(initial))
    .mockResolvedValueOnce(response(confirmed));
  const onTreatmentChanged = vi.fn();
  const onTreatmentConfirmed = vi.fn();
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} onTreatmentChanged={onTreatmentChanged} onTreatmentConfirmed={onTreatmentConfirmed} />);
  fireEvent.click(await screen.findByRole("button", { name: "결과 입력 및 처리" }));
  const plan = await screen.findByLabelText("치료 계획");
  fireEvent.click(screen.getByRole("button", { name: "치료계획 확정 및 처방 진행" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("치료계획은 저장되었지만 확정에 실패했습니다.");
  expect(plan).toBeInTheDocument();
  expect(plan).toHaveValue("관찰");
  expect(onTreatmentChanged).not.toHaveBeenCalled();
  expect(onTreatmentConfirmed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "치료계획 확정 및 처방 진행" }));
  await waitFor(() => expect(onTreatmentConfirmed).toHaveBeenCalledOnce());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(authorizedFetch.mock.calls.slice(2).map(([url]) => url)).toEqual([
    "http://test/api/doctor/cases/case-1/treatment-decision/",
    "http://test/api/doctor/cases/case-1/treatment-decision/confirm/",
    "http://test/api/doctor/cases/case-1/treatment-decision/",
    "http://test/api/doctor/cases/case-1/treatment-decision/confirm/",
  ]);
});

it("does not confirm or refresh after a failed save", async () => {
  const authorizedFetch = setupFetch().mockResolvedValueOnce(response({ detail: "저장 실패" }, 400));
  const onTreatmentConfirmed = vi.fn();
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} onTreatmentConfirmed={onTreatmentConfirmed} />);
  fireEvent.click(await screen.findByRole("button", { name: "결과 입력 및 처리" }));
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 확정 및 처방 진행" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("치료계획 저장에 실패했습니다.");
  expect(authorizedFetch).toHaveBeenCalledTimes(3);
  expect(onTreatmentConfirmed).not.toHaveBeenCalled();
});

it("prevents duplicate submissions across both treatment requests", async () => {
  let resolveSave!: (value: Response) => void;
  const authorizedFetch = setupFetch().mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSave = resolve; }))
    .mockResolvedValueOnce(response(initial));
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} />);
  fireEvent.click(await screen.findByRole("button", { name: "결과 입력 및 처리" }));
  const button = await screen.findByRole("button", { name: "치료계획 확정 및 처방 진행" });
  act(() => { button.click(); button.click(); });
  expect(authorizedFetch).toHaveBeenCalledTimes(3);
  expect(button).toBeDisabled();
  await act(async () => resolveSave(response(initial)));
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(4));
});
