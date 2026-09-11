import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { CaseWorkspaceEmpty } from "./case-workspace-empty";

describe("CaseWorkspaceEmpty preview", () => {
  it("identifies the UI preview and exposes no medical records", () => {
    render(<CaseWorkspaceEmpty isPreview />);
    expect(screen.getByText("UI 미리보기 · 실제 의료 데이터 없음")).toBeTruthy();
    expect(screen.getByText("검색 결과가 없습니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "임시 저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "최종 TNM 확정" })).toBeDisabled();
  });

  it("uses the current empty components while switching preview menus", async () => {
    const user = userEvent.setup();
    render(<CaseWorkspaceEmpty isPreview />);

    await user.click(screen.getByRole("button", { name: "전체 요약" }));
    expect(screen.getByRole("heading", { name: "전체 요약" })).toBeTruthy();
    expect(screen.getByText("확인 가능한 전문과 확정 결과가 없습니다.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "흉부 CT" }));
    expect(screen.getByRole("heading", { name: "흉부 CT 검사·결과" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "바이오마커" }));
    expect(screen.getByRole("heading", { name: "PD-L1 검사·결과" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "PD-L1 결과 비교" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "치료 결정" }));
    expect(screen.getByRole("heading", { name: "치료·처방 현황" })).toBeTruthy();
  });
});
