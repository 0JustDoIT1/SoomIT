import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaseInfoMenu, getCaseInfoAccessState } from "./case-info-menu";

it.each(["NODULE_DETECTED", "INDETERMINATE"])("separates browsing from action eligibility after CT %s", (assessment) => {
  const clinicalResults = [{ workflow_stage: "CT", result_status: "CONFIRMED", result_detail: { ct: { overall_assessment: assessment } } }];
  render(<CaseInfoMenu selected="PDL1" currentStage="PET_CT_TNM" clinicalResults={clinicalResults} onSelect={vi.fn()} />);
  expect(screen.getByRole("button", { name: "PD-L1" })).toHaveAttribute("data-access-state", "WAITING");
  expect(screen.getByRole("button", { name: "PD-L1" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "PET-CT / TNM 병기" })).toHaveAttribute("data-access-state", "ACTIONABLE");
  expect(screen.getByRole("button", { name: "흉부 CT" })).toHaveAttribute("data-access-state", "COMPLETED");
  expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "CT", clinicalResults: [{ ...clinicalResults[0], result_status: "DRAFT" }] }).state).toBe("LOCKED");
});

describe("CaseInfoMenu", () => {
  it("opens every respiratory workspace from the flat information menu", () => {
    const onSelect = vi.fn();
    render(<CaseInfoMenu selected="PET_CT_TNM" onSelect={onSelect} />);

    for (const label of ["전체 요약", "흉부 X선", "흉부 CT", "PET-CT / TNM 병기", "조직/유전자", "PD-L1", "치료 결정", "처방", "AI 종합 분석"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }

    expect(onSelect.mock.calls.map(([key]) => key)).toEqual(["OVERVIEW", "XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "PRESCRIPTION", "AI_SUMMARY"]);
  });

  it("marks only the selected workspace as the current page", () => {
    render(<CaseInfoMenu selected="PDL1" onSelect={() => undefined} />);
    expect(screen.getByRole("button", { name: "PD-L1" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "PET-CT / TNM 병기" }).getAttribute("aria-current")).toBeNull();
  });

  it("locks future stages while leaving completed stages and the overview available", () => {
    const onSelect = vi.fn();
    render(<CaseInfoMenu selected="XRAY" currentStage="XRAY" onSelect={onSelect} />);

    const ct = screen.getByRole("button", { name: "흉부 CT" });
    expect(ct).toBeDisabled();
    expect(ct.getAttribute("title")).toContain("이전 단계");
    fireEvent.click(ct);
    fireEvent.click(screen.getByRole("button", { name: "전체 요약" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("OVERVIEW");
  });

  it("opens downstream workspaces as waiting after a confirmed CT finding", () => {
    const onSelect = vi.fn();
    render(<CaseInfoMenu selected="PET_CT_TNM" currentStage="PET_CT_TNM" clinicalResults={[{
      workflow_stage: "CT",
      result_status: "CONFIRMED",
      result_detail: { ct: { overall_assessment: "NODULE_DETECTED" } },
    }]} onSelect={onSelect} />);

    const pathology = screen.getByRole("button", { name: "조직/유전자" });
    const pdl1 = screen.getByRole("button", { name: "PD-L1" });
    expect(pathology).toBeEnabled();
    expect(pathology.getAttribute("title")).toContain("PET-CT/TNM 확정 결과");
    expect(pdl1).toBeEnabled();
    expect(pdl1.getAttribute("title")).toContain("병리 확정 결과");
    fireEvent.click(pathology);
    expect(onSelect).toHaveBeenCalledWith("PATHOLOGY_GENE");
  });

  it("keeps downstream workspaces locked after a closed Case", () => {
    const onSelect = vi.fn();
    render(<CaseInfoMenu selected="CT" currentStage="CT" caseStatus="CLOSED" clinicalResults={[{
      workflow_stage: "CT",
      result_status: "CONFIRMED",
      result_detail: { ct: { overall_assessment: "NO_NODULE" } },
    }]} onSelect={onSelect} />);

    const pet = screen.getByRole("button", { name: "PET-CT / TNM 병기" });
    expect(pet).toBeDisabled();
    expect(pet.getAttribute("title")).toContain("Case가 종료");
    fireEvent.click(pet);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
