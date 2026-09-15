import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "./page";
import {
  fetchPathologyCaseWorkflow,
  fetchPathologyWorkstation,
  fetchPdl1Analyses,
} from "./_lib/pathology-workstation-api";
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.mocked(fetchPdl1Analyses).mockResolvedValue([]);
});

function emptyWorkflow(caseId: string, patientName = caseId) {
  return {
    patient: {
      id: `patient-${caseId}`,
      name: patientName,
      patient_code: `${caseId}-code`,
      birth_date: "2000-01-01",
      sex: "F",
    },
    case: {
      id: caseId,
      case_code: `case-${caseId}`,
      current_stage: "-",
      case_status: "ACTIVE",
    },
    orders: [],
  } as Awaited<ReturnType<typeof fetchPathologyCaseWorkflow>>;
}

it("reopens a restored recent case absent from the worklist without auto-selection", async () => {
  sessionStorage.setItem("pathologyRecentPatients", JSON.stringify([{ case_id: "old", patient_name: "Recent", birth_date: "2000-01-01" }]));
  vi.mocked(fetchPathologyWorkstation).mockResolvedValue({ count: 0, results: [], next: null, previous: null });
  vi.mocked(fetchPathologyCaseWorkflow).mockResolvedValue(emptyWorkflow("old", "Recent"));
  render(<Page />);
  const button = await screen.findByRole("button", { name: /Recent/ });
  expect(fetchPathologyCaseWorkflow).not.toHaveBeenCalled();
  await userEvent.click(button);
  await screen.findByText("표시할 병리 검사 오더가 없습니다.");
  expect(fetchPathologyCaseWorkflow).toHaveBeenCalledWith("old", expect.any(AbortSignal));
  expect(button).toHaveAttribute("aria-pressed", "true");
});

vi.mock("./_lib/pathology-workstation-api", () => ({
  fetchPathologyCaseWorkflow: vi.fn(), fetchPathologyWorkstation: vi.fn(),
  fetchPdl1Analyses: vi.fn(),
  runPdl1Analysis: vi.fn(), uploadPdl1Input: vi.fn(), submitPathologyForReview: vi.fn(),
}));

it("keeps selection and workflow across numbered/next/previous pages and loading", async () => {
  const row = (id: string) => ({ case_id: id, patient: { name: id, patient_code: id + "-code" },
    case: { case_code: `case-${id}` }, workflow_status: "SCHEDULED" });
  let release: (() => void) | undefined;
  let delay = true;
  vi.mocked(fetchPathologyWorkstation).mockImplementation(async ({ page }) => {
    if (page === 2 && delay) await new Promise<void>((resolve) => { release = resolve; });
    return { count: 30, results: [row(page === 1 ? "Alice" : page === 2 ? "Bob" : "Carol")] } as Awaited<ReturnType<typeof fetchPathologyWorkstation>>;
  });
  vi.mocked(fetchPathologyCaseWorkflow).mockImplementation(async (caseId) => emptyWorkflow(caseId));
  const user = userEvent.setup();
  render(<Page />);
  await user.click(await screen.findByText("Alice"));
  const detail = await screen.findByText("표시할 병리 검사 오더가 없습니다.");
  await user.click(screen.getByRole("button", { name: "2" }));
  await waitFor(() => expect(release).toBeDefined());
  expect(screen.getByRole("status", { name: "Worklist 로딩 중" })).toBeInTheDocument();
  expect(screen.getAllByText("case-Alice").length).toBeGreaterThan(0);
  expect(detail).toBeInTheDocument();
  delay = false;
  await act(async () => { release?.(); });
  await screen.findByText("Bob");
  expect(screen.queryByRole("status", { name: "Worklist 로딩 중" })).not.toBeInTheDocument();
  expect(screen.getAllByText("case-Alice").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "다음" }));
  await screen.findByText("Carol");
  expect(detail).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "이전" }));
  await screen.findByText("Bob");
  await user.click(screen.getByRole("button", { name: "1" }));
  await waitFor(() => expect(screen.getAllByText("Alice").find(el => el.closest("tr"))?.closest("tr")).toHaveClass("bg-[#F1F3FF]"));
  expect(fetchPathologyCaseWorkflow).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "2" }));
  await user.click(await screen.findByText("Bob"));
  await waitFor(() => expect(screen.getAllByText("case-Bob").length).toBeGreaterThan(0));
  await waitFor(() => expect(fetchPathologyCaseWorkflow).toHaveBeenCalledTimes(2));
});

it("shows the initial skeleton and replaces it with the existing error UI on failure", async () => {
  let rejectRequest: ((error: Error) => void) | undefined;
  vi.mocked(fetchPathologyWorkstation).mockImplementation(() => new Promise((_, reject) => {
    rejectRequest = reject;
  }));
  render(<Page />);
  const skeleton = screen.getByRole("status", { name: "Worklist 로딩 중" });
  expect(skeleton.querySelectorAll("tbody tr")).toHaveLength(10);
  expect(screen.queryByText("Worklist를 불러오는 중입니다.")).not.toBeInTheDocument();
  await act(async () => { rejectRequest?.(new Error("Worklist request failed")); });
  expect(await screen.findByText("Worklist request failed")).toBeInTheDocument();
  expect(screen.queryByRole("status", { name: "Worklist 로딩 중" })).not.toBeInTheDocument();
});

it("presents the selected patient, pathology workflow, result metrics, and submit action in order", async () => {
  const item = {
    id: "order-1",
    case_id: "case-1",
    patient: {
      id: "patient-1",
      name: "계층환자",
      patient_code: "P-001",
      birth_date: "1980-01-01",
      sex: "F",
    },
    case: {
      id: "case-1",
      case_code: "C-001",
      current_stage: "PATHOLOGY",
      case_status: "ACTIVE",
    },
    specimen: {
      id: "specimen-1",
      specimen_code: "S-001",
      specimen_type: "TISSUE",
      body_site: "LUNG",
      status: "READY",
    },
    pathology_test_type: "SUBTYPE",
    pathology_test_type_label: "아형분류 검사",
    current_exam_or_task: "아형분류 검사",
    task_type: "PATHOLOGY_ANALYSIS",
    status: "COMPLETED",
    priority: "ROUTINE",
    assigned_to_id: "staff-1",
    assigned_to_name: "담당자",
    requesting_doctor: { id: "doctor-1", name: "의뢰의사" },
    wsi_count: 1,
    latest_wsi: {
      id: "wsi-1",
      slide_code: "SLIDE-1",
      stain: "H&E",
      original_filename: "sample.svs",
      mpp: "0.25",
      image_status: "READY",
    },
    latest_ai_analysis: {
      id: "analysis-1",
      analysis_type: "PATHOLOGY_GENE_ANALYSIS",
      status: "SUCCEEDED",
      status_label: "분석 완료",
      model_name: "model",
      model_version_name: "v1",
      result_detail: {
        pathology: {
          predicted_subtype: "LUAD",
          predicted_histologic_type: "Adenocarcinoma",
          subtype_confidence: 0.91,
          malignancy_assessment: "MALIGNANT",
          malignancy_assessment_label: "악성",
          malignancy_probability: 0.95,
        },
      },
    },
    latest_gene_analysis: null,
    diagnostic_review_status: null,
    diagnostic_review: null,
    clinical_result: null,
    examination_order: {
      id: "exam-1",
      status: "COMPLETED",
      priority: "ROUTINE",
      pathology_test_type: "SUBTYPE",
      pathology_test_type_label: "아형분류 검사",
      created_at: "2026-01-01T00:00:00Z",
    },
    workflow_status: "AI_COMPLETED",
    workflow_status_label: "AI 분석 완료",
  } as unknown as Awaited<ReturnType<typeof fetchPathologyWorkstation>>["results"][number];

  vi.mocked(fetchPathologyWorkstation).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [item],
  });
  vi.mocked(fetchPathologyCaseWorkflow).mockResolvedValue({
    patient: item.patient,
    case: item.case,
    orders: [item],
  });

  render(<Page />);
  await userEvent.click(await screen.findByText("계층환자"));
  await screen.findByText("선택 환자 정보");

  const patientSummary = screen.getByRole("region", { name: "계층환자" });
  expect(within(patientSummary).getByText("현재 검사")).toBeInTheDocument();
  expect(within(patientSummary).getByText("현재 상태")).toBeInTheDocument();
  expect(within(patientSummary).queryByText("검체번호")).not.toBeInTheDocument();
  expect(within(patientSummary).queryByText("영상 올리기")).not.toBeInTheDocument();
  expect(screen.getAllByText("조직데이터").length).toBeGreaterThan(0);
  expect(screen.getByText("Slide")).toBeInTheDocument();

  const workflow = screen.getByRole("list", {
    name: "아형분류 검사 workflow",
  });
  for (const step of ["조직데이터", "AI 분석", "AI 분석 결과", "의사에게 제출"]) {
    expect(within(workflow).getByText(step)).toBeInTheDocument();
  }

  expect(screen.getAllByText("예측 아형").length).toBeGreaterThan(0);
  expect(screen.getAllByText("아형 신뢰도").length).toBeGreaterThan(0);
  expect(screen.getAllByText("악성 판정").length).toBeGreaterThan(0);
  expect(screen.getAllByText("악성 확률").length).toBeGreaterThan(0);
  expect(screen.getByText("AI 분석 결과를 의사 판독 대상으로 제출합니다.")).toBeInTheDocument();

  const resultButtons = screen.getAllByRole("button", { name: "AI 결과 보기" });
  await userEvent.click(resultButtons[resultButtons.length - 1]);
  expect(screen.getByRole("dialog", { name: "아형분류 AI 결과" })).toBeInTheDocument();
});
