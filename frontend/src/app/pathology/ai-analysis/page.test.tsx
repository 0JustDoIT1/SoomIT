import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PathologyAiAnalysis, WorkItem } from "../_lib/pathology-api";
import PathologyAiAnalysisPage from "./page";

const { mockUsePathologyAuth } = vi.hoisted(() => ({
  mockUsePathologyAuth: vi.fn(),
}));

vi.mock("../_components/pathology-auth-provider", () => ({
  usePathologyAuth: mockUsePathologyAuth,
}));

vi.mock("../_components/pathology-auth-panel", () => ({
  PathologyAuthPanel: () => null,
}));

const workItem: WorkItem = {
  id: "work-1",
  case_id: "case-1",
  case_code: "CASE-001",
  patient_code: "P-001",
  patient_name: "테스트 환자",
  specimen_id: "specimen-1",
  specimen_code: "SPECIMEN-001",
  wsi_id: "wsi-1",
  slide_code: "SLIDE-001",
  task_type: "PATHOLOGY_ANALYSIS",
  status: "COMPLETED",
  priority: "NORMAL",
  assigned_to_id: null,
  assigned_to_name: null,
  due_at: null,
  completed_at: "2026-09-07T01:00:00Z",
  created_at: "2026-09-07T00:00:00Z",
  updated_at: "2026-09-07T01:00:00Z",
};

function createAnalysis(
  overrides: Partial<PathologyAiAnalysis> = {},
): PathologyAiAnalysis {
  return {
    id: "analysis-1",
    case_id: "case-1",
    source_image_asset_id: "asset-1",
    analysis_type: "PATHOLOGY_DIAGNOSIS",
    analysis_type_label: "병리 진단",
    status: "SUCCEEDED",
    status_label: "성공",
    model_name: "pathology-model",
    model_version_name: "1.0",
    started_at: "2026-09-07T00:10:00Z",
    completed_at: "2026-09-07T00:20:00Z",
    error_message: null,
    result_detail: {
      schema_version: "1.0",
      result_payload: {},
      result_files: [],
      pathology: {
        malignancy_assessment: "MALIGNANT",
        malignancy_assessment_label: "악성",
        malignancy_probability: "0.8750",
        predicted_histologic_type: "NSCLC",
        predicted_subtype: "Adenocarcinoma",
        subtype_confidence: "0.8125",
      },
    },
    created_at: "2026-09-07T00:00:00Z",
    ...overrides,
  };
}

function renderPage(analyses: PathologyAiAnalysis[]) {
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const data = url.includes("/ai-results/") ? analyses : [workItem];
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  mockUsePathologyAuth.mockReturnValue({
    authorizedFetch,
    isConnected: true,
    markConnected: vi.fn(),
  });

  render(<PathologyAiAnalysisPage />);
  return authorizedFetch;
}

beforeEach(() => {
  mockUsePathologyAuth.mockReset();
});

describe("PathologyAiAnalysisPage", () => {
  it("shows an explicit empty state when the Case has no AI result", async () => {
    renderPage([]);

    expect(
      await screen.findByText("이 Case에 등록된 병리 AI 결과가 없습니다."),
    ).toBeInTheDocument();
  });

  it("shows fields returned by a successful pathology analysis", async () => {
    renderPage([createAnalysis()]);

    expect(await screen.findByText("pathology-model")).toBeInTheDocument();
    expect(screen.getByText("악성")).toBeInTheDocument();
    expect(screen.getByText("0.8750")).toBeInTheDocument();
    expect(screen.getByText("Adenocarcinoma")).toBeInTheDocument();
    expect(screen.getByText("asset-1")).toBeInTheDocument();
  });

  it("shows the error recorded by a failed analysis", async () => {
    renderPage([
      createAnalysis({
        status: "FAILED",
        status_label: "실패",
        error_message: "모델 실행 중 파일을 읽지 못했습니다.",
        result_detail: null,
      }),
    ]);

    expect(await screen.findByText("AI 분석 처리 실패")).toBeInTheDocument();
    expect(
      screen.getByText("모델 실행 중 파일을 읽지 못했습니다."),
    ).toBeInTheDocument();
  });

  it("allows selecting another result when a Case has multiple analyses", async () => {
    const user = userEvent.setup();
    renderPage([
      createAnalysis(),
      createAnalysis({
        id: "analysis-2",
        model_version_name: "2.0",
        result_detail: {
          schema_version: "1.0",
          result_payload: {},
          result_files: [],
          pathology: {
            malignancy_assessment: "BENIGN",
            malignancy_assessment_label: "양성",
            malignancy_probability: "0.1250",
            predicted_histologic_type: "Benign lesion",
            predicted_subtype: null,
            subtype_confidence: null,
          },
        },
      }),
    ]);

    const selector = await screen.findByLabelText("분석 실행 선택");
    await user.selectOptions(selector, "analysis-2");

    expect(screen.getByText("2.0")).toBeInTheDocument();
    expect(screen.getByText("양성")).toBeInTheDocument();
    expect(screen.getByText("Benign lesion")).toBeInTheDocument();
  });
});
