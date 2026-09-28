import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewRegimenCandidates } from "./preview-regimen-candidates";
import type { Candidate, InputSnapshot } from "./preview-types";

function candidate(
  ruleCode: string,
  regimenCode: string,
  geneSymbol: string,
  alterationCode: string,
  regimenId = regimenCode,
): Candidate {
  return {
    id: `${ruleCode}-${regimenCode}`,
    rule_code: ruleCode,
    priority: 1,
    regimen: regimenId,
    regimen_detail: { id: regimenId, regimen_code: regimenCode, regimen_name: regimenCode },
    therapy_components: ["TARGETED_THERAPY"],
    therapy_label: "표적치료",
    treatment_type: "TARGETED_THERAPY",
    match_reasons: [`바이오마커 일치: ${geneSymbol} / ${alterationCode}`],
    matched_drivers: [{ gene_symbol: geneSymbol, alteration_codes: [alterationCode] }],
  };
}

const findings: InputSnapshot["findings"] = [
  { gene_symbol: "EGFR", assessment: "LIKELY_POSITIVE", alteration_code: "EGFR_EX19_DEL" },
  { gene_symbol: "BRAF", assessment: "LIKELY_POSITIVE", alteration_code: "BRAF_V600E" },
  { gene_symbol: "MET", assessment: "LIKELY_NEGATIVE", alteration_code: null },
];

describe("PreviewRegimenCandidates", () => {
  it("keeps every multi-driver candidate unselected until the physician chooses one", () => {
    const onSelect = vi.fn();
    const candidates = [
      candidate("TR01", "R1", "EGFR", "EGFR_EX19_DEL"),
      candidate("TR01", "R2", "EGFR", "EGFR_EX19_DEL"),
      candidate("TR04", "R5", "BRAF", "BRAF_V600E"),
    ];

    render(
      <PreviewRegimenCandidates
        candidates={candidates}
        treatmentType="TARGETED_THERAPY"
        selected=""
        findings={findings}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("복수의 actionable driver가 확인되었습니다.")).toBeInTheDocument();
    expect(screen.getByText("R1, R2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /R5/ })).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /R5/ }));
    expect(onSelect).toHaveBeenCalledWith(candidates[2]);
  });

  it("groups duplicate Regimen cards while preserving every rule and driver reason", () => {
    render(
      <PreviewRegimenCandidates
        candidates={[
          candidate("TR01", "R1", "EGFR", "EGFR_EX19_DEL", "regimen-1"),
          candidate("TR99", "R1", "BRAF", "BRAF_V600E", "regimen-1"),
        ]}
        treatmentType="TARGETED_THERAPY"
        selected=""
        findings={findings}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /R1/ })).toHaveLength(1);
    expect(screen.getByText("Rule: TR01, TR99")).toBeInTheDocument();
    expect(screen.getByText(/Driver: EGFR EGFR_EX19_DEL · BRAF BRAF_V600E/)).toBeInTheDocument();
  });

  it("does not treat negative or indeterminate findings as actionable drivers", () => {
    render(
      <PreviewRegimenCandidates
        candidates={[candidate("TR01", "R1", "EGFR", "EGFR_EX19_DEL")]}
        treatmentType="TARGETED_THERAPY"
        selected=""
        findings={[
          findings[0],
          { gene_symbol: "BRAF", assessment: "INDETERMINATE", alteration_code: null },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText("복수의 actionable driver가 확인되었습니다.")).not.toBeInTheDocument();
  });
});
