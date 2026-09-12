import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { compareTnmValues, TnmReviewWorkspace } from "./tnm-review-workspace";

describe("TnmReviewWorkspace", () => {
  it("keeps specialist-confirmed values separate from AI candidates", async () => {
    const user = userEvent.setup();
    render(<TnmReviewWorkspace clinicalTnm={{ t_category: "cT2", n_category: "cN1", m_category: "cM0", stage_group: "IIB" }} aiTnm={{ predicted_t: "cT1", predicted_n: "cN0", predicted_m: "cM1", confidence: 0.82 }} />);

    expect(screen.getByText("B. 전문과 확정 근거")).toBeTruthy();
    expect(screen.getByText("A. AI·규칙 후보")).toBeTruthy();
    expect(screen.getAllByText("cT2").length).toBeGreaterThan(0);
    expect(screen.getByText("cT1")).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: /N 림프절/ })[0]);
    expect(screen.getAllByText("cN1").length).toBeGreaterThan(0);
    expect(screen.getByText("cN0")).toBeTruthy();
  });

  it("does not enable unsupported review or confirmation actions", () => {
    const { container } = render(<TnmReviewWorkspace />);
    for (const label of ["cTNM 및 Stage Group 확정"]) {
      expect(screen.getByRole("button", { name: label })).toBeDisabled();
    }
    for (const label of ["채택", "수정", "재검", "보류"]) {
      expect(screen.getByRole("button", { name: label })).toBeEnabled();
    }
    expect(screen.getByText("AI 후보 · 전문과 확정 근거 · 호흡기내과 결정을 구분해 검토합니다.")).toBeTruthy();
    expect(screen.getByText("연결된 영상이 없습니다.")).toBeTruthy();
    expect(container.querySelector('[draggable="true"]')).toBeNull();
  });

  it("keeps a category draft while moving between T, N and T", async () => {
    const user = userEvent.setup();
    render(<TnmReviewWorkspace />);
    await user.type(screen.getByLabelText("최종 T 선택"), "T2");
    await user.click(screen.getAllByRole("tab", { name: /N 림프절/ })[0]);
    await user.type(screen.getByLabelText("최종 N 선택"), "N1");
    await user.click(screen.getByRole("tab", { name: /T 원발 종양/ }));
    expect(screen.getByLabelText("최종 T 선택")).toHaveValue("T2");
  });

  it("moves tabs with arrow keys and renders one tab panel", async () => {
    const user = userEvent.setup();
    render(<TnmReviewWorkspace />);
    const tTab = screen.getByRole("tab", { name: /T 원발 종양/ });
    tTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /N 림프절/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("compares values only when both results exist", () => {
    expect(compareTnmValues("T1", "T1")).toBe("MATCH");
    expect(compareTnmValues("T1", "T2")).toBe("DIFFERENCE");
    expect(compareTnmValues("T1", null)).toBe("UNAVAILABLE");
    expect(compareTnmValues(null, "T1")).toBe("UNAVAILABLE");
    expect(compareTnmValues(null, null)).toBe("EMPTY");
  });
});
