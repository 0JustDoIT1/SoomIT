import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiSummaryPanel, selectPreferredAiResult } from "./ai-summary-panel";

describe("AiSummaryPanel", () => {
  it("shows one selected analysis at a time and separates AI from confirmed clinician opinions", () => {
    render(<AiSummaryPanel currentStage="PATHOLOGY_GENE" aiResults={[
      { analysis_type: "XRAY_ANALYSIS", status: "SUCCEEDED", result_detail: { xray: { assessment_label: "정상" } } },
      { analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED", result_detail: { pathology: { predicted_subtype: "LUAD" } } },
    ]} clinicalResults={[
      { workflow_stage: "XRAY", result_status: "CONFIRMED", result_detail: { xray: { assessment_label: "정상" } } },
      { workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: { pathology: { subtype: "LUSC" } } },
    ]} />);

    expect(screen.getAllByRole("button", { name: /흉부 X선/ }).find((button) => button.hasAttribute("aria-pressed"))).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("AI 소견")).toBeTruthy();
    expect(screen.getByText("전문과 의료진 확정 소견")).toBeTruthy();
    expect(screen.getByRole("tabpanel", { name: "흉부 X선 분석 결과" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /조직·유전자 분석/ }));
    expect(screen.getByRole("tabpanel", { name: "조직·유전자 분석 분석 결과" })).toBeTruthy();
    expect(screen.getAllByText("LUAD").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LUSC").length).toBeGreaterThan(0);
  });

  it("uses an explicit empty state instead of inventing analysis or confirmed results", () => {
    render(<AiSummaryPanel currentStage="CT" aiResults={[]} clinicalResults={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("확정 완료된 분석 결과가 없습니다");
  });

  it("shows failed AI state without treating its payload as an opinion", () => {
    render(<AiSummaryPanel currentStage="XRAY" aiResults={[{ analysis_type: "XRAY_ANALYSIS", status: "FAILED", error_message: "분석 요청 실패", result_detail: { xray: { assessment_label: "가짜 후보" } } }]} clinicalResults={[{ workflow_stage: "XRAY", result_status: "CONFIRMED", result_detail: {} }]} />);
    expect(screen.getAllByText("분석 실패").length).toBeGreaterThan(0);
    expect(screen.getByText("분석 요청 실패")).toBeTruthy();
    expect(screen.queryByText("가짜 후보")).toBeNull();
  });

  it("shows comparison only for the selected stage with both actual results", () => {
    render(<AiSummaryPanel currentStage="PET_CT_TNM" aiResults={[{ analysis_type: "PET_CT_TNM_ANALYSIS", status: "SUCCEEDED", result_detail: { tnm: { predicted_t: "T2", predicted_n: "N1", predicted_m: "M0" } } }]} clinicalResults={[{ workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_detail: { tnm: { t_category: "T2", n_category: "N2", m_category: "M0" } } }]} />);
    fireEvent.click(screen.getAllByRole("button", { name: /PET-CT \/ TNM 병기/ }).find((button) => button.hasAttribute("aria-pressed"))!);
    const differences = screen.getByLabelText("결과 차이 항목");
    expect(differences).toHaveTextContent("N");
    expect(differences).toHaveTextContent("AI N1 / 의료진 N2");
    expect(differences).not.toHaveTextContent("AI T2");
  });

  it("shows all gene values only after the selected pathology item is opened", () => {
    const genes = ["EGFR", "ALK", "ROS1", "KRAS"].map((gene_symbol) => ({ gene_symbol, predicted_status: "PREDICTED_POSITIVE", predicted_status_label: "양성 예측" }));
    render(<AiSummaryPanel currentStage="PATHOLOGY_GENE" aiResults={[
      { analysis_type: "XRAY_ANALYSIS", status: "SUCCEEDED", result_detail: { xray: { assessment_label: "정상" } } },
      { analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED", result_detail: { genes } },
    ]} clinicalResults={[
      { workflow_stage: "XRAY", result_status: "CONFIRMED", result_detail: {} },
      { workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: {} },
    ]} />);
    expect(screen.queryByText("유전자 전체 보기")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /조직·유전자 분석/ }));
    expect(screen.getByText("유전자 전체 보기")).toBeTruthy();
    expect(screen.getByLabelText("전체 유전자 결과")).toBeTruthy();
  });
});

describe("AiSummaryPanel review action", () => {
  it("opens the requested analysis evidence", () => {
    render(<AiSummaryPanel
      currentStage="CT"
      aiResults={[{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: 0.4 } } }]}
      clinicalResults={[{ workflow_stage: "CT", result_status: "CONFIRMED", result_detail: {} }]}
      evidenceByAnalysis={{ CT_ANALYSIS: <p>CT original image</p> }}
      reviewRequest={{ analysisType: "CT_ANALYSIS" }}
    />);

    expect(screen.getAllByRole("button", { name: /흉부 CT/ }).find((button) => button.hasAttribute("aria-pressed"))).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("CT original image")).toBeTruthy();
    expect(screen.getByText("AI 분석 결과")).toBeTruthy();
    expect(screen.getByText("전문과 의료진 확정 결과")).toBeTruthy();
    expect(screen.getByText("근거 및 검토 정보")).toBeTruthy();
  });
});

describe("AiSummaryPanel master-detail layout", () => {
  it("keeps all analyses in the master list and swaps only the detail pane", () => {
    render(<AiSummaryPanel
      currentStage="CT"
      aiResults={[
        { analysis_type: "XRAY_ANALYSIS", status: "SUCCEEDED", result_detail: { xray: { assessment_label: "X-ray result" } } },
        { analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: 0.4 } } },
      ]}
      clinicalResults={[
        { workflow_stage: "XRAY", result_status: "CONFIRMED", result_detail: {} },
        { workflow_stage: "CT", result_status: "CONFIRMED", result_detail: {} },
      ]}
    />);

    expect(screen.getAllByText("X-ray result").length).toBeGreaterThan(0);
    expect(screen.getAllByText("흉부 CT").length).toBeGreaterThan(0);
    const ctSummary = screen.getByRole("button", { name: /흉부 CT.*AI.*악성 위험도/ });
    expect(ctSummary).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(ctSummary);
    expect(ctSummary).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("tabpanel", { name: "흉부 CT 분석 결과" })).toBeTruthy();
  });
});

describe("AiSummaryPanel workflow visibility", () => {
  const confirmed = (workflow_stage: string) => ({ workflow_stage, result_status: "CONFIRMED", result_detail: {} });
  const draft = (workflow_stage: string) => ({ workflow_stage, result_status: "DRAFT", result_detail: {} });
  const list = () => within(screen.getByRole("complementary", { name: "검사별 AI 분석 목록" }));

  it("shows only confirmed X-ray while CT is current and incomplete", () => {
    render(<AiSummaryPanel
      currentStage="CT"
      aiResults={[
        { analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: 0.5 } } },
        { analysis_type: "PDL1_ANALYSIS", status: "SUCCEEDED", result_detail: { pdl1: { predicted_tps_range_label: "50% 이상" } } },
      ]}
      clinicalResults={[confirmed("XRAY"), draft("CT"), confirmed("PDL1")]}
    />);

    expect(list().getByRole("button", { name: /흉부 X선/ })).toBeInTheDocument();
    expect(list().queryByRole("button", { name: /흉부 CT/ })).not.toBeInTheDocument();
    expect(list().queryByRole("button", { name: /PD-L1/ })).not.toBeInTheDocument();
  });

  it("shows confirmed imaging only while TNM is current and incomplete", () => {
    render(<AiSummaryPanel
      currentStage="PET_CT_TNM"
      aiResults={[{ analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED", result_detail: { pathology: { predicted_subtype: "LUAD" } } }]}
      clinicalResults={[confirmed("XRAY"), confirmed("CT"), draft("PET_CT_TNM"), confirmed("PATHOLOGY_GENE")]}
    />);

    expect(list().getByRole("button", { name: /흉부 X선/ })).toBeInTheDocument();
    expect(list().getByRole("button", { name: /흉부 CT/ })).toBeInTheDocument();
    expect(list().queryByRole("button", { name: /PET-CT/ })).not.toBeInTheDocument();
    expect(list().queryByRole("button", { name: /조직·유전자/ })).not.toBeInTheDocument();
  });

  it.each([
    { currentStage: "PATHOLOGY_GENE", completed: ["XRAY", "CT", "PET_CT_TNM"], draftStage: "PATHOLOGY_GENE", hidden: /조직·유전자/ },
    { currentStage: "PDL1", completed: ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE"], draftStage: "PDL1", hidden: /PD-L1/ },
  ])("does not expose the $draftStage draft at current_stage=$currentStage", ({ currentStage, completed, draftStage, hidden }) => {
    render(<AiSummaryPanel currentStage={currentStage} aiResults={[]} clinicalResults={[...completed.map(confirmed), draft(draftStage)]} />);
    expect(list().queryByRole("button", { name: hidden })).not.toBeInTheDocument();
    expect(list().getAllByRole("button")).toHaveLength(completed.length);
  });

  it("requires a confirmed treatment decision and a FINAL prescription", () => {
    const clinicalResults = [confirmed("XRAY"), confirmed("CT"), confirmed("PET_CT_TNM"), confirmed("PATHOLOGY_GENE"), confirmed("PDL1")];
    const { rerender } = render(<AiSummaryPanel
      currentStage="TREATMENT"
      aiResults={[{ analysis_type: "TREATMENT_RECOMMENDATION", status: "SUCCEEDED", result_detail: { treatment: { recommended_plan: "표적치료" } } }]}
      clinicalResults={clinicalResults}
      treatmentDecision={{ decision_status: "DRAFT", treatment_type_label: "표적치료" }}
    />);
    expect(list().queryByRole("button", { name: /치료 결정/ })).not.toBeInTheDocument();

    rerender(<AiSummaryPanel
      currentStage="PRESCRIPTION"
      aiResults={[]}
      clinicalResults={clinicalResults}
      treatmentDecision={{ decision_status: "CONFIRMED", treatment_type_label: "표적치료", treatment_plan: "치료계획" }}
      prescriptions={[
        { prescription_status: "DRAFT", cycle_number: 1 },
        { prescription_status: "VALIDATED", cycle_number: 2 },
      ]}
    />);
    expect(list().getByRole("button", { name: /치료 결정/ })).toBeInTheDocument();
    expect(list().queryByRole("button", { name: /최종 처방/ })).not.toBeInTheDocument();

    rerender(<AiSummaryPanel
      currentStage="PRESCRIPTION"
      aiResults={[]}
      clinicalResults={clinicalResults}
      treatmentDecision={{ decision_status: "CONFIRMED", treatment_type_label: "표적치료", treatment_plan: "치료계획" }}
      prescriptions={[{ prescription_status: "FINAL", prescription_status_label: "최종확정", cycle_number: 1, phase_label: "유도", items: [{ id: "drug-1" }] }]}
    />);
    expect(list().getByRole("button", { name: /최종 처방/ })).toBeInTheDocument();
  });

  it("reveals a stage only after the transition response and confirmed result agree", () => {
    const { rerender } = render(<AiSummaryPanel
      currentStage="CT"
      aiResults={[{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: 0.76 } } }]}
      clinicalResults={[confirmed("XRAY"), draft("CT"), confirmed("PDL1")]}
    />);
    expect(list().queryByRole("button", { name: /흉부 CT/ })).not.toBeInTheDocument();

    rerender(<AiSummaryPanel
      currentStage="PET_CT_TNM"
      aiResults={[
        { analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: 0.76 } } },
        { analysis_type: "PDL1_ANALYSIS", status: "SUCCEEDED", result_detail: { pdl1: { predicted_tps_range_label: "50% 이상" } } },
      ]}
      clinicalResults={[confirmed("XRAY"), confirmed("CT"), draft("PET_CT_TNM"), confirmed("PDL1")]}
    />);
    expect(list().getByRole("button", { name: /흉부 CT/ })).toBeInTheDocument();
    expect(list().queryByRole("button", { name: /PET-CT/ })).not.toBeInTheDocument();
    expect(list().queryByRole("button", { name: /PD-L1/ })).not.toBeInTheDocument();
  });
});

describe("selectPreferredAiResult", () => {
  it("prefers the latest successful result over a newer running result", () => {
    const selected = selectPreferredAiResult([
      { id: "running", analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "RUNNING", created_at: "2026-09-14T12:00:00Z" },
      { id: "old-success", analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED", completed_at: "2026-09-13T12:00:00Z" },
      { id: "new-success", analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED", completed_at: "2026-09-14T10:00:00Z" },
    ], "PATHOLOGY_GENE_ANALYSIS");
    expect(selected?.id).toBe("new-success");
  });
});
