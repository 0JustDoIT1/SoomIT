import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TreatmentPrescriptionOverview } from "./treatment-prescription-overview";

describe("TreatmentPrescriptionOverview", () => {
  it("shows treatment decision details for the prescription workspace", () => {
    render(<TreatmentPrescriptionOverview mode="PRESCRIPTION" prescriptionActionable treatment={{ treatment_type_label: "면역치료", selected_regimen_detail: { regimen_name: "Regimen A" } }} prescriptions={[]} />);
    expect(screen.getByRole("heading", { name: "치료결정 요약" })).toBeTruthy();
    expect(screen.getByText("면역치료")).toBeTruthy();
    expect(screen.getByText("Regimen A")).toBeTruthy();
    expect(screen.getByText("최종 확정")).toBeTruthy();
    expect(screen.getByText("작성 가능")).toBeTruthy();
  });

  it("describes the terminal path for a confirmed non-drug treatment", () => {
    render(<TreatmentPrescriptionOverview mode="PRESCRIPTION" prescriptionActionable treatment={{ treatment_type_label: "경과관찰", requires_prescription: false, selected_regimen_detail: null }} prescriptions={[]} />);
    expect(screen.getByText("비약물 치료")).toBeTruthy();
    expect(screen.getByText("종료·의뢰 가능")).toBeTruthy();
    expect(screen.queryByText("작성 가능")).toBeNull();
  });

  it("keeps the prescription summary in a waiting state without a treatment decision", () => {
    render(<TreatmentPrescriptionOverview mode="PRESCRIPTION" treatment={null} prescriptions={[]} />);
    expect(screen.getByText("현재 조회된 치료결정 결과가 없습니다.")).toBeTruthy();
  });

  it("shows the five current treatment prerequisites", () => {
    render(<TreatmentPrescriptionOverview treatment={{ treatment_type_label: "면역치료", selected_regimen_detail: { regimen_name: "Regimen A" } }} prescriptions={[{ id: "rx-1", prescription_status: "FINAL", safety_check_results: [{ result: "WARNING" }] }]} />);
    expect(screen.getByRole("heading", { name: "선행 결과 요약" })).toBeTruthy();
    for (const label of ["흉부 X선", "흉부 CT", "PET-CT / TNM", "조직·유전자", "PD-L1"]) expect(screen.getByText(label)).toBeTruthy();
  });

  it("shows empty values without fabricating a treatment or prescription", () => {
    render(<TreatmentPrescriptionOverview treatment={null} prescriptions={[]} />);
    expect(screen.getAllByText("결과 없음").length).toBeGreaterThanOrEqual(6);
    expect(screen.getAllByText("결과 대기").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps confirmed specialist evidence separate from AI candidates", () => {
    render(
      <TreatmentPrescriptionOverview
        treatment={null}
        prescriptions={[]}
        clinicalResults={[
          { workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_status_label: "확정" },
          { workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED" },
          { workflow_stage: "PDL1", result_status: "CONFIRMED", result_detail: { pdl1: { tps_percent: 55 } } },
        ]}
        aiResults={[
          { analysis_type: "PET_CT_TNM_ANALYSIS", status: "SUCCEEDED", status_label: "성공" },
          { analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED" },
          { analysis_type: "PDL1_ANALYSIS", status: "SUCCEEDED", result_detail: { pdl1: { predicted_tps_range_label: "≥50%" } } },
        ]}
      />,
    );

    expect(screen.getByText("TPS 55%")).toBeTruthy();
    expect(screen.getByText("≥50%")).toBeTruthy();
    expect(screen.getAllByText("확정").length).toBeGreaterThanOrEqual(5);
    expect(screen.getAllByText("AI").length).toBeGreaterThanOrEqual(5);
  });

  it("does not treat pending, running, or failed AI analyses as completed evidence", () => {
    render(
      <TreatmentPrescriptionOverview
        treatment={null}
        prescriptions={[]}
        aiResults={[
          { analysis_type: "PET_CT_TNM_ANALYSIS", status: "RUNNING" },
          { analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "PENDING" },
          { analysis_type: "PDL1_ANALYSIS", status: "FAILED", result_detail: { pdl1: { predicted_tps_range_label: "50% 이상" } } },
        ]}
      />,
    );

    expect(screen.getAllByText("결과 없음").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("50% 이상")).toBeNull();
  });
});
