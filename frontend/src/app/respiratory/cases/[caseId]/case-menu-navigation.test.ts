import { describe, expect, it } from "vitest";
import { getCaseMenuNavigation } from "./case-menu-navigation";

describe("getCaseMenuNavigation", () => {
  it("opens PD-L1 through the dedicated AI and biomarker workspace", () => {
    expect(getCaseMenuNavigation("PDL1")).toEqual({ mainMenu: "AI", aiMenu: "PDL1" });
  });

  it("keeps PET-CT/TNM separate from the pathology and gene result workspace", () => {
    expect(getCaseMenuNavigation("PET_CT_TNM")).toEqual({ mainMenu: "AI", aiMenu: "PET_CT_TNM" });
    expect(getCaseMenuNavigation("PATHOLOGY_GENE")).toEqual({ mainMenu: "RESULTS", resultMenu: "PATHOLOGY_GENE" });
  });
});
