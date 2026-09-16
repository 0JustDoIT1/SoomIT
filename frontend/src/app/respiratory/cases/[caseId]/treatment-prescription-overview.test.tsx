import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TreatmentPrescriptionOverview } from "./treatment-prescription-overview";

describe("TreatmentPrescriptionOverview", () => {
  it("summarizes only the supplied treatment and prescription state", () => {
    render(<TreatmentPrescriptionOverview treatment={{ treatment_type_label: "면역치료", selected_regimen_detail: { regimen_name: "Regimen A" } }} prescriptions={[{ id: "rx-1", prescription_status: "FINAL", safety_check_results: [{ result: "WARNING" }] }]} />);
    expect(screen.getByText("면역치료")).toBeTruthy();
    expect(screen.getByText("Regimen A")).toBeTruthy();
    expect(screen.getByText("전체 1건 · 최종 1건")).toBeTruthy();
    expect(screen.getByText("경고 1건")).toBeTruthy();
  });

  it("shows empty values without fabricating a treatment or prescription", () => {
    render(<TreatmentPrescriptionOverview treatment={null} prescriptions={[]} />);
    expect(screen.getAllByText("-")).toHaveLength(4);
    expect(screen.getAllByText("결과 없음").length).toBeGreaterThanOrEqual(6);
  });

  it("keeps confirmed specialist evidence separate from AI candidates", () => {
    render(
      <TreatmentPrescriptionOverview
        treatment={null}
        prescriptions={[]}
        clinicalResults={[
          { workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_status_label: "확정" },
          { workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED" },
          { workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: { pdl1: { tps_percent: 55 } } },
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
    expect(screen.getAllByText("전문과 확정")).toHaveLength(3);
    expect(screen.getAllByText("AI 후보")).toHaveLength(3);
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
