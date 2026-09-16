import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaseInfoWorkspace } from "./case-info-workspace";

describe("CaseInfoWorkspace", () => {
  it.each([
    ["OVERVIEW", "전체 요약"],
    ["XRAY", "흉부 X선 검사·결과"],
    ["CT", "흉부 CT 검사·결과"],
    ["PATHOLOGY_GENE", "조직/유전자 검사·결과"],
    ["PDL1", "PD-L1 검사·결과"],
    ["TREATMENT", "치료 결정"],
    ["PRESCRIPTION", "처방 및 안전성 확인"],
  ] as const)("renders the %s workspace without fabricated records", (menu, title) => {
    render(<CaseInfoWorkspace menu={menu} />);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(document.body.textContent).not.toContain("홍길동");
  });

  it("keeps unavailable write actions disabled", () => {
    render(<CaseInfoWorkspace menu="PRESCRIPTION" />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  });

  it("does not describe the connected PD-L1 AI API as pending authentication", () => {
    render(<CaseInfoWorkspace menu="PDL1" />);
    expect(screen.getByText("현재 Case에 연결된 PD-L1 AI 분석 후보가 없습니다.")).toBeTruthy();
    expect(document.body).not.toHaveTextContent("인증 연동 대기");
  });
});
