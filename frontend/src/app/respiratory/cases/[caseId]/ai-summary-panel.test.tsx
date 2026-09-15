import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiSummaryPanel, selectPreferredAiResult } from "./ai-summary-panel";

describe("AiSummaryPanel", () => {
  it("separates AI candidates from confirmed clinician results", () => {
    render(<AiSummaryPanel aiResults={[{ analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED", status_label: "성공", model_name: "pathology-model", result_detail: { pathology: { predicted_subtype: "LUAD" } } }]} clinicalResults={[{ workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_status_label: "확정", result_detail: { pathology: { subtype: "LUSC" } } }]} />);
    expect(screen.getAllByText("AI 분석 후보").length).toBeGreaterThan(0);
    expect(screen.getAllByText("의료진 확정 결과").length).toBeGreaterThan(0);
    expect(screen.getByText("LUAD")).toBeTruthy();
    expect(screen.getByText("LUSC")).toBeTruthy();
  });

  it("does not invent unavailable results", () => {
    render(<AiSummaryPanel aiResults={[]} clinicalResults={[]} />);
    expect(screen.getAllByText("분석 결과 없음").length).toBeGreaterThan(0);
    expect(screen.getAllByText("확정 결과 없음").length).toBeGreaterThan(0);
    expect(screen.getAllByText("비교 불가").length).toBeGreaterThan(0);
  });

  it("compares only values available from both sources", () => {
    render(<AiSummaryPanel aiResults={[
      { analysis_type: "PET_CT_TNM_ANALYSIS", status: "SUCCEEDED", result_detail: { tnm: { predicted_t: "T2", predicted_n: "N1", predicted_m: "M0", predicted_stage_group: "IIB" } } },
      { analysis_type: "PDL1_ANALYSIS", status: "SUCCEEDED", result_detail: { pdl1: { predicted_tps_range: "GE_50", predicted_tps_range_label: "50% 이상", confidence: 0.93 } } },
    ]} clinicalResults={[
      { workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_detail: { tnm: { t_category: "T2", n_category: "N1", m_category: "M0", stage_group: "IIB" } } },
      { workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: { pdl1: { tps_percent: 20, interpretation: "중간 발현" } } },
    ]} />);
    expect(screen.getByText("일치")).toBeTruthy();
    expect(screen.getByText("차이 1건")).toBeTruthy();
    expect(screen.getByLabelText("결과 차이 항목")).toHaveTextContent("TPS 구간");
    expect(screen.getByLabelText("결과 차이 항목")).toHaveTextContent("AI GE 50 / 의료진 FROM 1 TO 49");
    expect(screen.getByText("50% 이상 · 신뢰도 93.0%")).toBeTruthy();
    expect(screen.getByText("TPS 20.0% · 중간 발현")).toBeTruthy();
  });

  it("shows only differing TNM fields as comparison evidence", () => {
    render(<AiSummaryPanel aiResults={[{ analysis_type: "PET_CT_TNM_ANALYSIS", status: "SUCCEEDED", result_detail: { tnm: { predicted_t: "T2", predicted_n: "N1", predicted_m: "M0" } } }]} clinicalResults={[{ workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_detail: { tnm: { t_category: "T2", n_category: "N2", m_category: "M0" } } }]} />);
    const differences = screen.getByLabelText("결과 차이 항목");
    expect(differences).toHaveTextContent("N");
    expect(differences).toHaveTextContent("AI N1 / 의료진 N2");
    expect(differences).not.toHaveTextContent("AI T2");
    expect(differences).not.toHaveTextContent("AI M0");
  });

  it("summarizes long gene results and exposes all values inside the card", () => {
    const genes = ["EGFR", "ALK", "ROS1", "KRAS"].map((gene_symbol) => ({ gene_symbol, predicted_status: "PREDICTED_POSITIVE", predicted_status_label: "양성 예측" }));
    const findings = ["EGFR", "ALK", "ROS1", "KRAS"].map((gene_symbol) => ({ gene_symbol, assessment: "POSITIVE", assessment_label: "양성" }));
    render(<AiSummaryPanel aiResults={[{ analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED", result_detail: { genes } }]} clinicalResults={[{ workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: { gene: { findings } } }]} />);
    expect(screen.getAllByText(/외 1개/)).toHaveLength(2);
    expect(screen.getByText("유전자 전체 보기")).toBeTruthy();
    expect(screen.getByLabelText("전체 유전자 결과")).toBeTruthy();
    expect(screen.getAllByText("KRAS")).toHaveLength(2);
  });

  it("does not show the gene expander for three or fewer results", () => {
    render(<AiSummaryPanel aiResults={[{ analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED", result_detail: { genes: [{ gene_symbol: "EGFR", predicted_status_label: "양성 예측" }] } }]} clinicalResults={[]} />);
    expect(screen.queryByText("유전자 전체 보기")).toBeNull();
  });

  it.each([
    ["PENDING", "분석 대기"],
    ["RUNNING", "분석 중"],
    ["SUCCEEDED", "분석 완료"],
    ["FAILED", "분석 실패"],
  ])("shows %s with the normalized status label", (status, label) => {
    render(<AiSummaryPanel aiResults={[{ analysis_type: "XRAY_ANALYSIS", status, status_label: `서버 ${status}`, result_detail: status === "SUCCEEDED" ? { xray: { assessment: "NEGATIVE", assessment_label: "음성" } } : null }]} clinicalResults={[]} />);
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it("distinguishes a completed analysis without detail from no analysis", () => {
    render(<AiSummaryPanel aiResults={[{ analysis_type: "XRAY_ANALYSIS", status: "SUCCEEDED", result_detail: null }]} clinicalResults={[]} />);
    expect(screen.getByText("결과 상세 없음")).toBeTruthy();
    expect(screen.getAllByText("분석 결과 없음").length).toBeGreaterThan(0);
  });

  it("does not compare a running analysis even if a detail payload exists", () => {
    render(<AiSummaryPanel aiResults={[{ analysis_type: "PET_CT_TNM_ANALYSIS", status: "RUNNING", result_detail: { tnm: { predicted_t: "T2" } } }]} clinicalResults={[{ workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_detail: { tnm: { t_category: "T2" } } }]} />);
    expect(screen.queryByText("일치")).toBeNull();
    expect(screen.getAllByText("비교 불가").length).toBeGreaterThan(0);
  });

  it("does not treat an unconfirmed PD-L1 result as a clinician-confirmed result", () => {
    render(<AiSummaryPanel aiResults={[{ analysis_type: "PDL1_ANALYSIS", status: "SUCCEEDED", result_detail: { pdl1: { predicted_tps_range: "GE_50" } } }]} clinicalResults={[{ workflow_stage: "PATHOLOGY_GENE", result_status: "DRAFT", result_detail: { pdl1: { tps_percent: 80 } } }]} />);
    expect(screen.getAllByText("확정 결과 없음").length).toBeGreaterThan(0);
    expect(screen.queryByText("TPS 80.0%")).toBeNull();
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

  it("uses the latest status result when no successful result exists", () => {
    const selected = selectPreferredAiResult([
      { id: "failed", analysis_type: "PET_CT_TNM_ANALYSIS", status: "FAILED", completed_at: "2026-09-14T09:00:00Z" },
      { id: "running", analysis_type: "PET_CT_TNM_ANALYSIS", status: "RUNNING", created_at: "2026-09-14T11:00:00Z" },
    ], "PET_CT_TNM_ANALYSIS");
    expect(selected?.id).toBe("running");
  });

  it("does not select a result from another analysis type", () => {
    expect(selectPreferredAiResult([{ id: "xray", analysis_type: "XRAY_ANALYSIS", status: "SUCCEEDED" }], "CT_ANALYSIS")).toBeUndefined();
  });
});
