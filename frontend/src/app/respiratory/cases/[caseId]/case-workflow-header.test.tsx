import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CaseWorkflowBar } from "./case-workflow-header";
import { CurrentActionQueue } from "./current-action-queue";

describe("Case workflow first stage", () => {
  it("renders GENE as 바이오마커 and highlights only the actual current stage", () => {
    const { container } = render(<CaseWorkflowBar currentStage="GENE" />);
    expect(screen.getByText("바이오마커")).toBeTruthy();
    expect(container.querySelectorAll('[data-current-stage="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-current-stage="true"]')?.textContent).toContain("●");
    expect(container.querySelectorAll('[data-current-stage="false"]')).toHaveLength(6);
    expect(container.querySelector('[data-current-stage="false"]')?.textContent).toContain("○");
  });

  it("shows the specified empty state without inventing work", () => {
    render(<CurrentActionQueue actions={[]} onNavigate={vi.fn()} />);
    expect(screen.getByText("현재 확인 가능한 검토 작업이 없습니다.")).toBeTruthy();
  });

  it("keeps existing treatment and prescription endpoints in the Case page", () => {
    const source = readFileSync(join(process.cwd(), "src/app/respiratory/cases/[caseId]/page.tsx"), "utf8");
    expect(source).toContain("/treatment-decision/");
    expect(source).toContain("/treatment-decision/confirm/");
    expect(source).toContain("/prescriptions/");
    expect(source).toContain("/safety-check/");
    expect(source).toContain("/warnings/acknowledge/");
    expect(source).toContain("/finalize/");
  });
});
