import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { TreatmentEvidencePanel } from "./treatment-evidence-panel";

const candidates = [
  { id: "rule-1", rule_code: "TR01", priority: 1, match_reasons: ["EGFR_EX19_DEL"], regimen_detail: { id: "regimen-1", regimen_code: "R1", regimen_name: "Osimertinib" } },
  { id: "rule-2", rule_code: "TR01", priority: 2, match_reasons: ["EGFR_EX19_DEL"], regimen_detail: { id: "regimen-2", regimen_code: "R2", regimen_name: "Combination" } },
];

it("shows actual rule summary before optionally loading NCI PDQ detail", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    status: "FOUND",
    treatment_rule: { rule_code: "TR01", match_reasons: ["EGFR_EX19_DEL"], evidence_source: "NCI PDQ" },
    evidence: { answer: "상세 근거", sources: [] },
  }), { status: 200 }));

  render(<TreatmentEvidencePanel caseId="case-1" apiBaseUrl="http://test" authorizedFetch={authorizedFetch} candidates={candidates} selectedRegimen={candidates[0].regimen_detail} />);

  expect(screen.getByRole("heading", { name: "치료 결정 근거" })).toBeInTheDocument();
  expect(screen.getByText("TR01")).toBeInTheDocument();
  expect(screen.getByText("EGFR_EX19_DEL")).toBeInTheDocument();
  expect(screen.getAllByText(/R1 Osimertinib/)).toHaveLength(2);
  expect(authorizedFetch).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "상세 근거 보기" }));
  expect(await screen.findByText("NCI PDQ Evidence 상세")).toBeInTheDocument();
  expect(authorizedFetch).toHaveBeenCalledWith("http://test/api/doctor/cases/case-1/treatment-evidence/?mode=retrieve");
});
