import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaseOverviewPanel } from "./case-overview-panel";

const caseData = {
  case_code: "CASE-001",
  patient_name: "테스트 환자",
  patient_code: "P-001",
  current_stage: "GENE",
  case_status: "ACTIVE",
  primary_doctor_name: "담당의",
  updated_at: "2026-09-10T04:00:00Z",
};

describe("CaseOverviewPanel", () => {
  it("separates specialist results, AI candidates and the clinician decision", () => {
    render(
      <CaseOverviewPanel
        caseData={{
          ...caseData,
          latest_clinician_decision: {
            source_stage: "STAGING",
            decision_type: "NEXT_STAGE",
            target_stage: "GENE",
            reason: "확정 결과 확인",
            decided_by: "doctor",
            decided_at: "2026-09-10T03:00:00Z",
          },
        }}
        clinicalResults={[{ id: "clinical-1", exam_type: "STAGING", exam_name: "TNM", result_status_label: "확정" }]}
        aiResults={[{ id: "ai-1", analysis_type: "GENE_PREDICTION", analysis_type_label: "유전자 AI", status_label: "완료" }]}
      />,
    );

    expect(screen.getAllByText("전문과 확정 결과").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AI 분석 후보").length).toBeGreaterThan(0);
    expect(screen.getByText("호흡기내과 판단")).toBeTruthy();
    expect(screen.getAllByText("바이오마커").length).toBeGreaterThan(0);
    expect(screen.getByText("NEXT_STAGE")).toBeTruthy();
  });

  it("shows explicit empty states without fabricating results", () => {
    render(<CaseOverviewPanel caseData={caseData} clinicalResults={[]} aiResults={[]} />);

    expect(screen.getByText("확인 가능한 전문과 확정 결과가 없습니다.")).toBeTruthy();
    expect(screen.getByText("현재 Case에 연결된 AI 분석 후보가 없습니다.")).toBeTruthy();
    expect(screen.getByText("현재 기록된 다음 행동이 없습니다.")).toBeTruthy();
  });
});
