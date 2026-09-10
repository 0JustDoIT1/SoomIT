import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CaseInfoMenu } from "./case-info-menu";

describe("CaseInfoMenu", () => {
  it("opens every respiratory workspace from the flat information menu", () => {
    const onSelect = vi.fn();
    render(<CaseInfoMenu selected="STAGING" onSelect={onSelect} />);

    for (const label of ["전체 요약", "흉부 X선", "흉부 CT", "병리", "TNM 검토", "바이오마커", "치료 결정", "처방"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }

    expect(onSelect.mock.calls.map(([key]) => key)).toEqual(["OVERVIEW", "XRAY", "CT", "PATHOLOGY", "STAGING", "GENE", "TREATMENT", "PRESCRIPTION"]);
  });

  it("marks only the selected workspace as the current page", () => {
    render(<CaseInfoMenu selected="GENE" onSelect={() => undefined} />);
    expect(screen.getByRole("button", { name: "바이오마커" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "TNM 검토" }).getAttribute("aria-current")).toBeNull();
  });
});
