import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiSummaryPanel, selectPreferredAiResult } from "./ai-summary-panel";

describe("AiSummaryPanel", () => {
  it("shows one selected analysis at a time and separates AI from confirmed clinician opinions", () => {
    render(<AiSummaryPanel aiResults={[
      { analysis_type: "XRAY_ANALYSIS", status: "SUCCEEDED", result_detail: { xray: { assessment_label: "정상" } } },
      { analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED", result_detail: { pathology: { predicted_subtype: "LUAD" } } },
    ]} clinicalResults={[
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
    render(<AiSummaryPanel aiResults={[]} clinicalResults={[]} />);
    expect(screen.getAllByText("분석 결과 없음").length).toBeGreaterThan(0);
    expect(screen.getAllByText("확정 결과 없음").length).toBeGreaterThan(0);
    expect(screen.getByText("비교 불가")).toBeTruthy();
  });

  it("shows failed AI state without treating its payload as an opinion", () => {
    render(<AiSummaryPanel aiResults={[{ analysis_type: "XRAY_ANALYSIS", status: "FAILED", error_message: "분석 요청 실패", result_detail: { xray: { assessment_label: "가짜 후보" } } }]} clinicalResults={[]} />);
    expect(screen.getAllByText("분석 실패").length).toBeGreaterThan(0);
    expect(screen.getByText("분석 요청 실패")).toBeTruthy();
    expect(screen.queryByText("가짜 후보")).toBeNull();
  });

  it("shows comparison only for the selected stage with both actual results", () => {
    render(<AiSummaryPanel aiResults={[{ analysis_type: "PET_CT_TNM_ANALYSIS", status: "SUCCEEDED", result_detail: { tnm: { predicted_t: "T2", predicted_n: "N1", predicted_m: "M0" } } }]} clinicalResults={[{ workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_detail: { tnm: { t_category: "T2", n_category: "N2", m_category: "M0" } } }]} />);
    fireEvent.click(screen.getAllByRole("button", { name: /PET-CT \/ TNM 병기/ }).find((button) => button.hasAttribute("aria-pressed"))!);
    const differences = screen.getByLabelText("결과 차이 항목");
    expect(differences).toHaveTextContent("N");
    expect(differences).toHaveTextContent("AI N1 / 의료진 N2");
    expect(differences).not.toHaveTextContent("AI T2");
  });

  it("shows all gene values only after the selected pathology item is opened", () => {
    const genes = ["EGFR", "ALK", "ROS1", "KRAS"].map((gene_symbol) => ({ gene_symbol, predicted_status: "PREDICTED_POSITIVE", predicted_status_label: "양성 예측" }));
    render(<AiSummaryPanel aiResults={[
      { analysis_type: "XRAY_ANALYSIS", status: "SUCCEEDED", result_detail: { xray: { assessment_label: "정상" } } },
      { analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED", result_detail: { genes } },
    ]} clinicalResults={[]} />);
    expect(screen.queryByText("유전자 전체 보기")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /조직·유전자 분석/ }));
    expect(screen.getByText("유전자 전체 보기")).toBeTruthy();
    expect(screen.getByLabelText("전체 유전자 결과")).toBeTruthy();
  });
});

describe("AiSummaryPanel review action", () => {
  it("opens the requested analysis evidence", () => {
    render(<AiSummaryPanel
      aiResults={[{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: 0.4 } } }]}
      clinicalResults={[]}
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
      aiResults={[
        { analysis_type: "XRAY_ANALYSIS", status: "SUCCEEDED", result_detail: { xray: { assessment_label: "X-ray result" } } },
        { analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: 0.4 } } },
      ]}
      clinicalResults={[]}
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
