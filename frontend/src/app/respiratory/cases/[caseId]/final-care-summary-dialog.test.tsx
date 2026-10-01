import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FinalCareSummaryDialog } from "./final-care-summary-dialog";

const prescription = {
  id: "prescription-1",
  cycle_number: 1,
  prescription_status: "FINAL",
  regimen_detail: { regimen_code: "R1", regimen_name: "Osimertinib" },
  items: [],
  safety_check_results: [],
};

function renderSummary(histologicType: string, subtype: string, doctorDisplayName: string | null = "제청하") {
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const payload = url.endsWith("/clinical-results/") ? [
      { workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: { pathology: { histologic_type: histologicType, subtype } } },
      { workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_detail: { tnm: { t_category: "T1c", n_category: "N0", m_category: "M0", stage_group: "IA3" } } },
    ] : url.endsWith("/treatment-decision/")
      ? { treatment_type_label: "표적치료", treatment_plan: "확정 계획" }
      : { patient_name: "환자", primary_doctor_name: "doctor1" };
    return new Response(JSON.stringify(payload));
  });
  render(<FinalCareSummaryDialog open caseId="case-1" apiBaseUrl="http://test" authorizedFetch={authorizedFetch} doctorDisplayName={doctorDisplayName} prescription={prescription} onClose={() => undefined} />);
}

describe("FinalCareSummaryDialog", () => {
  it("shows identical pathology values once and emphasizes diagnosis and treatment only", async () => {
    renderSummary("LUAD", "LUAD");
    const diagnosis = await screen.findByText("LUAD");
    expect(screen.queryByText("LUAD · LUAD")).not.toBeInTheDocument();
    expect(diagnosis).toHaveClass("font-bold");
    expect(diagnosis.parentElement).toHaveClass("bg-[#F0FBF8]", "border-[#D9F2EA]");
    expect(screen.getByText("T1c / N0 / M0 · Stage IA3").parentElement).toHaveClass("bg-[#F0FBF8]");
    expect(screen.getByText("표적치료").parentElement).toHaveClass("bg-[#F3F5FF]", "border-[#E1E6FC]");
    expect(screen.getByText("R1 · Osimertinib")).toHaveClass("font-bold");
    expect(screen.getByText("확정 계획").parentElement).toHaveClass("bg-[#F8F9FF]");
    expect(screen.getByText("제청하").parentElement).toHaveClass("bg-slate-50");
    expect(screen.queryByText("doctor1")).not.toBeInTheDocument();
  });

  it("keeps distinct histologic type and subtype in their original order", async () => {
    renderSummary("LUAD", "Acinar");
    expect(await screen.findByText("LUAD · Acinar")).toBeInTheDocument();
  });

  it("does not fall back to the account identifier when the display name is unavailable", async () => {
    renderSummary("LUAD", "Acinar", null);
    await screen.findByText("LUAD · Acinar");
    expect(screen.queryByText("doctor1")).not.toBeInTheDocument();
    expect(screen.getByText("담당의").parentElement).toHaveTextContent("-");
  });
});
