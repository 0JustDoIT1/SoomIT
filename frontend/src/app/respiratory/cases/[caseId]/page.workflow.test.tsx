import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "./page";

const mocks = vi.hoisted(() => ({ authorizedFetch: vi.fn(), showToast: vi.fn(), router: { push: vi.fn() } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ caseId: "case-1" }), useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams() }));
vi.mock("../../_components/respiratory-auth-provider", () => ({ useRespiratoryAuth: () => ({ authorizedFetch: mocks.authorizedFetch }) }));
vi.mock("../../_components/respiratory-toast-provider", () => ({ useRespiratoryToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("./case-chat-panel", () => ({ CaseChatPanel: () => null }));
vi.mock("./case-consultation-request", () => ({ CaseConsultationRequest: () => null }));
vi.mock("./case-dicom-evidence", () => ({ CaseDicomEvidence: () => null }));
vi.mock("./case-ct-segmentation-evidence", () => ({ CaseCtSegmentationEvidence: () => null }));
vi.mock("./case-image-evidence", () => ({ CaseImageEvidence: () => null }));
vi.mock("./case-wsi-evidence", () => ({ CaseWsiEvidence: () => null }));
vi.mock("./pathology-gene-imaging-workstation", () => ({ PathologyGeneReviewPanel: () => null }));
vi.mock("./pdl1-imaging-workstation", () => ({ Pdl1ResultPanel: () => null }));
vi.mock("./result-review-panel", () => ({ ResultReviewPanel: ({ specialistAction }: { specialistAction?: import("react").ReactNode }) => specialistAction ?? null }));
vi.mock("./treatment-decision-panel", () => ({ TreatmentDecisionPanel: () => <div data-testid="treatment-final-plan" /> }));
vi.mock("./evidence-viewer-panel", () => ({ EvidenceViewerPanel: () => null }));

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => vi.clearAllMocks());

it("exposes one CT decision entry and opens future TNM read-only after a suspicious CT", async () => {
  const caseData = { id: "case-1", case_code: "CASE-1", patient_code: "PAT-1", patient_name: "환자", primary_doctor_name: "의사", current_stage: "CT", case_status: "ACTIVE" };
  mocks.authorizedFetch.mockImplementation(async (input: string) => {
    const url = new URL(input).pathname;
    if (url === "/api/doctor/cases/") return response([caseData]);
    if (url === "/api/doctor/cases/case-1/") return response(caseData);
    if (url.endsWith("/clinical-results/")) return response([{ id: "ct-1", workflow_stage: "CT", result_status: "CONFIRMED", result_detail: { ct: { overall_assessment: "NODULE_DETECTED", finding_summary: "추가 평가 필요" } } }]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
  render(<Page />);
  const trigger = await screen.findByRole("button", { name: "결과 입력 및 처리" }, { timeout: 3000 });
  await waitFor(() => expect(trigger).toBeEnabled());
  expect(screen.getAllByRole("button", { name: "결과 입력 및 처리" })).toHaveLength(1);
  fireEvent.click(trigger);
  expect(screen.getByLabelText("종합 판정")).toHaveValue("NODULE_DETECTED");
  expect(screen.getByLabelText("호흡기내과 소견")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  const nav = screen.getByRole("navigation", { name: "Case 진료 정보 메뉴" });
  const tnm = within(nav).getByRole("button", { name: "PET-CT / TNM 병기" });
  expect(tnm).toHaveAttribute("data-access-state", "WAITING");
  fireEvent.click(tnm);
  expect(await screen.findByLabelText("최종 T 선택")).toBeDisabled();
  expect(screen.getByRole("button", { name: "TNM 초안 저장" })).toBeDisabled();
  expect(mocks.authorizedFetch.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
});

it("passes the actual AiResult ID when saving a CT result", async () => {
  const caseData = { id: "case-1", case_code: "CASE-1", patient_code: "PAT-1", patient_name: "환자", primary_doctor_name: "의사", current_stage: "CT", case_status: "ACTIVE" };
  mocks.authorizedFetch.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(input).pathname;
    if (url === "/api/doctor/cases/") return response([caseData]);
    if (url === "/api/doctor/cases/case-1/") return response(caseData);
    if (url.endsWith("/ai-results/")) return response([{ id: "analysis-1", ai_result_id: "ai-result-1", analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_assessment: "NODULE_DETECTED" } } }]);
    if (url.endsWith("/clinical-results/ct/") && init?.method === "POST") return response({ id: "ct-result-1" }, 201);
    if (url.endsWith("/clinical-results/ct/ct-result-1/confirm/")) return response({ id: "ct-result-1", result_status: "CONFIRMED" });
    if (url.endsWith("/workflow-decision/")) return response({ current_stage: "PET_CT_TNM", case_status: "ACTIVE" });
    if (url.endsWith("/clinical-results/")) return response([]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
  render(<Page />);
  const trigger = await screen.findByRole("button", { name: "결과 입력 및 처리" });
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button", { name: "결과 확정 및 PET-CT/TNM 진행" }));
  await waitFor(() => expect(mocks.authorizedFetch.mock.calls.some(([url]) => String(url).endsWith("/clinical-results/ct/"))).toBe(true));
  const saveCall = mocks.authorizedFetch.mock.calls.find(([url, init]) => String(url).endsWith("/clinical-results/ct/") && init?.method === "POST");
  expect(JSON.parse(saveCall![1].body)).toMatchObject({ reviewed_ai_result_id: "ai-result-1" });
});

it("opens the final treatment plan by default when entering TREATMENT", async () => {
  const caseData = { id: "case-1", case_code: "CASE-1", patient_code: "PAT-1", patient_name: "환자", primary_doctor_name: "의사", current_stage: "TREATMENT", case_status: "ACTIVE" };
  mocks.authorizedFetch.mockImplementation(async (input: string) => {
    const url = new URL(input).pathname;
    if (url === "/api/doctor/cases/") return response([caseData]);
    if (url === "/api/doctor/cases/case-1/") return response(caseData);
    if (url.endsWith("/clinical-results/")) return response([]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
  render(<Page />);
  expect(await screen.findByTestId("treatment-final-plan")).toBeInTheDocument();
});

it("refreshes Case, navigation and timeline after TNM finalization without unmounting the page", async () => {
  let advanced = false;
  let resolveCase!: (value: Response) => void;
  const caseData = () => ({ id: "case-1", case_code: "CASE-1", patient_code: "PAT-1", patient_name: "환자", patient_sex: "MALE", patient_birth_date: "1970-01-01", primary_doctor_name: "의사", current_stage: advanced ? "PATHOLOGY_GENE" : "PET_CT_TNM", case_status: "ACTIVE", created_at: "2026-01-01", updated_at: "2026-01-01" });
  const detail = () => ({ t_category: "T2", n_category: "N0", m_category: "M0", stage_group: advanced ? "IIA" : null, evidence: { stage: { stage_group_candidate: "IIA", stage_group_status: "candidate_ready" } } });
  mocks.authorizedFetch.mockImplementation(async (input: string) => {
    const url = new URL(input).pathname;
    if (url.endsWith("/stage/confirm/")) { advanced = true; return response({ id: "tnm-1", result_status: "CONFIRMED", ...detail() }); }
    if (url === "/api/doctor/cases/") return response([caseData()]);
    if (url === "/api/doctor/cases/case-1/") {
      if (advanced) return new Promise<Response>((resolve) => { resolveCase = resolve; });
      return response(caseData());
    }
    if (url.endsWith("/clinical-results/")) return response([{ id: "tnm-1", workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_detail: { tnm: detail() } }]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
  const { container } = render(<Page />);
  const finalize = await screen.findByRole("button", { name: "Stage Group 확정 및 다음 단계 진행" });
  const header = screen.getByRole("region", { name: "현재 환자와 Case 식별 정보" });
  expect(within(header).getByText("PET-CT")).toBeInTheDocument();
  // Both actual page entry points obey the finalization requirement.
  fireEvent.click(screen.getByRole("button", { name: "종료·의뢰 처리" }));
  expect(screen.queryByRole("option", { name: /진행/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  fireEvent.click(finalize);
  await waitFor(() => expect(resolveCase).toBeTypeOf("function"));
  expect(header).toBeInTheDocument();
  expect(screen.queryByText("담당 환자 정보를 불러오는 중입니다.")).not.toBeInTheDocument();
  await act(async () => resolveCase(response(caseData())));
  await waitFor(() => expect(within(header).getByText("조직/유전자")).toBeInTheDocument());
  const nav = screen.getByRole("navigation", { name: "Case 진료 정보 메뉴" });
  expect(within(nav).getByRole("button", { name: "조직/유전자" })).toHaveAttribute("aria-current", "page");
  const timelineCurrent = container.querySelector('[data-stage-state="current"]');
  expect(timelineCurrent?.parentElement).toHaveTextContent("조직/유전자");
  const calls = mocks.authorizedFetch.mock.calls;
  const finalizationIndex = calls.findIndex(([url]) => String(url).endsWith("/stage/confirm/"));
  expect(JSON.parse(calls[finalizationIndex][1].body)).toEqual({ advance_to_next_stage: true });
  expect(calls.slice(finalizationIndex + 1).map(([url]) => new URL(url).pathname)).toEqual([
    "/api/doctor/cases/case-1/", "/api/doctor/cases/case-1/clinical-results/", "/api/doctor/cases/case-1/orders/",
  ]);
});

it("opens prescription exceptions using the existing confirmed treatment result", async () => {
  const caseData = { id: "case-1", case_code: "CASE-1", patient_code: "PAT-1", patient_name: "환자", primary_doctor_name: "의사", current_stage: "PRESCRIPTION", case_status: "ACTIVE" };
  mocks.authorizedFetch.mockImplementation(async (input: string) => {
    const url = new URL(input).pathname;
    if (url.endsWith("/workflow-decision/")) return response({ case_status: "REFERRED_OUT" });
    if (url === "/api/doctor/cases/") return response([caseData]);
    if (url === "/api/doctor/cases/case-1/") return response(caseData);
    if (url.endsWith("/clinical-results/")) return response([{ id: "treatment-1", workflow_stage: "TREATMENT", result_status: "CONFIRMED", result_detail: {} }]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
  render(<Page />);
  const button = await screen.findByRole("button", { name: "결과 입력 및 처리" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(screen.queryByRole("option", { name: "다음 단계 진행" })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Case 종료" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText("결정 사유"), { target: { value: "전원 사유" } });
  fireEvent.click(screen.getByRole("button", { name: "의뢰·전원 처리" }));
  await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith("/respiratory/cases"));
  const call = mocks.authorizedFetch.mock.calls.find(([url]) => String(url).endsWith("/workflow-decision/"));
  expect(JSON.parse(call![1].body)).toMatchObject({ action: "REFERRED_OUT", source_clinical_result_id: "treatment-1", target_stage: null });
});

it("exposes Case closure after a FINAL prescription is loaded", async () => {
  const caseData = { id: "case-1", case_code: "CASE-1", patient_code: "PAT-1", patient_name: "환자", primary_doctor_name: "의사", current_stage: "PRESCRIPTION", case_status: "ACTIVE" };
  mocks.authorizedFetch.mockImplementation(async (input: string) => {
    const url = new URL(input).pathname;
    if (url === "/api/doctor/cases/") return response([caseData]);
    if (url === "/api/doctor/cases/case-1/") return response(caseData);
    if (url.endsWith("/prescriptions/")) return response([{
      id: "rx-1",
      regimen_detail: { id: "regimen-1", regimen_code: "TEST", regimen_name: "테스트 요법", cancer_type: "NSCLC", histology: null, treatment_line: null, cycle_length_days: null, induction_cycles: null, maintenance_yn: false, source: null, source_version: null },
      cycle_number: 1,
      phase: "INDUCTION",
      phase_label: "유도",
      cycle_start_date: "2026-09-19",
      prescription_status: "FINAL",
      prescription_status_label: "최종",
      items: [],
      safety_check_results: [],
      created_at: "2026-09-19T00:00:00Z",
      updated_at: "2026-09-19T00:00:00Z",
    }]);
    if (url.endsWith("/clinical-results/")) return response([{ id: "treatment-1", workflow_stage: "TREATMENT", result_status: "CONFIRMED", result_detail: {} }]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
  render(<Page />);
  const button = await screen.findByRole("button", { name: "결과 입력 및 처리" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(screen.getByRole("option", { name: "Case 종료" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "의뢰·전원" })).toBeInTheDocument();
});
