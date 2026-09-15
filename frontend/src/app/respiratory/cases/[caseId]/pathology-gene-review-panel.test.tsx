import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PathologyGeneReviewPanel } from "./pathology-gene-review-panel";

describe("PathologyGeneReviewPanel", () => {
  it("separates pathology and gene sources without fabricating missing values", () => {
    render(
      <PathologyGeneReviewPanel
        pathologyClinicalResult={{
          workflow_stage: "PATHOLOGY_GENE",
          result_status_label: "확정",
          result_detail: { pathology: { histologic_type: "NSCLC" } },
        }}
        geneAiResult={{
          analysis_type: "PATHOLOGY_GENE_ANALYSIS",
          status_label: "완료",
          result_detail: { genes: [{ gene_symbol: "EGFR", predicted_status_label: "양성 예측", predicted_probability: 0.91 }] },
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "조직/유전자 검사·결과" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "병리 검사·결과" })).toBeTruthy();
    expect(screen.getByText("NSCLC")).toBeTruthy();
    expect(screen.getByText("EGFR")).toBeTruthy();
    expect(screen.getByText("양성 예측 · 91.00%")).toBeTruthy();
  });

  it("renders the shared evidence viewer only once", () => {
    render(<PathologyGeneReviewPanel />);
  });
});
