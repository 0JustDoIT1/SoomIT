import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CASE_STAGES,
  CaseSummaryHeader,
  CaseWorkflowBar,
} from "./case-workflow-header";
import { CurrentActionQueue } from "./current-action-queue";

describe("Case workflow first stage", () => {
  it.each([
    ["XRAY", "흉부 X선"],
    ["CT", "흉부 CT"],
    ["PET_CT_TNM", "PET-CT"],
    ["PATHOLOGY_GENE", "조직/유전자"],
    ["PDL1", "PD-L1"],
    ["TREATMENT", "치료 결정"],
    ["PRESCRIPTION", "처방"],
  ])("marks Case.current_stage=%s itself as current", (currentStage, label) => {
    const { container } = render(<CaseWorkflowBar currentStage={currentStage} />);
    const current = container.querySelector('[data-stage-state="current"]');

    expect(current).not.toBeNull();
    expect(current?.parentElement).toHaveTextContent(label);
    expect(container.querySelectorAll('[data-stage-state="current"]')).toHaveLength(1);
  });

  it("labels the actual Case stage independently from the viewed workspace", () => {
    render(
      <CaseSummaryHeader
        caseData={{
          patient_name: "김환자",
          patient_code: "P001",
          case_code: "C001",
          primary_doctor_name: "이의사",
          current_stage: "PATHOLOGY_GENE",
          case_status: "ACTIVE",
        }}
      />,
    );

    expect(screen.getByText("현재 Case 단계")).toBeTruthy();
    expect(screen.getByText("조직/유전자")).toBeTruthy();
  });

  it("groups PATHOLOGY_GENE with pathology and distinguishes progressed, current and upcoming stages", () => {
    const { container } = render(
      <CaseWorkflowBar currentStage="PATHOLOGY_GENE" />,
    );

    expect(screen.getByText("조직/유전자")).toBeTruthy();
    expect(screen.getByText("PD-L1")).toBeTruthy();

    expect(
      container.querySelectorAll(
        '[data-stage-state="progressed"]',
      ),
    ).toHaveLength(3);

    expect(
      container.querySelector(
        '[data-stage-state="progressed"]',
      )?.textContent,
    ).toContain("✓");

    expect(
      container.querySelectorAll(
        '[data-stage-state="current"]',
      ),
    ).toHaveLength(1);

    expect(
      container.querySelector(
        '[data-stage-state="current"]',
      )?.textContent,
    ).toContain("●");

    expect(
      container.querySelectorAll(
        '[data-stage-state="upcoming"]',
      ),
    ).toHaveLength(3);

    expect(
      container.querySelector(
        '[data-stage-state="upcoming"]',
      )?.textContent,
    ).toContain("○");
  });

  it("places TNM staging before pathology in the clinical flow", () => {
    expect(CASE_STAGES.map((stage) => stage.code)).toEqual([
      "XRAY",
      "CT",
      "PET_CT_TNM",
      "PATHOLOGY_GENE",
      "PDL1",
      "TREATMENT",
      "PRESCRIPTION",
    ]);
  });

  it("marks PD-L1 only when an actual result is available", () => {
    const { container, rerender } = render(
      <CaseWorkflowBar currentStage="PATHOLOGY_GENE" />,
    );

    expect(
      container.querySelectorAll(
        '[data-stage-state="result"]',
      ),
    ).toHaveLength(0);

    rerender(
      <CaseWorkflowBar
        currentStage="PATHOLOGY_GENE"
        hasPdl1Result
      />,
    );

    expect(
      container.querySelectorAll(
        '[data-stage-state="result"]',
      ),
    ).toHaveLength(1);

    expect(
      container.querySelector(
        '[data-stage-state="result"]',
      )?.parentElement,
    ).toHaveTextContent("PD-L1");
  });

  it("shows the specified empty state without inventing work", () => {
    render(
      <CurrentActionQueue
        actions={[]}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText("Case 전체 업무")).toBeTruthy();
    expect(
      screen.getByText(
        "현재 확인 가능한 검토 작업이 없습니다.",
      ),
    ).toBeTruthy();
  });

  it("keeps existing treatment and prescription endpoints in the Case page", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/respiratory/cases/[caseId]/page.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("/treatment-decision/");
    expect(source).toContain(
      "/treatment-decision/confirm/",
    );
    expect(source).toContain("/prescriptions/");
    expect(source).toContain("/safety-check/");
    expect(source).toContain("/warnings/acknowledge/");
    expect(source).toContain("/finalize/");
  });
});
