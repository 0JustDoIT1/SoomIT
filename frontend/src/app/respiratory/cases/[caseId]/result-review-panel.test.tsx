import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultReviewPanel } from "./result-review-panel";

describe("ResultReviewPanel", () => {
  it("shows the specialist-confirmed result before the AI candidate", () => {
    render(<ResultReviewPanel stage="STAGING" clinicalResult={{ exam_type: "STAGING", result_status: "CONFIRMED", result_status_label: "확정", result_detail: { tnm: { t_category: "cT2", n_category: "cN1", m_category: "cM0", stage_group: "IIB" } } }} aiResult={{ analysis_type: "TNM_STAGING", status: "COMPLETED", status_label: "완료", result_detail: { tnm: { predicted_t: "cT1", predicted_n: "cN0", predicted_m: "cM0", confidence: 0.82 } } }} />);
    const specialist = screen.getByText("1순위 · 전문과 의료진 확정 결과");
    const ai = screen.getByText("2순위 · AI 보조 근거");
    expect(specialist.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("AI 분석 후보")).toBeTruthy();
    expect(screen.getByText("의료진 확정 결과가 아니며 최종 판단의 참고 자료입니다.")).toBeTruthy();
  });

  it("shows explicit empty and viewer waiting states without fabricated values", () => {
    render(<ResultReviewPanel stage="CT" />);
    expect(screen.getByText("확인 가능한 전문과 확정 결과가 없습니다.")).toBeTruthy();
    expect(screen.getByText("현재 단계에 연결된 AI 후보 결과가 없습니다.")).toBeTruthy();
    expect(screen.getByText("Annotation API 연동 대기")).toBeTruthy();
    expect(screen.getByText("연결된 영상 주석이 없습니다.")).toBeTruthy();
  });

  it("keeps the successful AI panel when the clinical result request fails", () => {
    render(<ResultReviewPanel stage="CT" clinicalError="전문과 결과를 불러오지 못했습니다." aiResult={{ analysis_type: "CT", status: "COMPLETED", result_detail: { ct: { overall_malignancy_risk: "HIGH" } } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("전문과 결과를 불러오지 못했습니다.");
    expect(screen.getByText("HIGH")).toBeTruthy();
    expect(screen.getByRole("button", { name: "이 패널 다시 시도" })).toBeEnabled();
  });
});
