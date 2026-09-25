import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TreatmentDecisionPanel } from "./treatment-decision-panel";

vi.mock("./treatment-evidence-panel", () => ({ TreatmentEvidencePanel: () => null }));
vi.mock("./treatment-opinion-panel", () => ({ TreatmentOpinionPanel: ({ readOnly, selectedRegimenId, treatmentType, treatmentPlan }: { readOnly?: boolean; selectedRegimenId?: string | null; treatmentType?: string; treatmentPlan?: string }) => <div data-testid="treatment-opinions" data-read-only={String(Boolean(readOnly))} data-regimen={selectedRegimenId ?? ""} data-treatment-type={treatmentType ?? ""} data-treatment-plan={treatmentPlan ?? ""} /> }));
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const initial = { treatment_type: "OBSERVATION", treatment_plan: "관찰", ai_recommendation_action: "NOT_USED", decision_status: "DRAFT", current_stage: "TREATMENT", case_status: "ACTIVE" };
const confirmed = {
  ...initial,
  decision_status: "CONFIRMED",
  current_stage: "PRESCRIPTION",
  treatment_type: "TARGETED_THERAPY",
  treatment_line: "1L",
  treatment_plan: "EGFR 기반 Osimertinib 치료계획",
  targeted_therapy_plan: "EGFR 표적치료 계획",
  rationale: "EGFR 변이 기반 결정 근거",
  selected_regimen: "regimen-1",
  selected_regimen_detail: { id: "regimen-1", regimen_code: "R1", regimen_name: "Osimertinib" },
};
const props = { caseId: "case-1", apiBaseUrl: "http://test" };
const setupFetch = () => vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(initial));

it("allows reviewing a waiting treatment stage but does not allow editing or submission", async () => {
  const authorizedFetch = setupFetch();
  render(<TreatmentDecisionPanel {...props} actionable={false} authorizedFetch={authorizedFetch} />);
  await screen.findByText("관찰");
  expect(screen.queryByRole("button", { name: "치료 결정" })).not.toBeInTheDocument();
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
  expect(screen.getByRole("button", { name: "치료 결정 보기" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "치료 결정 보기" }));
  expect(screen.getByTestId("treatment-opinions")).toHaveAttribute("data-read-only", "true");
  expect(screen.getByTestId("treatment-opinions")).toHaveAttribute("data-regimen", "regimen-1");
  expect(screen.getByLabelText("치료 계획")).toBeDisabled();
  expect(screen.getByLabelText("치료 계획")).toHaveValue("EGFR 기반 Osimertinib 치료계획");
  expect(screen.getByLabelText("치료 차수")).toBeDisabled();
  expect(screen.getByLabelText("치료 차수")).toHaveValue("1L");
  expect(screen.getByLabelText(/^표적치료 계획/)).toHaveValue("EGFR 표적치료 계획");
  expect(screen.getByLabelText(/^결정 근거/)).toHaveValue("EGFR 변이 기반 결정 근거");
  expect(screen.getAllByText("Osimertinib (R1)").length).toBeGreaterThan(0);
  expect(screen.queryByText("현재 조건과 일치하는 치료요법 후보가 없습니다.")).not.toBeInTheDocument();
  expect(screen.queryByText(/Regimen 선택 필수/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "저장" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "치료계획 확정 및 처방 진행" })).not.toBeInTheDocument();
});

it("restores a confirmed treatment decision even when candidate loading fails", async () => {
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response({ detail: "후보 조회 실패" }, 500))
    .mockResolvedValueOnce(response(confirmed));

  render(<TreatmentDecisionPanel {...props} actionable={false} authorizedFetch={authorizedFetch} />);

  expect(await screen.findByText("치료계획 확정 완료")).toBeInTheDocument();
  expect(screen.getAllByText("Osimertinib (R1)").length).toBeGreaterThan(0);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps opinions inside the decision modal and discards unsaved treatment edits on cancel", async () => {
  const authorizedFetch = setupFetch();
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} />);

  await screen.findByText("관찰");
  expect(screen.queryByTestId("treatment-opinions")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "치료 결정" }));
  expect(screen.getByTestId("treatment-opinions")).toHaveAttribute("data-read-only", "false");
  fireEvent.change(screen.getByLabelText("치료 계획"), { target: { value: "저장하지 않은 변경" } });
  fireEvent.click(screen.getByRole("button", { name: "취소" }));

  fireEvent.click(screen.getByRole("button", { name: "치료 결정" }));
  expect(screen.getByLabelText("치료 계획")).toHaveValue("관찰");
  fireEvent.change(screen.getByLabelText("치료 계획"), { target: { value: "ESC로 버릴 변경" } });
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

  fireEvent.click(screen.getByRole("button", { name: "치료 결정" }));
  expect(screen.getByLabelText("치료 계획")).toHaveValue("관찰");
  fireEvent.change(screen.getByLabelText("치료 계획"), { target: { value: "X로 버릴 변경" } });
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));

  fireEvent.click(screen.getByRole("button", { name: "치료 결정" }));
  expect(screen.getByLabelText("치료 계획")).toHaveValue("관찰");
});

it("saves the current treatment plan before confirming and only notifies completion once", async () => {
  let resolveConfirm!: (value: Response) => void;
  const authorizedFetch = setupFetch().mockResolvedValueOnce(response(initial))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveConfirm = resolve; }));
  const onTreatmentChanged = vi.fn();
  const onTreatmentConfirmed = vi.fn();
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} onTreatmentChanged={onTreatmentChanged} onTreatmentConfirmed={onTreatmentConfirmed} />);
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
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

it("saves a treatment DRAFT without confirming and reports it to the case workspace", async () => {
  const authorizedFetch = setupFetch()
    .mockResolvedValueOnce(response({ ...initial, treatment_plan: "저장된 초안" }))
    .mockResolvedValueOnce(response([]));
  const onTreatmentChanged = vi.fn();
  const onTreatmentConfirmed = vi.fn();
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} onTreatmentChanged={onTreatmentChanged} onTreatmentConfirmed={onTreatmentConfirmed} />);

  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  fireEvent.change(screen.getByLabelText("치료 계획"), { target: { value: "저장된 초안" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  expect(await screen.findByRole("status")).toHaveTextContent("치료계획 DRAFT가 저장되었습니다.");
  expect(authorizedFetch).toHaveBeenCalledTimes(4);
  expect(onTreatmentChanged).toHaveBeenCalledWith(expect.objectContaining({
    decision_status: "DRAFT",
    treatment_plan: "저장된 초안",
  }), false);
  expect(onTreatmentConfirmed).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("clears a drug regimen when the draft changes to non-drug treatment", async () => {
  const candidate = { id: "rule-1", match_reasons: [], regimen_detail: { id: "regimen-1", regimen_code: "R1", regimen_name: "Regimen 1" } };
  const drugDraft = { ...initial, treatment_type: "CHEMOTHERAPY", selected_regimen: "regimen-1", selected_regimen_detail: candidate.regimen_detail };
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response([candidate]))
    .mockResolvedValueOnce(response(drugDraft))
    .mockResolvedValueOnce(response({ ...initial, selected_regimen: null, selected_regimen_detail: null }))
    .mockResolvedValueOnce(response([]));
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} />);

  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  fireEvent.change(screen.getByLabelText("치료 유형"), { target: { value: "SURGERY" } });
  expect(screen.getByText("선택한 비약물 치료는 Regimen과 약물 처방이 필요하지 않습니다.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(4));
  expect(JSON.parse(authorizedFetch.mock.calls[2][1].body)).toMatchObject({
    treatment_type: "SURGERY",
    selected_regimen: null,
  });
});

it("does not treat an unselected treatment type as non-drug treatment", async () => {
  const candidate = { id: "rule-1", match_reasons: [], regimen_detail: { id: "regimen-1", regimen_code: "R1", regimen_name: "Osimertinib" } };
  const secondCandidate = { id: "rule-2", match_reasons: [], regimen_detail: { id: "regimen-2", regimen_code: "R2", regimen_name: "Osimertinib + Pemetrexed + Carboplatin" } };
  const emptyTypeDraft = { ...initial, treatment_type: "", treatment_plan: "" };
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response([candidate, secondCandidate]))
    .mockResolvedValueOnce(response(emptyTypeDraft));
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} />);

  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  expect(screen.queryByText("선택한 비약물 치료는 Regimen과 약물 처방이 필요하지 않습니다.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Osimertinib \(R1\)/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Pemetrexed/ })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("치료 유형"), { target: { value: "TARGETED_THERAPY" } });
  expect(screen.getByRole("button", { name: /^Osimertinib \(R1\)/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Pemetrexed/ })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("치료 유형"), { target: { value: "SURGERY" } });
  expect(screen.getByText("선택한 비약물 치료는 Regimen과 약물 처방이 필요하지 않습니다.")).toBeInTheDocument();
});

it("persists a physician-selected treatment line before exposing TR02 candidates", async () => {
  const r3 = { id: "rule-3", rule_code: "TR02", priority: 1, match_reasons: ["치료 차수 일치: 1L"], regimen_detail: { id: "regimen-3", regimen_code: "R3", regimen_name: "Pembrolizumab" } };
  const lineDraft = { ...initial, treatment_type: "IMMUNOTHERAPY", treatment_plan: "면역치료 계획", treatment_line: null };
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response(lineDraft))
    .mockResolvedValueOnce(response({ ...lineDraft, treatment_line: "1L" }))
    .mockResolvedValueOnce(response([r3]));
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} />);

  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  fireEvent.change(screen.getByLabelText("치료 차수"), { target: { value: "1L" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(4));
  expect(JSON.parse(authorizedFetch.mock.calls[2][1].body)).toMatchObject({
    treatment_line: "1L",
    selected_regimen: null,
  });
  expect((await screen.findAllByText("Pembrolizumab")).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "치료계획 확정 및 처방 진행" })).toBeDisabled();
});

it("passes the currently selected DRAFT regimen and plan to the AI opinion panel", async () => {
  const candidate = { id: "rule-1", match_reasons: [], regimen_detail: { id: "regimen-1", regimen_code: "R1", regimen_name: "Regimen 1" } };
  const drugDraft = { ...initial, treatment_type: "CHEMOTHERAPY", treatment_plan: "DRAFT 계획", selected_regimen: "regimen-1", selected_regimen_detail: candidate.regimen_detail };
  const authorizedFetch = vi.fn()
    .mockResolvedValueOnce(response([candidate]))
    .mockResolvedValueOnce(response(drugDraft));
  render(<TreatmentDecisionPanel {...props} authorizedFetch={authorizedFetch} />);

  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  expect(screen.getByTestId("treatment-opinions")).toHaveAttribute("data-regimen", "regimen-1");
  expect(screen.getByTestId("treatment-opinions")).toHaveAttribute("data-treatment-type", "CHEMOTHERAPY");
  expect(screen.getByTestId("treatment-opinions")).toHaveAttribute("data-treatment-plan", "DRAFT 계획");
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
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  const plan = await screen.findByLabelText("치료 계획");
  fireEvent.click(screen.getByRole("button", { name: "치료계획 확정 및 처방 진행" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("치료계획은 저장되었지만 확정에 실패했습니다.");
  expect(plan).toBeInTheDocument();
  expect(plan).toHaveValue("관찰");
  expect(onTreatmentChanged).toHaveBeenCalledWith(expect.objectContaining({ decision_status: "DRAFT" }), false);
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
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
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
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  const button = await screen.findByRole("button", { name: "치료계획 확정 및 처방 진행" });
  act(() => { button.click(); button.click(); });
  expect(authorizedFetch).toHaveBeenCalledTimes(3);
  expect(button).toBeDisabled();
  await act(async () => resolveSave(response(initial)));
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(4));
});
