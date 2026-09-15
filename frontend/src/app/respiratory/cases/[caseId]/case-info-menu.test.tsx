import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaseInfoMenu } from "./case-info-menu";

describe("CaseInfoMenu", () => {
  it("opens every respiratory workspace from the flat information menu", () => {
    const onSelect = vi.fn();
    render(<CaseInfoMenu selected="STAGING" onSelect={onSelect} />);

    for (const label of ["전체 요약", "흉부 X선", "흉부 CT", "PET-CT / TNM 병기", "조직/유전자", "PD-L1", "치료 결정", "처방", "AI 종합 분석"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }

    expect(onSelect.mock.calls.map(([key]) => key)).toEqual(["OVERVIEW", "XRAY", "CT", "STAGING", "PATHOLOGY", "GENE", "TREATMENT", "PRESCRIPTION", "AI_SUMMARY"]);
  });

  it("marks only the selected workspace as the current page", () => {
    render(<CaseInfoMenu selected="GENE" onSelect={() => undefined} />);
    expect(screen.getByRole("button", { name: "PD-L1" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "PET-CT / TNM 병기" }).getAttribute("aria-current")).toBeNull();
  });
});
