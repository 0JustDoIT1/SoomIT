import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaseInfoMenu, getCaseInfoAccessState } from "./case-info-menu";

it.each(["NODULE_DETECTED", "INDETERMINATE"])("separates browsing from action eligibility after CT %s", (assessment) => {
  const clinicalResults = [{ workflow_stage: "CT", result_status: "CONFIRMED", result_detail: { ct: { overall_assessment: assessment } } }];
  render(<CaseInfoMenu selected="PDL1" currentStage="PET_CT_TNM" clinicalResults={clinicalResults} onSelect={vi.fn()} />);
  expect(screen.getByRole("button", { name: "PD-L1" })).toHaveAttribute("data-access-state", "LOCKED");
  expect(screen.getByRole("button", { name: "PD-L1" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "PET-CT / TNM 병기" })).toHaveAttribute("data-access-state", "ACTIONABLE");
  expect(screen.getByRole("button", { name: "흉부 CT" })).toHaveAttribute("data-access-state", "COMPLETED");
  expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "CT", clinicalResults: [{ ...clinicalResults[0], result_status: "DRAFT" }] }).state).toBe("LOCKED");
});

describe("CaseInfoMenu", () => {
  it("derives the pathology to PD-L1 states from confirmed results and orders", () => {
    const pathologyDraft = [{ workflow_stage: "PATHOLOGY_GENE", result_status: "DRAFT" }];
    const pathologyConfirmed = [{ workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED" }];
    const pdl1Confirmed = [...pathologyConfirmed, { workflow_stage: "PDL1", result_status: "CONFIRMED" }];

    expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "PATHOLOGY_GENE", clinicalResults: pathologyDraft })).toMatchObject({ state: "LOCKED" });
    expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "PATHOLOGY_GENE", clinicalResults: pathologyConfirmed })).toMatchObject({ state: "LOCKED" });
    expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "PDL1", clinicalResults: pathologyConfirmed, orders: [{ order_type: "PDL1", status: "ORDERED" }] })).toMatchObject({ state: "WAITING", message: expect.stringContaining("오더 요청됨") });
    expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "PDL1", clinicalResults: pathologyConfirmed, orders: [{ order_type: "PDL1", status: "SCHEDULED" }] })).toMatchObject({ state: "WAITING", message: expect.stringContaining("예약됨") });
    expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "PDL1", clinicalResults: pathologyConfirmed, orders: [{ order_type: "PDL1", status: "COMPLETED" }] })).toMatchObject({ state: "WAITING", message: expect.stringContaining("검사/분석 진행 중") });
    expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "PDL1", clinicalResults: pathologyConfirmed, orders: [{ order_type: "PDL1", status: "COMPLETED" }], aiResults: [{ analysis_type: "PDL1_ANALYSIS", status: "SUCCEEDED" }] })).toMatchObject({ state: "WAITING", message: expect.stringContaining("병리과 검토") });
    expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "PDL1", clinicalResults: pathologyConfirmed, orders: [{ order_type: "PDL1", status: "CANCELLED" }] })).toMatchObject({ state: "ACTIONABLE", message: expect.stringContaining("재오더") });
    expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "PDL1", clinicalResults: [...pathologyConfirmed, { workflow_stage: "PDL1", result_status: "DRAFT" }], orders: [{ order_type: "PDL1", status: "COMPLETED" }] })).toMatchObject({ state: "ACTIONABLE" });
    expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "PDL1", clinicalResults: pdl1Confirmed })).toMatchObject({ state: "COMPLETED" });
    expect(getCaseInfoAccessState({ key: "TREATMENT", currentStage: "PDL1", clinicalResults: pdl1Confirmed })).toMatchObject({ state: "LOCKED" });
    for (const status of ["COMPLETED", "CANCELLED"]) {
      expect(getCaseInfoAccessState({ key: "PDL1", currentStage: "PATHOLOGY_GENE", clinicalResults: pathologyConfirmed, orders: [{ order_type: "PDL1", status }] })).toMatchObject({ state: "LOCKED" });
    }
  });

  it("opens every respiratory workspace from the flat information menu", () => {
    const onSelect = vi.fn();
    render(<CaseInfoMenu selected="PET_CT_TNM" currentStage="PRESCRIPTION" onSelect={onSelect} />);

    for (const label of ["전체 요약", "흉부 X선", "흉부 CT", "PET-CT / TNM 병기", "조직/유전자", "PD-L1", "치료계획·처방", "AI 종합 분석"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }

    expect(onSelect.mock.calls.map(([key]) => key)).toEqual(["OVERVIEW", "XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "AI_SUMMARY"]);
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
    expect(ct.getAttribute("title")).toContain("현재 workflow 단계 이후");
    fireEvent.click(ct);
    fireEvent.click(screen.getByRole("button", { name: "전체 요약" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("OVERVIEW");
  });

  it("keeps downstream workspaces locked after a confirmed CT finding", () => {
    const onSelect = vi.fn();
    render(<CaseInfoMenu selected="PET_CT_TNM" currentStage="PET_CT_TNM" clinicalResults={[{
      workflow_stage: "CT",
      result_status: "CONFIRMED",
      result_detail: { ct: { overall_assessment: "NODULE_DETECTED" } },
    }]} onSelect={onSelect} />);

    const pathology = screen.getByRole("button", { name: "조직/유전자" });
    const pdl1 = screen.getByRole("button", { name: "PD-L1" });
    expect(pathology).toBeDisabled();
    expect(pathology).toHaveAttribute("data-access-state", "LOCKED");
    expect(pdl1).toBeDisabled();
    expect(pdl1).toHaveAttribute("data-access-state", "LOCKED");
    fireEvent.click(pathology);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ["XRAY", ["XRAY"]],
    ["CT", ["XRAY", "CT"]],
    ["PET_CT_TNM", ["XRAY", "CT", "PET_CT_TNM"]],
    ["PATHOLOGY_GENE", ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE"]],
    ["PDL1", ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1"]],
    ["TREATMENT", ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT"]],
    ["PRESCRIPTION", ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "PRESCRIPTION"]],
  ] as const)("uses current_stage=%s as the workflow access boundary", (currentStage, accessibleStages) => {
    const allStages = ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "PRESCRIPTION"] as const;
    for (const key of allStages) {
      const access = getCaseInfoAccessState({ key, currentStage });
      if ((accessibleStages as readonly string[]).includes(key)) expect(access.state).not.toBe("LOCKED");
      else expect(access.state).toBe("LOCKED");
    }
  });

  it("does not unlock legacy future stages from results, orders, or AI output", () => {
    const context = {
      currentStage: "PET_CT_TNM",
      clinicalResults: [
        { workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED" },
        { workflow_stage: "PDL1", result_status: "CONFIRMED" },
      ],
      orders: [{ order_type: "PDL1", status: "ORDERED" }],
      aiResults: [{ analysis_type: "PDL1_ANALYSIS", status: "SUCCEEDED" }],
    };
    expect(getCaseInfoAccessState({ key: "PATHOLOGY_GENE", ...context }).state).toBe("LOCKED");
    expect(getCaseInfoAccessState({ key: "PDL1", ...context }).state).toBe("LOCKED");
    expect(getCaseInfoAccessState({ key: "TREATMENT", ...context }).state).toBe("LOCKED");
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

  it("keeps prior stages viewable but future stages locked after a Case closes", () => {
    const pathology = getCaseInfoAccessState({ key: "PATHOLOGY_GENE", currentStage: "PRESCRIPTION", caseStatus: "CLOSED" });
    const prescription = getCaseInfoAccessState({ key: "PRESCRIPTION", currentStage: "PRESCRIPTION", caseStatus: "CLOSED" });

    expect(pathology.state).toBe("WAITING");
    expect(prescription.state).toBe("WAITING");
  });
});
