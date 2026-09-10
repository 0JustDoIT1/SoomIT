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
  });
});
