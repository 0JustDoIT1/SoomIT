import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PathologyGeneImagingWorkspace } from "./pathology-gene-imaging-workstation";

vi.mock("./case-wsi-evidence", () => ({ CaseWsiEvidence: () => <div>H&amp;E WSI</div> }));
vi.mock("./evidence-viewer-panel", () => ({ EvidenceViewerPanel: () => <div>Evidence viewer</div> }));
vi.mock("./result-review-panel", () => ({ ResultReviewPanel: () => <div>AI 분석 후보</div> }));

describe("PathologyGeneImagingWorkspace", () => {
  it("keeps the WSI and AI result while omitting the pulmonology gene review editor", () => {
    const authorizedFetch = vi.fn();
    render(
      <PathologyGeneImagingWorkspace
        pathologyClinicalResult={{
          workflow_stage: "PATHOLOGY_GENE",
          result_status: "DRAFT",
          result_detail: {
            pathology: { histologic_type: "NSCLC" },
            gene: { findings: [{ gene_symbol: "EGFR", alteration_code: "EGFR_EX19_DEL" }] },
          },
        }}
        geneAiResult={{ analysis_type: "PATHOLOGY_GENE_ANALYSIS", status: "SUCCEEDED" }}
        caseId="case-1"
        apiBaseUrl="http://127.0.0.1:8000"
        authorizedFetch={authorizedFetch}
      />,
    );

    expect(screen.getByText("H&E WSI")).toBeTruthy();
    expect(screen.getByText("AI 분석 후보")).toBeTruthy();
    expect(screen.queryByText("호흡기내과 최종 검토")).toBeNull();
    expect(screen.queryByText("유전자 결과 및 세부 alteration")).toBeNull();
    expect(screen.queryByRole("button", { name: /DRAFT 저장|최종 확정/ })).toBeNull();
    expect(screen.queryByLabelText(/최종 assessment|상세 alteration/)).toBeNull();
    expect(authorizedFetch).not.toHaveBeenCalled();
  });

  it("keeps the local evidence fallback without exposing gene review controls", () => {
    render(<PathologyGeneImagingWorkspace />);

    expect(screen.getByText("Evidence viewer")).toBeTruthy();
    expect(screen.queryByLabelText(/최종 assessment|상세 alteration/)).toBeNull();
  });
});
