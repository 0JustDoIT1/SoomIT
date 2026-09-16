import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CurrentActionQueue } from "./current-action-queue";

describe("CurrentActionQueue", () => {
  it("shows the actual source separately from the action status", () => {
    render(
      <CurrentActionQueue
        actions={[
          { id: "order-1", title: "CT 검사 오더 상태 확인", source: "ORDER", sourceLabel: "검사 오더", status: "오더 요청됨", href: "/respiratory/cases/case-1", target: "CT" },
          { id: "ai-1", title: "CT AI 후보 확인", source: "AI", sourceLabel: "AI 분석 후보", status: "완료", href: "/respiratory/cases/case-1", target: "CT" },
        ]}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText("검사 오더")).toBeTruthy();
    expect(screen.getByText("AI 분석 후보")).toBeTruthy();
    expect(screen.getByText(/오더 요청됨/)).toBeTruthy();
  });

  it("opens the existing target without creating a new action", () => {
    const onOpen = vi.fn();
    const action = { id: "order-1", title: "CT 검사 오더 상태 확인", source: "ORDER" as const, sourceLabel: "검사 오더", status: "예약됨", href: "/respiratory/cases/case-1", target: "CT" as const };
    render(<CurrentActionQueue actions={[action]} onNavigate={vi.fn()} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "검토 열기" }));
    expect(onOpen).toHaveBeenCalledWith(action);
  });
});
