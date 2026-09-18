import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaseOverviewPanel } from "./case-overview-panel";

const caseData = {
  case_code: "CASE-001",
  patient_name: "테스트 환자",
  patient_code: "P-001",
  current_stage: "PATHOLOGY_GENE",
  case_status: "ACTIVE",
  primary_doctor_name: "담당의",
  updated_at: "2026-09-10T04:00:00Z",
};

describe("CaseOverviewPanel", () => {
  it("prioritizes specialist results and the clinician decision in the overview", () => {
    render(
      <CaseOverviewPanel
        caseData={{
          ...caseData,
          latest_clinician_decision: {
            source_stage: "PET_CT_TNM",
            decision_type: "PROCEED_NEXT_STAGE",
            target_stage: "PATHOLOGY_GENE",
            reason: "확정 결과 확인",
            decided_by: "doctor",
            decided_at: "2026-09-10T03:00:00Z",
          },
        }}
        clinicalResults={[{ id: "clinical-1", workflow_stage: "PET_CT_TNM", exam_name: "TNM", result_status_label: "확정" }]}
        aiResults={[{ id: "ai-1", analysis_type: "PATHOLOGY_GENE_ANALYSIS", analysis_type_label: "유전자 AI", status_label: "완료" }]}
      />,
    );

    expect(screen.getByText("최근 전문과 확정 결과")).toBeTruthy();
    expect(screen.queryByText("AI 분석 후보")).toBeNull();
    expect(screen.getByText("호흡기내과 판단")).toBeTruthy();
    expect(screen.getAllByText("조직/유전자").length).toBeGreaterThan(0);
    expect(screen.getByText("다음 단계 진행")).toBeTruthy();
  });

  it("shows explicit empty states without fabricating results", () => {
    render(<CaseOverviewPanel caseData={caseData} clinicalResults={[]} aiResults={[]} />);

    expect(screen.getByText("확인 가능한 전문과 확정 결과가 없습니다.")).toBeTruthy();
    expect(screen.getByText("현재 기록된 호흡기내과 판단이 없습니다.")).toBeTruthy();
    expect(screen.getAllByText("정보 없음")).toHaveLength(6);
  });

  it("counts only confirmed clinical results and distinguishes confirmed results from AI candidates", () => {
    render(
      <CaseOverviewPanel
        caseData={{ ...caseData, current_stage: "PET_CT_TNM" }}
        clinicalResults={[
          { id: "ct", workflow_stage: "CT", result_status: "CONFIRMED" },
          { id: "gene", workflow_stage: "PATHOLOGY_GENE", result_status: "DRAFT", result_detail: { pdl1: { tps_percent: 20 } } },
        ]}
        aiResults={[{ id: "pdl1", analysis_type: "PDL1_ANALYSIS", status: "SUCCEEDED" }]}
        prescriptions={[{ id: "rx", prescription_status: "DRAFT" }]}
      />,
    );

    expect(screen.getAllByText("1건")).toHaveLength(1);
    expect(screen.getByText("전문과 확정")).toBeTruthy();
    expect(screen.getByText("AI 후보 있음")).toBeTruthy();
    expect(screen.getByText("처방 있음")).toBeTruthy();
    expect(screen.getAllByText("현재 단계")).toHaveLength(2);
  });

  it("marks only an active examination order as in progress without treating it as a result", () => {
    render(
      <CaseOverviewPanel
        caseData={{ ...caseData, current_stage: "XRAY" }}
        clinicalResults={[]}
        aiResults={[]}
        orders={[{
          id: "ct-order",
          order_type: "CT",
          order_type_label: "CT",
          status: "ORDERED",
          priority: "NORMAL",
          created_at: "2026-09-15T03:00:00Z",
          scheduled_at: "2026-09-20T01:30:00Z",
          appointment_status: "CONFIRMED",
        }]}
        ordersLoaded
      />,
    );

    expect(screen.getByText("오더 진행 중")).toBeTruthy();
    expect(screen.getByText("1건")).toBeTruthy();
    expect(screen.getByText("진행 중 검사 예약")).toBeTruthy();
    expect(screen.getByText(/예약 확정/)).toBeTruthy();
    expect(screen.getByText(/2026\. 9\. 20\./)).toBeTruthy();
    expect(screen.queryByText("결과 조회됨")).toBeNull();
  });
});
