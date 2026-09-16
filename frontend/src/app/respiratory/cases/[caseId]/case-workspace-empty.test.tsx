import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CaseWorkspaceEmpty } from "./case-workspace-empty";

describe("CaseWorkspaceEmpty", () => {
  it("shows an API error without substituting preview medical data", () => {
    render(<CaseWorkspaceEmpty errorMessage="Case 접근 권한이 없습니다." />);

    expect(screen.getByRole("heading", { name: "Case 정보를 불러올 수 없습니다." })).toBeTruthy();
    expect(screen.getByText("Case 접근 권한이 없습니다.")).toBeTruthy();
    expect(screen.queryByText("UI 미리보기")).toBeNull();
  });
});
