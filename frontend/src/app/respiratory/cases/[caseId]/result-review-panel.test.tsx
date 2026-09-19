import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultReviewPanel } from "./result-review-panel";

it("does not claim a radiology sign-off from a pulmonology CT confirmation", () => {
  const { container } = render(<ResultReviewPanel stage="CT" showEvidence={false} clinicalResult={{ workflow_stage: "CT", result_status: "CONFIRMED" }} aiResult={{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED" }} />);
  const radiology = screen.getByText("영상의학과 판독").closest("li");
  expect(radiology).toHaveTextContent("판독 상태 정보 없음");
  expect(radiology?.querySelector("[data-workflow-state]")).toHaveAttribute("data-workflow-state", "pending");
  expect(container.textContent).not.toContain("CONFIRMED");
  expect(container.textContent).not.toContain("SUCCEEDED");
});

describe("ResultReviewPanel", () => {
  it("shows the specialist-confirmed result before the AI candidate", () => {
    render(<ResultReviewPanel stage="PET_CT_TNM" clinicalResult={{ workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_status_label: "확정", result_detail: { tnm: { t_category: "cT2", n_category: "cN1", m_category: "cM0", stage_group: "IIB" } } }} aiResult={{ analysis_type: "PET_CT_TNM_ANALYSIS", status: "SUCCEEDED", status_label: "성공", result_detail: { tnm: { predicted_t: "cT1", predicted_n: "cN0", predicted_m: "cM0", confidence: 0.82 } } }} />);
    const specialist = screen.getByRole("heading", { name: "호흡기내과 최종 판단" });
    const ai = screen.getByText("AI 분석 후보");
    expect(specialist.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("AI 분석 후보")).toBeTruthy();
    expect(screen.getByText("의료진 확정 결과가 아닌 참고 자료입니다.")).toBeTruthy();
  });

  it("shows explicit empty and viewer waiting states without fabricated values", () => {
    render(<ResultReviewPanel stage="CT" />);
    expect(screen.getByText(/확인 가능한 확정 결과가 없습니다/)).toBeTruthy();
    expect(screen.getByText("현재 검사에 연결된 AI 분석 후보가 없습니다.")).toBeTruthy();
    expect(screen.getByText(/원본 영상을 확인한 뒤 AI 분석 완료 상태를 다시 확인하세요/)).toBeTruthy();
    expect(screen.getByText(/호흡기내과 최종 판단 결과 대기/)).toBeTruthy();
    expect(screen.queryByText("Annotation API 연동 대기")).toBeNull();
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
    ["XRAY", "흉부 X선"],
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

  it("shows safe analysis input traceability without a storage URI", () => {
    render(<ResultReviewPanel stage="CT" showEvidence={false} aiResult={{ analysis_type: "CT_ANALYSIS", status: "SUCCEEDED", model_components: { detector: "v2", classifier: "v1" }, input_context: { schema_version: "ct-phase1-v1", examination_order: { id: "order-12345678", order_type_label: "CT" }, source_asset: { image_type: "CT", workflow_stage: "CT", study_instance_uid: "study-1", series_instance_uid: "series-1" } } }} />);

    expect(screen.getByText("분석 입력 추적")).toBeTruthy();
    expect(screen.getByText("CT · #order-12")).toBeTruthy();
    expect(screen.getByText("CT · CT · Series series-1")).toBeTruthy();
    expect(screen.getByText("Series series-1")).toBeTruthy();
    expect(screen.getByText("detector: v2 · classifier: v1")).toBeTruthy();
    expect(screen.getByText("study-1")).toBeTruthy();
    expect(screen.getByText("ct-phase1-v1")).toBeTruthy();
    expect(screen.queryByText(/gs:\/\//)).toBeNull();
  });

  it("does not mark failed AI or unconfirmed specialist results as completed", () => {
    const { container } = render(<ResultReviewPanel stage="CT" showEvidence={false} aiResult={{ analysis_type: "CT_ANALYSIS", status: "FAILED", status_label: "실패", result_detail: {} }} clinicalResult={{ workflow_stage: "CT", result_status: "DRAFT", result_status_label: "작성 중", result_detail: {} }} />);

    expect(container.querySelectorAll('[data-workflow-state="completed"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-workflow-state="failed"]')).toHaveLength(1);
  });

  it("uses an error tone only for failed AI status", () => {
    render(<ResultReviewPanel stage="CT" showEvidence={false} aiResult={{ analysis_type: "CT_ANALYSIS", status: "FAILED", status_label: "실패", result_detail: {} }} />);
    expect(screen.getByText("AI · 실패").className).toContain("text-rose-700");
  });

  it("renders repeated result labels without relying on duplicate React keys", () => {
    render(<ResultReviewPanel stage="PATHOLOGY_GENE" showEvidence={false} clinicalResult={{ workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: { pathology: { malignancy_status_label: "악성", histologic_type: "NSCLC", subtype: "LUSC", diagnosis_summary: "악성" } } }} />);
    expect(screen.getAllByText("악성")).toHaveLength(2);
  });
});
