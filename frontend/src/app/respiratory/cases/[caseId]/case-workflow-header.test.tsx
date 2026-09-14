import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASE_STAGES, CaseWorkflowBar } from "./case-workflow-header";
import { CurrentActionQueue } from "./current-action-queue";

describe("Case workflow first stage", () => {
  it("groups GENE with pathology and distinguishes progressed, current and upcoming stages", () => {
    const { container } = render(<CaseWorkflowBar currentStage="GENE" />);
    expect(screen.getByText("조직/유전자")).toBeTruthy();
    expect(screen.getByText("PD-L1")).toBeTruthy();
    expect(container.querySelectorAll('[data-stage-state="progressed"]')).toHaveLength(3);
    expect(container.querySelector('[data-stage-state="progressed"]')?.textContent).toContain("✓");
    expect(container.querySelectorAll('[data-stage-state="current"]')).toHaveLength(1);
    expect(container.querySelector('[data-stage-state="current"]')?.textContent).toContain("●");
    expect(container.querySelectorAll('[data-stage-state="upcoming"]')).toHaveLength(3);
    expect(container.querySelector('[data-stage-state="upcoming"]')?.textContent).toContain("○");
  });

  it("places TNM staging before pathology in the clinical flow", () => {
    expect(CASE_STAGES.map((stage) => stage.code)).toEqual([
      "XRAY", "CT", "STAGING", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "PRESCRIPTION",
    ]);
  });

  it("marks PD-L1 only when an actual result is available", () => {
    const { container, rerender } = render(<CaseWorkflowBar currentStage="GENE" />);
    expect(container.querySelectorAll('[data-stage-state="result"]')).toHaveLength(0);

    rerender(<CaseWorkflowBar currentStage="GENE" hasPdl1Result />);
    expect(container.querySelectorAll('[data-stage-state="result"]')).toHaveLength(1);
    expect(container.querySelector('[data-stage-state="result"]')?.parentElement).toHaveTextContent("PD-L1");
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
