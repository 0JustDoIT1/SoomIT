import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  expect(screen.getByText("1. 치료요법 선택 및 계획")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Osimertinib \(R1\)/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Pemetrexed/ })).toBeInTheDocument();
  expect(screen.queryByText("치료 차수")).not.toBeInTheDocument();
});

it("shows multi-driver clinical review guidance without selecting a candidate", async () => {
  const egfr = { ...candidate, matched_drivers: [{ gene_symbol: "EGFR", alteration_codes: ["EGFR_EX19_DEL"] }] };
  const braf = { ...secondCandidate, id: "rule-braf", rule_code: "TR04", matched_drivers: [{ gene_symbol: "BRAF", alteration_codes: ["BRAF_V600E"] }] };
  renderDraft(vi.fn().mockResolvedValueOnce(response([egfr, braf])).mockResolvedValueOnce(response({ ...draft, selected_regimen: null, selected_regimen_detail: null })));

  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));

  expect(screen.getByText("복수의 actionable driver가 확인되었습니다.")).toBeInTheDocument();
  expect(screen.getByText("Driver: EGFR EGFR_EX19_DEL · BRAF BRAF_V600E")).toBeInTheDocument();
  expect(screen.getByText("Regimen을 선택해주세요")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "저장하고 다음 단계" })).toBeDisabled();
});

it("blocks Step 2 for drug treatment until a regimen is selected", async () => {
  renderDraft(vi.fn().mockResolvedValueOnce(response([candidate, secondCandidate])).mockResolvedValueOnce(response({ ...draft, selected_regimen: null, selected_regimen_detail: null })));
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  expect(screen.getByRole("button", { name: "저장하고 다음 단계" })).toBeDisabled();
  expect(screen.getByLabelText("치료 계획")).toBeDisabled();
  expect(screen.getByLabelText(/표적치료 계획/)).toBeDisabled();
  expect(screen.getByLabelText(/결정 근거/)).toBeDisabled();
  expect(screen.getByText(/Regimen을 선택해야 다음 단계/)).toBeInTheDocument();
});

it("hides the selection prompt for zero candidates and keeps drug plans locked even with a saved selection", async () => {
  renderDraft(vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(draft)));
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  expect(screen.getByText("현재 선택 가능한 Regimen 후보가 없습니다.")).toBeVisible();
  expect(screen.queryByText("Regimen을 선택해주세요")).not.toBeInTheDocument();
  expect(screen.getByLabelText("치료 계획")).toBeDisabled();
  expect(screen.getByRole("button", { name: "임시 저장" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "저장하고 다음 단계" })).toBeDisabled();
});

it.each(["HTTP", "NETWORK", "INVALID_JSON"])("keeps %s candidate errors distinct from zero candidates after reopening", async (failure) => {
  const fetch = vi.fn();
  if (failure === "NETWORK") fetch.mockRejectedValueOnce(new Error("offline"));
  else if (failure === "INVALID_JSON") fetch.mockResolvedValueOnce(new Response("invalid", { status: 200 }));
  else fetch.mockResolvedValueOnce(response({}, 503));
  fetch.mockResolvedValueOnce(response(draft));
  renderDraft(fetch);
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Regimen 후보를 불러오지 못했습니다.");
  expect(screen.queryByText("현재 선택 가능한 Regimen 후보가 없습니다.")).not.toBeInTheDocument();
  expect(screen.getByLabelText("치료 계획")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  fireEvent.click(screen.getByRole("button", { name: "치료계획 계속 작성 →" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Regimen 후보를 불러오지 못했습니다.");
});

it("starts saved additional plans collapsed and preserves their values when opened", async () => {
  renderDraft();
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  const summary = screen.getByText("추가 계획 및 결정 근거 (선택) · 작성됨");
  expect(summary.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(summary);
  await waitFor(() => expect(summary.closest("details")).toHaveAttribute("open"));
  expect(screen.getByLabelText(/결정 근거/)).toHaveValue("EGFR 근거");
});

it("does not show zero candidates when both initial requests fail", async () => {
  renderDraft(vi.fn().mockRejectedValue(new Error("offline")));
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 검토하기 →" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Regimen 후보를 불러오지 못했습니다.");
  expect(screen.queryByText("현재 선택 가능한 Regimen 후보가 없습니다.")).not.toBeInTheDocument();
});

it.each(["SURGERY", "RADIATION", "OBSERVATION", "SUPPORTIVE_CARE", "OTHER"])("allows %s plans and optional details without candidates", async (treatmentType) => {
  renderDraft(vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response({ ...draft, treatment_type: treatmentType, selected_regimen: null, selected_regimen_detail: null })));
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  expect(screen.getByLabelText("치료 계획")).toBeEnabled();
  const summary = screen.getByText("추가 계획 및 결정 근거 (선택) · 작성됨");
  expect(summary).toHaveAttribute("aria-disabled", "false");
  expect(screen.getByRole("button", { name: "저장하고 다음 단계" })).toBeEnabled();
});

it("reports a candidate refresh error without enabling confirmation using stale candidates", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response(draft))
    .mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response({}, 503));
  renderDraft(fetch);
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Regimen 후보를 불러오지 못했습니다.");
  expect(screen.queryByText("현재 선택 가능한 Regimen 후보가 없습니다.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "저장하고 다음 단계" })).toBeDisabled();
});

it("saves Step 1 and shows the summary plus opinion panels in Step 2", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response([candidate, secondCandidate]))
    .mockResolvedValueOnce(response({ ...draft, selected_regimen: null, selected_regimen_detail: null }))
    .mockResolvedValueOnce(response(draft))
    .mockResolvedValueOnce(response([candidate, secondCandidate]));
  renderDraft(fetch);
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  fireEvent.click(screen.getByRole("button", { name: /Osimertinib \(R1\)/ }));
  fireEvent.click(screen.getByRole("button", { name: "저장하고 다음 단계" }));
  expect(await screen.findByText("2. 종합 소견 및 확정")).toBeInTheDocument();
  expect(await screen.findByLabelText("치료계획 요약")).toHaveTextContent("Osimertinib (R1)");
  expect(screen.getByTestId("treatment-opinions")).toHaveAttribute("data-regimen", "regimen-1");
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({ selected_regimen: "regimen-1", treatment_type: "TARGETED_THERAPY" });
});

it("keeps Step 1 values when returning from Step 2", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response({ ...draft, selected_regimen: null, selected_regimen_detail: null })).mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response([candidate]));
  renderDraft(fetch);
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  fireEvent.click(screen.getByRole("button", { name: /Osimertinib \(R1\)/ }));
  fireEvent.click(screen.getByRole("button", { name: "저장하고 다음 단계" }));
  const previousButton = await screen.findByRole("button", { name: "이전" });
  await waitFor(() => expect(previousButton).toBeEnabled());
  fireEvent.click(previousButton);
  expect(screen.getByLabelText("치료 계획")).toHaveValue("EGFR 치료계획");
  expect(screen.getByRole("button", { name: /Osimertinib \(R1\)/ })).toBeInTheDocument();
});

it("keeps the explicit non-drug branch without requiring a regimen", async () => {
  const nonDrug = { ...draft, treatment_type: "SURGERY", treatment_plan: "수술 계획", selected_regimen: null, selected_regimen_detail: null };
  const fetch = vi.fn().mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response(nonDrug)).mockResolvedValueOnce(response(nonDrug)).mockResolvedValueOnce(response([candidate]));
  renderDraft(fetch);
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  fireEvent.change(screen.getByLabelText("치료 유형"), { target: { value: "SURGERY" } });
  fireEvent.change(screen.getByLabelText("치료 계획"), { target: { value: "수술 계획" } });
  expect(screen.getByText("선택한 비약물 치료는 Regimen과 약물 처방이 필요하지 않습니다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "저장하고 다음 단계" })).toBeEnabled();
});

it("opens a confirmed treatment as read-only without re-entering Step 1", async () => {
  renderDraft(vi.fn().mockResolvedValueOnce(response([])).mockResolvedValueOnce(response(confirmed)));
  fireEvent.click(await screen.findByRole("button", { name: "확정된 치료계획 보기" }));
  expect(screen.queryByLabelText("치료 결정 진행 단계")).not.toBeInTheDocument();
  expect(screen.getByTestId("treatment-opinions")).toHaveAttribute("data-read-only", "true");
  expect(screen.queryByRole("button", { name: "치료계획 확정" })).not.toBeInTheDocument();
});

it("confirms through the existing API after Step 2", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response({ ...draft, selected_regimen: null, selected_regimen_detail: null })).mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response(confirmed));
  const onTreatmentConfirmed = vi.fn();
  render(<TreatmentDecisionPanel {...props} authorizedFetch={fetch} onTreatmentConfirmed={onTreatmentConfirmed} />);
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  fireEvent.click(screen.getByRole("button", { name: /Osimertinib \(R1\)/ }));
  fireEvent.click(screen.getByRole("button", { name: "저장하고 다음 단계" }));
  const confirmButton = await screen.findByRole("button", { name: "치료계획 확정" });
  await waitFor(() => expect(confirmButton).toBeEnabled());
  fireEvent.click(confirmButton);
  await waitFor(() => expect(onTreatmentConfirmed).toHaveBeenCalledWith(expect.objectContaining({ decision_status: "CONFIRMED" })));
  expect(fetch.mock.calls[5][0]).toBe("http://test/api/doctor/cases/case-1/treatment-decision/confirm/");
});

it("explains when an unresolved actionable alteration caused an empty candidate list", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(response({ ...draft, selected_regimen: null, selected_regimen_detail: null }));
  render(
    <TreatmentDecisionPanel
      {...props}
      authorizedFetch={fetch}
      noCandidateMessage="EGFR 양성 결과의 세부 변이가 확정되지 않아 표적치료 Regimen을 추천할 수 없습니다."
    />,
  );

  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  expect(screen.getByText(/EGFR 양성 결과의 세부 변이가 확정되지 않아/)).toBeInTheDocument();
});

it("uses a review CTA before the first treatment decision", async () => {
  renderDraft(vi.fn().mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response({}, 404)));
  expect(await screen.findByRole("button", { name: "치료계획 검토하기 →" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "치료계획 검토하기 →" }));
  const dialog = within(screen.getByRole("dialog"));
  const candidateButton = dialog.getByRole("button", { name: /Osimertinib \(R1\)/ });
  expect(candidateButton).toBeVisible();
  expect(candidateButton.closest("details")).toBeNull();
  expect(candidateButton.compareDocumentPosition(dialog.getByLabelText("치료 계획")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(dialog.getByText("Regimen을 선택해주세요")).toBeInTheDocument();
  fireEvent.click(candidateButton);
  expect(candidateButton).toHaveAttribute("aria-pressed", "true");
  expect(dialog.getByText("선택된 Regimen: R1 Osimertinib")).toBeInTheDocument();
});

it("keeps a rejected non-candidate draft editable without confirming or navigating", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response([candidate, secondCandidate])).mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response({ detail: "현재 후보에 포함되지 않은 Regimen입니다." }, 400));
  const onTreatmentConfirmed = vi.fn();
  const onOpenPrescription = vi.fn();
  render(<TreatmentDecisionPanel {...props} authorizedFetch={fetch} onTreatmentConfirmed={onTreatmentConfirmed} onOpenPrescription={onOpenPrescription} />);
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  fireEvent.click(screen.getByRole("button", { name: "저장하고 다음 단계" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("현재 후보에 포함되지 않은 Regimen입니다.");
  expect(screen.getByLabelText("치료 계획")).toHaveValue(draft.treatment_plan);
  expect(screen.queryByRole("button", { name: "치료계획 확정" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "처방 작성으로 이동 →" })).not.toBeInTheDocument();
  expect(onTreatmentConfirmed).not.toHaveBeenCalled();
  expect(onOpenPrescription).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("keeps the existing duplicate-confirm guard while a confirmation is pending", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response(draft))
    .mockResolvedValueOnce(response(draft)).mockResolvedValueOnce(response([candidate]))
    .mockResolvedValueOnce(response(draft)).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  renderDraft(fetch);
  fireEvent.click(await screen.findByRole("button", { name: "치료계획 계속 작성 →" }));
  fireEvent.click(screen.getByRole("button", { name: "저장하고 다음 단계" }));
  const button = await screen.findByRole("button", { name: "치료계획 확정" });
  act(() => { button.click(); button.click(); });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
  expect(button).toBeDisabled();
  await act(async () => finish(response(confirmed)));
  expect(await screen.findByRole("button", { name: "확정된 치료계획 보기" })).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(6);
});

it("makes prescription the primary next action after confirmation", async () => {
  const onOpenPrescription = vi.fn();
  render(<TreatmentDecisionPanel {...props} authorizedFetch={vi.fn().mockResolvedValueOnce(response([candidate])).mockResolvedValueOnce(response(confirmed))} onOpenPrescription={onOpenPrescription} />);

  expect(await screen.findByText("최종 확정")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "확정된 치료계획 보기" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "처방 작성으로 이동 →" }));
  expect(onOpenPrescription).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("치료계획·처방 진행 상태")).toHaveTextContent("✓ 치료계획 확정");
});
