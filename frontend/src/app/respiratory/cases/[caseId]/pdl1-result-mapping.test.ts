import { describe, expect, it } from "vitest";

import { selectPdl1Results } from "./pdl1-result-mapping";

describe("selectPdl1Results", () => {
  it("selects only PD-L1 analyses that contain PD-L1 detail", () => {
    const results = selectPdl1Results([
      { analysis_type: "TNM_STAGING", result_detail: { tnm: {} } },
      { analysis_type: "PDL1_CLASSIFICATION", result_detail: null },
      { analysis_type: "PDL1_CLASSIFICATION", result_detail: { pdl1: { predicted_tps_range_label: "≥50%", confidence: "0.9" } } },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].result_detail.pdl1.predicted_tps_range_label).toBe("≥50%");
  });

  it("returns an empty array for an unexpected response shape", () => {
    expect(selectPdl1Results({ results: [] })).toEqual([]);
    expect(selectPdl1Results(null)).toEqual([]);
  });
});
