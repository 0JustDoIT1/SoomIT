import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("./result-review-panel", () => ({ ResultReviewPanel: ({ specialistAction }: { specialistAction?: import("react").ReactNode }) => specialistAction ?? null, WorkflowStatusFlow: () => null }));
vi.mock("./treatment-decision-panel", () => ({ TreatmentDecisionPanel: () => <div data-testid="treatment-final-plan" /> }));
vi.mock("./evidence-viewer-panel", () => ({ EvidenceViewerPanel: () => null }));

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const baseCase = (stage: string) => ({ id: "case-1", case_code: "CASE-1", patient_code: "PAT-1", patient_name: "환자", primary_doctor_name: "의사", current_stage: stage, case_status: "ACTIVE" });

beforeEach(() => vi.clearAllMocks());

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
  fireEvent.click(within(navigation).getByRole("button", { name }));
  return navigation;
}

it("keeps the active CT action available while a future stage is waiting", async () => {
  installCaseResponses({ stage: "CT", aiResults: [{ id: "analysis-1", ai_result_id: "ai-result-1", analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_assessment: "NODULE_DETECTED" } } }] });
  render(<Page />);

  await openCaseWorkspace("흉부 CT");
  expect(await screen.findByRole("button", { name: "결과 입력 및 처리" })).toBeEnabled();

  await openCaseWorkspace("PET-CT / TNM 병기");
  expect(screen.getByRole("button", { name: "결과 입력 및 처리" })).toBeEnabled();
});

it("keeps PD-L1 waiting until the pathology result is confirmed", async () => {
  installCaseResponses({ stage: "PATHOLOGY_GENE", clinicalResults: [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "DRAFT", result_detail: {} }] });
  render(<Page />);

  const navigation = await openCaseWorkspace("조직/유전자");
  expect(within(navigation).getByRole("button", { name: "PD-L1" })).toHaveAttribute("data-access-state", "WAITING");
  expect(screen.queryByRole("button", { name: "PD-L1 오더" })).not.toBeInTheDocument();
});

it("offers the PD-L1 order after a confirmed pathology result", async () => {
  installCaseResponses({ stage: "PATHOLOGY_GENE", clinicalResults: [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} }] });
  render(<Page />);

  await openCaseWorkspace("조직/유전자");
  expect(await screen.findByRole("button", { name: "PD-L1 오더" })).toBeEnabled();
});

it("keeps treatment and prescription in a single waiting view until the confirmed PD-L1 result advances to treatment", async () => {
  installCaseResponses({ stage: "PDL1", clinicalResults: [
    { id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} },
    { id: "pdl1-1", workflow_stage: "PDL1", result_status: "CONFIRMED", result_detail: { pdl1: { tps_percent: 60 } } },
  ] });
  render(<Page />);

  const navigation = await openCaseWorkspace("PD-L1");
  expect(within(navigation).getByRole("button", { name: "치료계획·처방" })).toHaveAttribute("data-access-state", "ACTIONABLE");
  expect(await screen.findByRole("button", { name: "다음 단계 결정" })).toBeEnabled();

  await openCaseWorkspace("치료계획·처방");
  expect(await screen.findByRole("heading", { name: "다음 단계 결정이 필요합니다." })).toBeInTheDocument();
  expect(screen.queryByTestId("treatment-final-plan")).not.toBeInTheDocument();
});

it("does not expose duplicate PD-L1 ordering while an active PD-L1 order exists", async () => {
  installCaseResponses({
    stage: "PDL1",
    clinicalResults: [{ id: "path-1", workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} }],
    orders: [{ id: "pdl1-order", order_type: "PDL1", status: "ORDERED", priority: "NORMAL", created_at: "2026-09-19T00:00:00Z" }],
  });
  render(<Page />);

  const navigation = await openCaseWorkspace("PD-L1");
  await waitFor(() => expect(within(navigation).getByRole("button", { name: "PD-L1" })).toHaveAttribute("data-access-state", "WAITING"));
  expect(screen.queryByRole("button", { name: "PD-L1 오더" })).not.toBeInTheDocument();
});
