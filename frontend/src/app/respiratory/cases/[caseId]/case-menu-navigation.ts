import type { CaseInfoKey } from "./case-info-menu";

export type CaseMenuNavigation = {
  mainMenu?: "RESULTS" | "AI" | "TREATMENT" | "PRESCRIPTION";
  resultMenu?: "XRAY" | "CT" | "PATHOLOGY_GENE";
  aiMenu?: "PET_CT_TNM" | "PDL1";
};

export function getCaseMenuNavigation(menu: CaseInfoKey): CaseMenuNavigation {
  if (menu === "XRAY" || menu === "CT" || menu === "PATHOLOGY_GENE") {
    return { mainMenu: "RESULTS", resultMenu: menu };
  }
  if (menu === "PET_CT_TNM" || menu === "PDL1") {
    return { mainMenu: "AI", aiMenu: menu };
  }
  if (menu === "TREATMENT" || menu === "PRESCRIPTION") return { mainMenu: menu };
  if (menu === "AI_SUMMARY") return { mainMenu: "AI" };
  return {};
}
