import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TreatmentDecisionPanel } from "./treatment-decision-panel";

vi.mock("./treatment-evidence-panel", () => ({ TreatmentEvidencePanel: () => null }));
vi.mock("./treatment-opinion-panel", () => ({ TreatmentOpinionPanel: ({ readOnly, selectedRegimenId }: { readOnly?: boolean; selectedRegimenId?: string | null }) => <div data-testid="treatment-opinions" data-read-only={String(Boolean(readOnly))} data-regimen={selectedRegimenId ?? ""} /> }));

const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const candidate = { id: "rule-1", rule_code: "TR01", priority: 1, match_reasons: ["EGFR 일치"], regimen_detail: { id: "regimen-1", regimen_code: "R1", regimen_name: "Osimertinib" } };
const secondCandidate = { id: "rule-2", rule_code: "TR01", priority: 2, match_reasons: ["EGFR 일치"], regimen_detail: { id: "regimen-2", regimen_code: "R2", regimen_name: "Osimertinib + Pemetrexed + Carboplatin" } };
const draft = { treatment_type: "TARGETED_THERAPY", treatment_plan: "EGFR 치료계획", rationale: "EGFR 근거", ai_recommendation_action: "NOT_USED", selected_regimen: "regimen-1", selected_regimen_detail: candidate.regimen_detail, decision_status: "DRAFT", current_stage: "TREATMENT", case_status: "ACTIVE" };
const confirmed = { ...draft, decision_status: "CONFIRMED", current_stage: "PRESCRIPTION" };
const props = { caseId: "case-1", apiBaseUrl: "http://test" };

const renderDraft = (fetch = vi.fn().mockResolvedValueOnce(response([candidate, secondCandidate])).mockResolvedValueOnce(response(draft))) => {
  render(<TreatmentDecisionPanel {...props} authorizedFetch={fetch} />);
  return fetch;
};

it("shows regimen candidates in Step 1", async () => {
  renderDraft();
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  expect(screen.getByText("1. 치료요법 선택 및 계획")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Osimertinib \(R1\)/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Pemetrexed/ })).toBeInTheDocument();
  expect(screen.queryByText("치료 차수")).not.toBeInTheDocument();
});

it("blocks Step 2 for drug treatment until a regimen is selected", async () => {
  renderDraft(vi.fn().mockResolvedValueOnce(response([candidate, secondCandidate])).mockResolvedValueOnce(response({ ...draft, selected_regimen: null, selected_regimen_detail: null })));
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  expect(screen.getByText(/Regimen을 선택해야 다음 단계/)).toBeInTheDocument();
});

it("saves Step 1 and shows the summary plus opinion panels in Step 2", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response([candidate, secondCandidate]))
    .mockResolvedValueOnce(response({ ...draft, selected_regimen: null, selected_regimen_detail: null }))
    .mockResolvedValueOnce(response(draft))
    .mockResolvedValueOnce(response([candidate, secondCandidate]));
  renderDraft(fetch);
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  fireEvent.click(screen.getByRole("button", { name: /Osimertinib \(R1\)/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(await screen.findByText("2. 치료 소견 및 확정")).toBeInTheDocument();
  expect(screen.getByLabelText("치료계획 요약")).toHaveTextContent("Osimertinib (R1)");
  expect(screen.getByTestId("treatment-opinions")).toHaveAttribute("data-regimen", "regimen-1");
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({ selected_regimen: "regimen-1", treatment_type: "TARGETED_THERAPY" });
});

it("keeps Step 1 values when returning from Step 2", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response({ ...draft, selected_regimen: null, selected_regimen_detail: null })).mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response([candidate]));
  renderDraft(fetch);
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  fireEvent.click(screen.getByRole("button", { name: /Osimertinib \(R1\)/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await screen.findByText("2. 치료 소견 및 확정");
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  expect(screen.getByLabelText("치료 계획")).toHaveValue("EGFR 치료계획");
  expect(screen.getByRole("button", { name: /Osimertinib \(R1\)/ })).toBeInTheDocument();
});

it("keeps the explicit non-drug branch without requiring a regimen", async () => {
  const nonDrug = { ...draft, treatment_type: "SURGERY", treatment_plan: "수술 계획", selected_regimen: null, selected_regimen_detail: null };
  const fetch = vi.fn().mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response(nonDrug)).mockResolvedValueOnce(response(nonDrug)).mockResolvedValueOnce(response([candidate]));
  renderDraft(fetch);
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  fireEvent.change(screen.getByLabelText("치료 유형"), { target: { value: "SURGERY" } });
  fireEvent.change(screen.getByLabelText("치료 계획"), { target: { value: "수술 계획" } });
  expect(screen.getByText("선택한 비약물 치료는 Regimen과 약물 처방이 필요하지 않습니다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다음" })).toBeEnabled();
});

it("opens a confirmed treatment as read-only without re-entering Step 1", async () => {
  renderDraft(vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(confirmed)));
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정 보기" }));
  expect(screen.queryByLabelText("치료 결정 진행 단계")).not.toBeInTheDocument();
  expect(screen.getByTestId("treatment-opinions")).toHaveAttribute("data-read-only", "true");
  expect(screen.queryByRole("button", { name: "최종 확정" })).not.toBeInTheDocument();
});

it("confirms through the existing API after Step 2", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response({ ...draft, selected_regimen: null, selected_regimen_detail: null })).mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response(confirmed));
  const onTreatmentConfirmed = vi.fn();
  render(<TreatmentDecisionPanel {...props} authorizedFetch={fetch} onTreatmentConfirmed={onTreatmentConfirmed} />);
  fireEvent.click(await screen.findByRole("button", { name: "치료 결정" }));
  fireEvent.click(screen.getByRole("button", { name: /Osimertinib \(R1\)/ }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  await screen.findByText("2. 치료 소견 및 확정");
  fireEvent.click(screen.getByRole("button", { name: "최종 확정" }));
  await waitFor(() => expect(onTreatmentConfirmed).toHaveBeenCalledWith(expect.objectContaining({ decision_status: "CONFIRMED" })));
  expect(fetch.mock.calls[5][0]).toBe("http://test/api/doctor/cases/case-1/treatment-decision/confirm/");
});
