import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultReviewPanel } from "./result-review-panel";

describe("ResultReviewPanel", () => {
  it("shows the specialist-confirmed result before the AI candidate", () => {
    render(<ResultReviewPanel stage="PET_CT_TNM" clinicalResult={{ workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_status_label: "확정", result_detail: { tnm: { t_category: "cT2", n_category: "cN1", m_category: "cM0", stage_group: "IIB" } } }} aiResult={{ analysis_type: "PET_CT_TNM_ANALYSIS", status: "SUCCEEDED", status_label: "성공", result_detail: { tnm: { predicted_t: "cT1", predicted_n: "cN0", predicted_m: "cM0", confidence: 0.82 } } }} />);
    const specialist = screen.getByText("전문과 확정 결과");
    const ai = screen.getByText("AI 분석 후보");
    expect(specialist.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("AI 분석 후보")).toBeTruthy();
    expect(screen.getByText("의료진 확정 결과가 아닌 참고 자료입니다.")).toBeTruthy();
  });

  it("shows explicit empty and viewer waiting states without fabricated values", () => {
    render(<ResultReviewPanel stage="CT" />);
    expect(screen.getByText(/확인 가능한 전문과 확정 결과가 없습니다/)).toBeTruthy();
    expect(screen.getByText("현재 검사에 연결된 AI 분석 후보가 없습니다.")).toBeTruthy();
    expect(screen.getByText("Annotation API 연동 대기")).toBeTruthy();
    expect(screen.getByText("연결된 영상이 없습니다.")).toBeTruthy();
  });

  it("keeps the successful AI panel when the clinical result request fails", () => {
    const onRetryClinical = vi.fn();
    render(<ResultReviewPanel stage="CT" clinicalError="전문과 결과를 불러오지 못했습니다." onRetryClinical={onRetryClinical} aiResult={{ analysis_type: "CT", status: "SUCCEEDED", result_detail: { ct: { overall_malignancy_risk: "HIGH" } } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("전문과 결과를 불러오지 못했습니다.");
    expect(screen.getByText("HIGH")).toBeTruthy();
    screen.getByRole("button", { name: "이 결과 다시 시도" }).click();
    expect(onRetryClinical).toHaveBeenCalledOnce();
  });

  it("retries the AI panel independently", () => {
    const onRetryAi = vi.fn();
    render(<ResultReviewPanel stage="CT" aiError="AI 결과를 불러오지 못했습니다." onRetryAi={onRetryAi} />);

    screen.getByRole("button", { name: "이 결과 다시 시도" }).click();
    expect(onRetryAi).toHaveBeenCalledOnce();
  });

  it.each([
    ["XRAY", "흉부 X선 검사·결과"],
    ["CT", "흉부 CT 검사·결과"],
    ["PATHOLOGY_GENE", "병리 검사·결과"],
  ])("uses the shared result layout for %s", (stage, heading) => {
    render(<ResultReviewPanel stage={stage} />);
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByText("확정 결과 없음")).toBeTruthy();
    expect(screen.getByText("AI 후보 없음")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "원본 영상" })).toBeTruthy();
  });

  it("maps the actual gene findings arrays from clinical and AI serializers", () => {
    render(
      <ResultReviewPanel
        stage="PATHOLOGY_GENE"
        clinicalResult={{
          workflow_stage: "PATHOLOGY_GENE",
          result_status: "CONFIRMED",
          result_detail: { gene: { findings: [{ gene_symbol: "EGFR", alteration_code: "L858R", assessment_label: "양성" }] } },
        }}
        aiResult={{
          analysis_type: "PATHOLOGY_GENE_ANALYSIS",
          status: "SUCCEEDED",
          result_detail: { genes: [{ gene_symbol: "ALK", predicted_status_label: "음성 예측", predicted_probability: "0.9321" }] },
        }}
      />,
    );

    expect(screen.getByText("EGFR")).toBeTruthy();
    expect(screen.getByText("양성 · L858R")).toBeTruthy();
    expect(screen.getByText("ALK")).toBeTruthy();
    expect(screen.getByText("음성 예측 · 93.21%")).toBeTruthy();
  });

  it("renders repeated result labels without relying on duplicate React keys", () => {
    render(<ResultReviewPanel stage="PATHOLOGY_GENE" showEvidence={false} clinicalResult={{ workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: { pathology: { malignancy_status_label: "악성", histologic_type: "NSCLC", subtype: "LUSC", diagnosis_summary: "악성" } } }} />);
    expect(screen.getAllByText("악성")).toHaveLength(2);
  });
});
