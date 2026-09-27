import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardStageEvidence, confirmedCtLesions, confirmedStageSummary, matchedDetections } from "./dashboard-stage-evidence";

const caseItem = { id: "case-a", case_code: "CASE-A", patient_code: "P-A", patient_name: "환자 가", current_stage: "PATHOLOGY_GENE", case_status: "ACTIVE" };
const analysis = { analysis_type: "XRAY_ANALYSIS", status: "SUCCEEDED", input_context: { source_asset: { id: "asset-a" } }, result_detail: { result_payload: { image: { width: 100, height: 100 }, detections: [{ class_name: "nodule", bbox_xyxy: [10, 20, 30, 40] }, { class_name: "invalid", bbox_xyxy: [10, 20, 130, 140] }] } } };

describe("stage evidence", () => {
  it.each(["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "PRESCRIPTION"])("uses the same dashboard reference image for %s", (stage) => {
    const fetcher = vi.fn();
    render(<DashboardStageEvidence caseItem={{ ...caseItem, current_stage: stage }} status="진행 중" authorizedFetch={fetcher} />);

    const referenceImage = screen.getByTestId("stage-evidence-visual").querySelector("image");
    expect(referenceImage).toHaveAttribute("href", "/images/thorax-medical-visual-v2.webp");
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByRole("status", { name: /영상 확인 중/ })).not.toBeInTheDocument();
  });

  it("never projects unmatched or invalid detection coordinates", () => {
    expect(matchedDetections([analysis], "another-asset")).toEqual({});
    expect(matchedDetections([analysis], "asset-a").detections).toHaveLength(1);
  });

  it("never describes draft PD-L1 values as confirmed", () => {
    const result = { workflow_stage: "PDL1", result_status: "DRAFT", result_detail: { pdl1: { tps_percent: 0 } } };
    expect(confirmedStageSummary("PDL1", { clinicalResults: [result], orders: [], aiResults: [] })).toBe("");
    expect(confirmedStageSummary("PDL1", { clinicalResults: [{ ...result, result_status: "CONFIRMED" }], orders: [], aiResults: [] })).toBe("TPS 0%");
  });

  it("marks only clinician-confirmed CT lesion locations on the shared reference image", () => {
    const snapshot = {
      clinicalResults: [{
        workflow_stage: "CT",
        result_status: "CONFIRMED",
        result_detail: { ct: { nodule_observations: [
          { nodule_no: 1, lobe: "RUL", lobe_label: "우상엽", max_diameter_mm: 13.2 },
          { nodule_no: 2, lobe: "UNKNOWN", lobe_label: "미상" },
        ] } },
      }],
      orders: [],
      aiResults: [],
    };

    expect(confirmedCtLesions(snapshot)).toEqual([{ id: "ct-nodule-1", label: "결절 1 · 우상엽", lobe: "RUL", diameterMm: 13.2 }]);
    render(<DashboardStageEvidence caseItem={caseItem} snapshot={snapshot} status="검토 중" authorizedFetch={vi.fn()} />);
    expect(screen.getByText("CT 확정 병변 1곳")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "확정 CT 병변 위치 1곳" })).toBeInTheDocument();
    expect(screen.getByText(/우상엽 · 13.2mm/)).toBeInTheDocument();
  });

  it("does not invent a lesion marker from draft CT observations", () => {
    const snapshot = { clinicalResults: [{ workflow_stage: "CT", result_status: "DRAFT", result_detail: { ct: { nodule_observations: [{ nodule_no: 1, lobe: "RUL" }] } } }], orders: [], aiResults: [] };
    expect(confirmedCtLesions(snapshot)).toEqual([]);
  });
});
