import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewTreatmentDecision } from "./preview-treatment-decision";
import type { Candidate, InputSnapshot } from "./preview-types";

const selectedCandidate: Candidate = {
  id: "rule-1",
  rule_code: "TR01",
  priority: 1,
  regimen: "regimen-1",
  regimen_detail: { id: "regimen-1", regimen_code: "R1", regimen_name: "R1" },
  therapy_components: ["TARGETED_THERAPY"],
  therapy_label: "표적치료",
  treatment_type: "TARGETED_THERAPY",
  match_reasons: ["바이오마커 일치: EGFR / EGFR_EX19_DEL"],
  matched_drivers: [{ gene_symbol: "EGFR", alteration_codes: ["EGFR_EX19_DEL"] }],
};

const snapshot: InputSnapshot = {
  cancer_type: "NSCLC",
  histology: "LUAD",
  pdl1_category: "GE_50",
  findings: [
    { gene_symbol: "EGFR", assessment: "LIKELY_POSITIVE", alteration_code: "EGFR_EX19_DEL" },
    { gene_symbol: "BRAF", assessment: "LIKELY_POSITIVE", alteration_code: "BRAF_V600E" },
    { gene_symbol: "MET", assessment: "LIKELY_NEGATIVE", alteration_code: null },
  ],
};

describe("PreviewTreatmentDecision", () => {
  it("keeps every driver in input_snapshot after a physician selects one Regimen", () => {
    const onSave = vi.fn();
    render(
      <PreviewTreatmentDecision
        candidate={selectedCandidate}
        decision={null}
        confirmed={false}
        busy={false}
        inputSnapshot={snapshot}
        onSave={onSave}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("치료계획"), { target: { value: "R1 치료계획" } });
    fireEvent.click(screen.getByRole("button", { name: "DRAFT 저장" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      selected_regimen: "regimen-1",
      input_snapshot: snapshot,
    }));
    expect(onSave.mock.calls[0][0].input_snapshot.findings).toHaveLength(3);
  });

  it("requires an explicit Regimen selection before saving", () => {
    render(
      <PreviewTreatmentDecision
        candidate={null}
        decision={null}
        confirmed={false}
        busy={false}
        inputSnapshot={snapshot}
        onSave={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("최종 Regimen을 선택해야 치료계획을 확정할 수 있습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DRAFT 저장" })).toBeDisabled();
  });
});
