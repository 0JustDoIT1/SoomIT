import { describe, expect, it } from "vitest";

import { filterWorklistCases } from "./case-worklist-filter";

const cases = [
  { id: "xray", case_status: "ACTIVE", current_stage: "XRAY" },
  { id: "ct", case_status: "ACTIVE", current_stage: "CT" },
  { id: "treatment", case_status: "ACTIVE", current_stage: "TREATMENT" },
  { id: "closed", case_status: "CLOSED", current_stage: "XRAY" },
];

describe("filterWorklistCases", () => {
  it("keeps every API Case for the all filter", () => {
    expect(filterWorklistCases(cases, "ALL").map((item) => item.id)).toEqual(["xray", "ct", "treatment", "closed"]);
  });

  it("filters by actual Case status and imaging stage", () => {
    expect(filterWorklistCases(cases, "ACTIVE").map((item) => item.id)).toEqual(["xray", "ct", "treatment"]);
    expect(filterWorklistCases(cases, "IMAGING").map((item) => item.id)).toEqual(["xray", "ct"]);
  });

  it("filters only Cases linked to unread notifications", () => {
    expect(filterWorklistCases(cases, "NOTIFIED", new Set(["ct", "closed", "not-assigned"])).map((item) => item.id)).toEqual(["ct", "closed"]);
  });
});
