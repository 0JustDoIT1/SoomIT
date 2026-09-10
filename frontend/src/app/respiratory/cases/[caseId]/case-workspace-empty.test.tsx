import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CaseWorkspaceEmpty } from "./case-workspace-empty";

describe("CaseWorkspaceEmpty preview", () => {
  it("identifies the UI preview and exposes no medical records", () => {
    render(<CaseWorkspaceEmpty isPreview />);
    expect(screen.getByText("UI 미리보기 · 실제 의료 데이터 없음")).toBeTruthy();
    expect(screen.getByText("검색 결과가 없습니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "임시 저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "최종 TNM 확정" })).toBeDisabled();
  });
});
