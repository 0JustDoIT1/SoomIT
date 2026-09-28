import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewClinicalSummary } from "./preview-clinical-summary";
import type { PreviewData } from "./preview-types";

const threeFindings = [
  { gene_symbol: "EGFR", assessment: "LIKELY_POSITIVE", alteration_code: "EGFR_EX19_DEL" },
  { gene_symbol: "BRAF", assessment: "LIKELY_NEGATIVE", alteration_code: null },
  { gene_symbol: "MET", assessment: "LIKELY_POSITIVE", alteration_code: "MET_EXON14_SKIPPING" },
];

function previewData(overrides: Partial<PreviewData> = {}): PreviewData {
  return {
    case: {},
    clinical: [
      {
        result_status: "CONFIRMED",
        workflow_stage: "PATHOLOGY_GENE",
        result_detail: {
          pathology: { histologic_type: "LUAD" },
          gene: { findings: threeFindings },
        },
      },
      {
        result_status: "CONFIRMED",
        workflow_stage: "PDL1",
        result_detail: { pdl1: { tps_percent: 60 } },
      },
    ],
    candidates: [{ cancer_type: "NSCLC" } as PreviewData["candidates"][number]],
    decision: null,
    prescriptions: [],
    allergy: null,
    labs: [],
    medications: [],
    ...overrides,
  };
}

describe("PreviewClinicalSummary", () => {
  it("preserves EGFR, BRAF, and MET in the candidate snapshot", async () => {
    const onSnapshotChange = vi.fn();
    render(<PreviewClinicalSummary data={previewData()} onSnapshotChange={onSnapshotChange} />);

    await waitFor(() => expect(onSnapshotChange).toHaveBeenCalled());
    expect(onSnapshotChange.mock.lastCall?.[0].findings).toEqual(threeFindings);
  });

  it("keeps every finding when one gene becomes indeterminate", async () => {
    const onSnapshotChange = vi.fn();
    render(<PreviewClinicalSummary data={previewData()} onSnapshotChange={onSnapshotChange} />);

    fireEvent.change(screen.getByLabelText("BRAF 임상 상태"), { target: { value: "INDETERMINATE" } });

    await waitFor(() => {
      expect(onSnapshotChange.mock.lastCall?.[0].findings).toContainEqual({
        gene_symbol: "BRAF",
        assessment: "INDETERMINATE",
        alteration_code: null,
      });
    });
    expect(onSnapshotChange.mock.lastCall?.[0].findings).toHaveLength(3);
  });

  it("reads an old single-gene snapshot and merges confirmed genes without loss", async () => {
    const onSnapshotChange = vi.fn();
    const data = previewData({
      decision: {
        input_snapshot: {
          cancer_type: "NSCLC",
          histology: "LUAD",
          findings: [{ gene_symbol: "EGFR", assessment: "LIKELY_POSITIVE", alteration_code: "EGFR_L858R" }],
          pdl1_category: "GE_50",
        },
      },
    });
    render(<PreviewClinicalSummary data={data} onSnapshotChange={onSnapshotChange} />);

    expect(screen.getByLabelText("EGFR 세부 변이")).toHaveValue("EGFR_L858R");
    await waitFor(() => expect(onSnapshotChange).toHaveBeenCalled());
    expect(onSnapshotChange.mock.lastCall?.[0].findings).toEqual([
      { gene_symbol: "EGFR", assessment: "LIKELY_POSITIVE", alteration_code: "EGFR_L858R" },
      threeFindings[1],
      threeFindings[2],
    ]);
  });

  it("does not emit an invalid positive finding until its alteration is selected", async () => {
    const onSnapshotChange = vi.fn();
    const base = previewData();
    const data = previewData({
      clinical: base.clinical.map((result) => result.workflow_stage === "PATHOLOGY_GENE"
        ? { ...result, result_detail: { ...result.result_detail, gene: { findings: [{ gene_symbol: "EGFR", assessment: "LIKELY_POSITIVE", alteration_code: null }] } } }
        : result),
    });
    render(<PreviewClinicalSummary data={data} onSnapshotChange={onSnapshotChange} />);

    expect(screen.getByText("EGFR 양성 결과는 구체적인 변이 유형을 확인해야 합니다.")).toBeInTheDocument();
    expect(onSnapshotChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("EGFR 세부 변이"), { target: { value: "EGFR_EX19_DEL" } });
    await waitFor(() => expect(onSnapshotChange).toHaveBeenCalledTimes(1));
  });
});
