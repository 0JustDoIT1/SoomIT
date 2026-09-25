import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "./page";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
  showToast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
  router: { push: vi.fn() },
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ caseId: "case-1" }), useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams() }));
vi.mock("../../_components/respiratory-auth-provider", () => ({ useRespiratoryAuth: () => ({ authorizedFetch: mocks.authorizedFetch }) }));
vi.mock("@/components/ui/toast/toast", () => ({ showToast: mocks.showToast }));
vi.mock("./case-chat-panel", () => ({ CaseChatPanel: () => null }));
vi.mock("./case-consultation-request", () => ({ CaseConsultationRequest: () => null }));
vi.mock("./case-dicom-evidence", () => ({ CaseDicomEvidence: () => null }));
vi.mock("./case-ct-segmentation-evidence", () => ({ CaseCtSegmentationEvidence: () => null }));
vi.mock("./case-image-evidence", () => ({ CaseImageEvidence: () => null }));
vi.mock("./case-wsi-evidence", () => ({ CaseWsiEvidence: () => null }));
vi.mock("./pathology-gene-imaging-workstation", () => ({ PathologyGeneReviewPanel: () => null }));
vi.mock("./pdl1-imaging-workstation", () => ({ Pdl1ResultPanel: () => null }));
vi.mock("./result-review-panel", () => ({
  ResultReviewPanel: ({ stage, specialistAction }: { stage: string; specialistAction?: import("react").ReactNode }) => (
    <div data-testid={`result-panel-${stage}`}>{specialistAction}</div>
  ),
  WorkflowStatusFlow: () => null,
}));
vi.mock("./treatment-decision-panel", () => ({
  TreatmentDecisionPanel: ({ onTreatmentConfirmed }: { onTreatmentConfirmed?: (decision: { current_stage?: string; case_status?: string }) => void }) => (
    <div data-testid="treatment-final-plan">
      <button type="button" onClick={() => onTreatmentConfirmed?.({ current_stage: "PRESCRIPTION", case_status: "ACTIVE" })}>
        치료계획 확정 테스트
      </button>
    </div>
  ),
}));
vi.mock("./evidence-viewer-panel", () => ({ EvidenceViewerPanel: () => null }));

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const baseCase = (stage: string) => ({ id: "case-1", case_code: "CASE-1", patient_code: "PAT-1", patient_name: "환자", primary_doctor_name: "의사", current_stage: stage, case_status: "ACTIVE" });

beforeEach(() => vi.clearAllMocks());

it("treats effect cleanup aborts as normal cancellation without errors or toasts", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.authorizedFetch.mockImplementation((_input: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("signal is aborted without reason", "AbortError")), { once: true });
  }));

  const view = render(<Page />);
  await waitFor(() => expect(mocks.authorizedFetch).toHaveBeenCalledTimes(2));
  view.unmount();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(consoleError).not.toHaveBeenCalled();
  expect(mocks.showToast.error).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

function installCaseResponses({ stage, clinicalResults = [], orders = [], aiResults = [] }: { stage: string; clinicalResults?: unknown[]; orders?: unknown[]; aiResults?: unknown[] }) {
  const caseData = baseCase(stage);
  mocks.authorizedFetch.mockImplementation(async (input: string) => {
    const url = new URL(input).pathname;
    if (url === "/api/doctor/cases/") return response([caseData]);
    if (url === "/api/doctor/cases/case-1/") return response(caseData);
    if (url.endsWith("/clinical-results/")) return response(clinicalResults);
    if (url.endsWith("/orders/")) return response(orders);
    if (url.endsWith("/ai-results/")) return response(aiResults);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
}

async function openCaseWorkspace(name: string) {
  const navigation = await screen.findByRole("navigation", { name: "Case 진료 정보 메뉴" });
  await userEvent.click(within(navigation).getByRole("button", { name }));
  return navigation;
}

it("keeps the Case action outside the constrained stage body when switching imaging workspaces", async () => {
  installCaseResponses({ stage: "CT", aiResults: [{ id: "analysis-1", analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_assessment: "NODULE_DETECTED" } } }] });
  const { container } = render(<Page />);
  for (const name of ["흉부 CT"]) {
    await openCaseWorkspace(name);
    const body = container.querySelector("[data-case-stage-body]");
    expect(body).toHaveClass("flex-1", "min-h-0", "overflow-hidden");
    expect(body).not.toContainElement(screen.getByRole("button", { name: "결과 입력 및 처리" }));
  }
});

it("keeps the active CT action available while the future PET-CT/TNM stage is locked", async () => {
  installCaseResponses({ stage: "CT", aiResults: [{ id: "analysis-1", ai_result_id: "ai-result-1", analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_assessment: "NODULE_DETECTED" } } }] });
  render(<Page />);

  await openCaseWorkspace("흉부 CT");
  expect(await screen.findByRole("button", { name: "결과 입력 및 처리" })).toBeEnabled();

  const navigation = await screen.findByRole("navigation", { name: "Case 진료 정보 메뉴" });
  expect(within(navigation).getByRole("button", { name: "PET-CT / TNM 병기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "결과 입력 및 처리" })).toBeEnabled();
});

it("applies the CT confirmation response stage and keeps it after refetch", async () => {
  let stage = "CT";
  mocks.authorizedFetch.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(input).pathname;
    if (url.endsWith("/clinical-results/ct/") && init?.method === "POST") return response({ id: "ct-draft-1" }, 201);
    if (url.endsWith("/clinical-results/ct/ct-draft-1/confirm/") && init?.method === "POST") {
      stage = "PET_CT_TNM";
      return response({ id: "ct-draft-1", result_status: "CONFIRMED", current_stage: "PET_CT_TNM", case_status: "ACTIVE" });
    }
    if (url === "/api/doctor/cases/") return response([baseCase(stage)]);
    if (url === "/api/doctor/cases/case-1/") return response(baseCase(stage));
    if (url.endsWith("/clinical-results/") || url.endsWith("/orders/")) return response([]);
    if (url.endsWith("/ai-results/")) return response([{ id: "analysis-1", ai_result_id: "ai-result-1", analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_assessment: "NODULE_DETECTED" } } }]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
  render(<Page />);

  await openCaseWorkspace("흉부 CT");
  await userEvent.click(await screen.findByRole("button", { name: "결과 입력 및 처리" }));
  await userEvent.click(screen.getByRole("button", { name: "결과 확정 및 PET-CT/TNM 진행" }));

  await waitFor(() => expect(screen.getByText("현재 Case 단계 · TNM")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "결과 입력 및 처리" })).not.toBeInTheDocument();

  const navigation = screen.getByRole("navigation", { name: "Case 진료 정보 메뉴" });
  expect(within(navigation).getByRole("button", { name: "흉부 CT" })).toHaveAttribute("aria-current", "page");
  expect(within(navigation).getByRole("button", { name: "PET-CT / TNM 병기" })).toBeEnabled();
  for (const name of ["조직/유전자", "PD-L1", "치료계획·처방"]) {
    const futureStage = within(navigation).getByRole("button", { name });
    expect(futureStage).toBeDisabled();
    expect(futureStage).toHaveAttribute("data-access-state", "LOCKED");
  }

  const originalCtPanel = screen.getByTestId("result-panel-CT");
  await userEvent.click(within(navigation).getByRole("button", { name: "PET-CT / TNM 병기" }));
  expect(within(navigation).getByRole("button", { name: "PET-CT / TNM 병기" })).toHaveAttribute("aria-current", "page");
  expect(originalCtPanel).toBeInTheDocument();

  await userEvent.click(within(navigation).getByRole("button", { name: "흉부 CT" }));
  expect(within(navigation).getByRole("button", { name: "흉부 CT" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByTestId("result-panel-CT")).toBe(originalCtPanel);
  expect(screen.queryByRole("button", { name: "결과 입력 및 처리" })).not.toBeInTheDocument();
});

it("keeps a completed TNM workspace read-only after the Case advances to pathology", async () => {
  installCaseResponses({ stage: "PATHOLOGY_GENE", clinicalResults: [{
    id: "tnm-1",
    workflow_stage: "PET_CT_TNM",
    result_status: "CONFIRMED",
    result_detail: { tnm: { t_category: "T1", n_category: "N0", m_category: "M0", stage_group: "IIA", evidence: { stage: { stage_group_candidate: "IIA", stage_group_status: "candidate_ready" } } } },
  }] });
  render(<Page />);

  await openCaseWorkspace("PET-CT / TNM 병기");
  expect(await screen.findByText("Stage Group 확정 완료")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다음 처리 선택" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "TNM 확정 및 다음 단계 진행" })).not.toBeInTheDocument();
});

it("keeps TNM next-stage progression in the TNM workspace only", async () => {
  installCaseResponses({ stage: "PET_CT_TNM", clinicalResults: [{
    id: "tnm-1",
    workflow_stage: "PET_CT_TNM",
    result_status: "CONFIRMED",
    result_detail: { tnm: { t_category: "T1", n_category: "N0", m_category: "M0", stage_group: "IIA", evidence: { stage: { stage_group_candidate: "IIA", stage_group_status: "candidate_ready" } } } },
  }] });
  render(<Page />);

  await openCaseWorkspace("PET-CT / TNM 병기");
  expect(await screen.findByRole("button", { name: "다음 처리 선택" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "종료·의뢰 처리" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "결과 입력 및 처리" })).not.toBeInTheDocument();
});

it("keeps the confirmed TNM workspace selected after advancing to pathology", async () => {
  let stage = "PET_CT_TNM";
  const clinicalResults = [{
    id: "tnm-1",
    workflow_stage: "PET_CT_TNM",
    result_status: "CONFIRMED",
    result_detail: { tnm: { t_category: "T1", n_category: "N0", m_category: "M0", stage_group: "IIA", evidence: { stage: { stage_group_candidate: "IIA", stage_group_status: "candidate_ready" } } } },
  }];
  mocks.authorizedFetch.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(input).pathname;
    if (url.endsWith("/workflow-decision/") && init?.method === "POST") {
      stage = "PATHOLOGY_GENE";
      return response({ current_stage: stage, case_status: "ACTIVE" });
    }
    if (url === "/api/doctor/cases/") return response([baseCase(stage)]);
    if (url === "/api/doctor/cases/case-1/") return response(baseCase(stage));
    if (url.endsWith("/clinical-results/")) return response(clinicalResults);
    if (url.endsWith("/orders/") || url.endsWith("/ai-results/")) return response([]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
  render(<Page />);

  const navigation = await openCaseWorkspace("PET-CT / TNM 병기");
  await userEvent.click(await screen.findByRole("button", { name: "다음 처리 선택" }));
  await userEvent.click(screen.getByRole("button", { name: "다음 단계 진행" }));

  await waitFor(() => expect(screen.getByText("현재 Case 단계 · 병리")).toBeInTheDocument());
  expect(within(navigation).getByRole("button", { name: "PET-CT / TNM 병기" })).toHaveAttribute("aria-current", "page");
  expect(within(navigation).getByRole("button", { name: "조직/유전자" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "다음 처리 선택" })).not.toBeInTheDocument();
  expect(await screen.findByText("현재 Case 단계가 아니므로 결과 조회만 가능합니다.")).toBeInTheDocument();
});

it("offers one atomic pathology confirmation and PD-L1 order action for a submitted draft", async () => {
  installCaseResponses({ stage: "PATHOLOGY_GENE", clinicalResults: [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "DRAFT", result_detail: {} }] });
  render(<Page />);

  const navigation = await openCaseWorkspace("조직/유전자");
  expect(within(navigation).getByRole("button", { name: "PD-L1" })).toHaveAttribute("data-access-state", "LOCKED");
  expect(screen.getByRole("button", { name: "결과 확정 및 PD-L1 검사 오더" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "결과 확인 및 확정" })).not.toBeInTheDocument();
});

it("does not offer a PD-L1 order before a pathology result exists", async () => {
  installCaseResponses({ stage: "PATHOLOGY_GENE" });
  render(<Page />);

  await openCaseWorkspace("조직/유전자");
  expect(screen.queryByRole("button", { name: "결과 확정 및 PD-L1 검사 오더" })).not.toBeInTheDocument();
});

it("offers the same one-click PD-L1 transition for a legacy confirmed pathology result", async () => {
  installCaseResponses({ stage: "PATHOLOGY_GENE", clinicalResults: [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} }] });
  render(<Page />);

  await openCaseWorkspace("조직/유전자");
  expect(await screen.findByRole("button", { name: "결과 확정 및 PD-L1 검사 오더" })).toBeEnabled();
});

it("confirms the pathology result, creates the PD-L1 order, and advances with one request", async () => {
  let stage = "PATHOLOGY_GENE";
  const clinicalResults = [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "DRAFT", result_detail: {} }];
  const orders: unknown[] = [];
  mocks.authorizedFetch.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(input).pathname;
    if (url === "/api/doctor/cases/case-1/workflow-decision/" && init?.method === "POST") {
      stage = "PDL1";
      clinicalResults[0].result_status = "CONFIRMED";
      orders.push({ id: "pdl1-order", order_type: "PDL1", status: "ORDERED", priority: "NORMAL", created_at: "2026-09-23T00:00:00Z" });
      return response({ current_stage: stage, case_status: "ACTIVE" });
    }
    if (url === "/api/doctor/cases/") return response([baseCase(stage)]);
    if (url === "/api/doctor/cases/case-1/") return response(baseCase(stage));
    if (url.endsWith("/clinical-results/")) return response(clinicalResults);
    if (url.endsWith("/orders/")) return response(orders);
    if (url.endsWith("/ai-results/")) return response([]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
  render(<Page />);

  await openCaseWorkspace("조직/유전자");
  await userEvent.click(await screen.findByRole("button", { name: "결과 확정 및 PD-L1 검사 오더" }));

  await waitFor(() => expect(screen.getByText("현재 Case 단계 · PD-L1")).toBeInTheDocument());
  const navigation = screen.getByRole("navigation", { name: "Case 진료 정보 메뉴" });
  expect(within(navigation).getByRole("button", { name: "조직/유전자" })).toHaveAttribute("aria-current", "page");
  expect(within(navigation).getByRole("button", { name: "PD-L1" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "결과 확정 및 PD-L1 검사 오더" })).not.toBeInTheDocument();
  const workflowCalls = mocks.authorizedFetch.mock.calls.filter(([input, init]) => new URL(input as string).pathname.endsWith("/workflow-decision/") && (init as RequestInit | undefined)?.method === "POST");
  const directOrderPosts = mocks.authorizedFetch.mock.calls.filter(([input, init]) => new URL(input as string).pathname.endsWith("/orders/") && (init as RequestInit | undefined)?.method === "POST");
  expect(workflowCalls).toHaveLength(1);
  expect(directOrderPosts).toHaveLength(0);
  expect(JSON.parse((workflowCalls[0][1] as RequestInit).body as string)).toMatchObject({
    action: "PROCEED_NEXT_STAGE",
    source_clinical_result_id: "path-1",
    target_stage: "PDL1",
  });

  await openCaseWorkspace("조직/유전자");
  expect(screen.queryByRole("button", { name: "결과 확정 및 PD-L1 검사 오더" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "PD-L1 단계 전환 재시도" })).not.toBeInTheDocument();
});

it("keeps treatment and prescription in a single waiting view until the confirmed PD-L1 result advances to treatment", async () => {
  installCaseResponses({ stage: "PDL1", clinicalResults: [
    { id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} },
    { id: "pdl1-1", workflow_stage: "PDL1", result_status: "CONFIRMED", result_detail: { pdl1: { tps_percent: 60 } } },
  ] });
  render(<Page />);

  const navigation = await openCaseWorkspace("PD-L1");
  expect(within(navigation).getByRole("button", { name: "치료계획·처방" })).toHaveAttribute("data-access-state", "LOCKED");
  expect(await screen.findByRole("button", { name: "다음 단계 결정" })).toBeEnabled();

  expect(within(navigation).getByRole("button", { name: "치료계획·처방" })).toBeDisabled();
});

it.each([
  { label: "no PD-L1 result", clinicalResults: [] },
  { label: "a PD-L1 draft", clinicalResults: [{ id: "pdl1-draft", workflow_stage: "PDL1", result_status: "DRAFT", result_detail: { pdl1: { tps_percent: 35 } } }] },
])("does not offer treatment advancement with $label", async ({ clinicalResults }) => {
  installCaseResponses({ stage: "PDL1", clinicalResults });
  render(<Page />);

  await openCaseWorkspace("PD-L1");
  expect(screen.queryByRole("button", { name: "다음 단계 결정" })).not.toBeInTheDocument();
});

it("advances a confirmed PD-L1 result to treatment and keeps the past PD-L1 view read-only", async () => {
  let stage = "PDL1";
  const clinicalResults = [{ id: "pdl1-1", workflow_stage: "PDL1", result_status: "CONFIRMED", result_detail: { pdl1: { tps_percent: 60 } } }];
  mocks.authorizedFetch.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(input).pathname;
    if (url === "/api/doctor/cases/case-1/workflow-decision/" && init?.method === "POST") {
      stage = "TREATMENT";
      return response({ current_stage: stage, case_status: "ACTIVE" });
    }
    if (url === "/api/doctor/cases/") return response([baseCase(stage)]);
    if (url === "/api/doctor/cases/case-1/") return response(baseCase(stage));
    if (url.endsWith("/clinical-results/")) return response(clinicalResults);
    if (url.endsWith("/orders/") || url.endsWith("/ai-results/") || url.endsWith("/prescriptions/")) return response([]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    if (url.endsWith("/regimen-candidates/")) return response([]);
    return response([]);
  });
  render(<Page />);

  await openCaseWorkspace("PD-L1");
  await userEvent.click(await screen.findByRole("button", { name: "다음 단계 결정" }));
  await userEvent.click(screen.getByRole("button", { name: "치료결정으로 진행" }));

  await waitFor(() => expect(screen.getByText("현재 Case 단계 · 치료 결정")).toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "다음 단계 결정" })).not.toBeInTheDocument();

  const navigation = screen.getByRole("navigation", { name: "Case 진료 정보 메뉴" });
  expect(within(navigation).getByRole("button", { name: "PD-L1" })).toHaveAttribute("aria-current", "page");
  expect(within(navigation).getByRole("button", { name: "치료계획·처방" })).toBeEnabled();

  await openCaseWorkspace("치료계획·처방");
  expect(await screen.findByTestId("treatment-final-plan")).toBeInTheDocument();

  await openCaseWorkspace("PD-L1");
  expect(screen.queryByRole("button", { name: "결과 확인 및 확정" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다음 단계 결정" })).not.toBeInTheDocument();

  const workflowCalls = mocks.authorizedFetch.mock.calls.filter(([input, init]) => new URL(input as string).pathname.endsWith("/workflow-decision/") && (init as RequestInit | undefined)?.method === "POST");
  expect(workflowCalls).toHaveLength(1);
  expect(JSON.parse((workflowCalls[0][1] as RequestInit).body as string)).toMatchObject({
    action: "PROCEED_NEXT_STAGE",
    source_clinical_result_id: "pdl1-1",
    target_stage: "TREATMENT",
  });
});

it("keeps the treatment plan visible after confirmation advances to prescription", async () => {
  let stage = "TREATMENT";
  mocks.authorizedFetch.mockImplementation(async (input: string) => {
    const url = new URL(input).pathname;
    if (url === "/api/doctor/cases/") return response([baseCase(stage)]);
    if (url === "/api/doctor/cases/case-1/") return response(baseCase(stage));
    if (url.endsWith("/clinical-results/") || url.endsWith("/orders/") || url.endsWith("/ai-results/") || url.endsWith("/prescriptions/") || url.endsWith("/regimen-candidates/")) return response([]);
    if (url.endsWith("/treatment-decision/")) return response({ decision_status: "DRAFT", selected_regimen: null });
    return response([]);
  });
  render(<Page />);

  const navigation = await openCaseWorkspace("치료계획·처방");
  expect(screen.getByRole("button", { name: "치료계획 · 근거" })).toHaveAttribute("aria-pressed", "true");
  stage = "PRESCRIPTION";
  await userEvent.click(screen.getByRole("button", { name: "치료계획 확정 테스트" }));

  await waitFor(() => expect(screen.getByText("현재 Case 단계 · 처방")).toBeInTheDocument());
  expect(within(navigation).getByRole("button", { name: "치료계획·처방" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "치료계획 · 근거" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("treatment-final-plan")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "처방 · 안전성" }));
  expect(screen.getByRole("button", { name: "처방 · 안전성" })).toHaveAttribute("aria-pressed", "true");
});

it("does not restore PD-L1 actions after refreshing an already advanced treatment Case", async () => {
  installCaseResponses({
    stage: "TREATMENT",
    clinicalResults: [{ id: "pdl1-1", workflow_stage: "PDL1", result_status: "CONFIRMED", result_detail: { pdl1: { tps_percent: 60 } } }],
  });
  render(<Page />);

  await openCaseWorkspace("PD-L1");
  expect(screen.queryByRole("button", { name: "결과 확인 및 확정" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다음 단계 결정" })).not.toBeInTheDocument();

  await openCaseWorkspace("치료계획·처방");
  expect(await screen.findByTestId("treatment-final-plan")).toBeInTheDocument();
});

it("reuses an active PD-L1 order through the same one-click transition", async () => {
  installCaseResponses({
    stage: "PATHOLOGY_GENE",
    clinicalResults: [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} }],
    orders: [{ id: "pdl1-order", order_type: "PDL1", status: "ORDERED", priority: "NORMAL", created_at: "2026-09-19T00:00:00Z" }],
  });
  render(<Page />);

  const navigation = await openCaseWorkspace("조직/유전자");
  await waitFor(() => expect(within(navigation).getByRole("button", { name: "PD-L1" })).toHaveAttribute("data-access-state", "LOCKED"));
  expect(screen.getByRole("button", { name: "결과 확정 및 PD-L1 검사 오더" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "PD-L1 단계 전환 재시도" })).not.toBeInTheDocument();
});

it("keeps pathology read-only after a refreshed Case is already in PD-L1", async () => {
  installCaseResponses({
    stage: "PDL1",
    clinicalResults: [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} }],
    orders: [{ id: "pdl1-order", order_type: "PDL1", status: "ORDERED", priority: "NORMAL", created_at: "2026-09-19T00:00:00Z" }],
  });
  render(<Page />);

  await openCaseWorkspace("조직/유전자");
  expect(screen.queryByRole("button", { name: "결과 확정 및 PD-L1 검사 오더" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "PD-L1 단계 전환 재시도" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "결과 확인 및 확정" })).not.toBeInTheDocument();
});

it.each(["ORDERED", "SCHEDULED"])("does not offer a PD-L1 reorder while an %s order is active", async (status) => {
  installCaseResponses({
    stage: "PDL1",
    clinicalResults: [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} }],
    orders: [{ id: "pdl1-order", order_type: "PDL1", status, priority: "NORMAL", created_at: "2026-09-23T00:00:00Z" }],
  });
  render(<Page />);

  await openCaseWorkspace("PD-L1");
  expect(screen.queryByRole("button", { name: "PD-L1 재오더" })).not.toBeInTheDocument();
});

it("reorders a cancelled PD-L1 order without changing the workflow stage", async () => {
  const orders: Array<Record<string, string>> = [{ id: "cancelled-order", order_type: "PDL1", status: "CANCELLED", priority: "NORMAL", created_at: "2026-09-23T00:00:00Z" }];
  const clinicalResults = [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} }];
  mocks.authorizedFetch.mockImplementation(async (input: string, init?: RequestInit) => {
    const url = new URL(input).pathname;
    if (url === "/api/doctor/cases/case-1/pathology-orders/" && init?.method === "POST") {
      orders.push({ id: "replacement-order", order_type: "PDL1", status: "ORDERED", priority: "NORMAL", created_at: "2026-09-23T01:00:00Z" });
      return response({ examination_order_id: "replacement-order", pathology_work_item_id: "replacement-work-item", order_type: "PDL1", order_status: "ORDERED" }, 201);
    }
    if (url === "/api/doctor/cases/") return response([baseCase("PDL1")]);
    if (url === "/api/doctor/cases/case-1/") return response(baseCase("PDL1"));
    if (url.endsWith("/clinical-results/")) return response(clinicalResults);
    if (url.endsWith("/orders/")) return response(orders);
    if (url.endsWith("/ai-results/")) return response([]);
    if (url.endsWith("/treatment-decision/")) return response({}, 404);
    return response([]);
  });
  render(<Page />);

  await openCaseWorkspace("PD-L1");
  await userEvent.click(await screen.findByRole("button", { name: "PD-L1 재오더" }));
  await userEvent.type(screen.getByRole("textbox", { name: "검사 오더 목적" }), "취소된 PD-L1 검사 재요청");
  await userEvent.click(screen.getByRole("button", { name: "입력 내용 검토" }));
  await userEvent.click(screen.getByRole("button", { name: "오더 확정" }));

  await waitFor(() => expect(screen.queryByRole("button", { name: "PD-L1 재오더" })).not.toBeInTheDocument());
  expect(screen.getByText("현재 Case 단계 · PD-L1")).toBeInTheDocument();
  const reorderCalls = mocks.authorizedFetch.mock.calls.filter(([input, init]) => new URL(input as string).pathname.endsWith("/pathology-orders/") && (init as RequestInit | undefined)?.method === "POST");
  expect(reorderCalls).toHaveLength(1);
  expect(JSON.parse((reorderCalls[0][1] as RequestInit).body as string)).toMatchObject({
    pathology_test_type: "PDL1",
    purpose: "취소된 PD-L1 검사 재요청",
  });
  expect(orders.filter((order) => ["ORDERED", "SCHEDULED"].includes(order.status))).toHaveLength(1);
});

it.each([
  { label: "completed PD-L1 order", orders: [{ id: "completed-order", order_type: "PDL1", status: "COMPLETED", priority: "NORMAL", created_at: "2026-09-23T00:00:00Z" }], clinicalResults: [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} }] },
  { label: "existing PD-L1 result", orders: [{ id: "cancelled-order", order_type: "PDL1", status: "CANCELLED", priority: "NORMAL", created_at: "2026-09-23T00:00:00Z" }], clinicalResults: [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} }, { id: "pdl1-draft", workflow_stage: "PDL1", result_status: "DRAFT", result_detail: {} }] },
])("does not offer a PD-L1 reorder with a $label", async ({ orders, clinicalResults }) => {
  installCaseResponses({ stage: "PDL1", orders, clinicalResults });
  render(<Page />);

  await openCaseWorkspace("PD-L1");
  expect(screen.queryByRole("button", { name: "PD-L1 재오더" })).not.toBeInTheDocument();
});
