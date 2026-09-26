import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardWorkQueues, type DashboardCase } from "./dashboard-work-queues";

const cases: DashboardCase[] = [
  { id: "a", case_code: "CASE-A", patient_code: "P-A", patient_name: "환자 가", current_stage: "CT", case_status: "ACTIVE" },
  { id: "b", case_code: "CASE-B", patient_code: "P-B", patient_name: "환자 나", current_stage: "XRAY", case_status: "ACTIVE" },
];
function setup(empty = false) {
  const callbacks = { onSelectCase: vi.fn(), onOpenCase: vi.fn(), onOpenConsultations: vi.fn(), onOpenNotification: vi.fn(), onOpenNotifications: vi.fn() };
  const props = {
    cases: empty ? [] : cases, snapshots: {}, consultations: [],
    notifications: empty ? [] : [{ id: "notice", title: "검사 결과 도착", message: "결과를 확인하세요", case_id: "a", case_code: "CASE-A", read_at: null, notification_type: "RESULT", created_at: new Date().toISOString(), payload: {} }],
    unreadNotificationCount: empty ? 0 : 1, selectedCaseId: empty ? null : "a", ...callbacks,
  };
  return { ...render(<DashboardWorkQueues {...props} />), callbacks, props };
}

describe("Dashboard full-page interactions", () => {
  beforeEach(() => localStorage.clear());

  it("keeps every lower section, Case selection, navigation and notification actions", () => {
    const { callbacks } = setup();
    for (const name of ["환자 진료 맵", "진료 타임라인", "오늘 업무 요약", "오늘 예약 일정", "지금 해야 할 일", "내 할 일", "업무 우선순위", "협진 / 알림 요약", "협진 현황", "최근 알림"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(callbacks.onSelectCase).toHaveBeenCalledWith("b");
    fireEvent.click(screen.getAllByRole("button", { name: "Case 열기" })[0]);
    expect(callbacks.onOpenCase).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: /검사 결과 도착/ }));
    expect(callbacks.onOpenNotification).toHaveBeenCalled();
    const collaboration = screen.getByRole("heading", { name: "협진 현황" }).closest("section")!;
    fireEvent.click(within(collaboration).getByRole("button", { name: /전체 보기/ }));
    expect(callbacks.onOpenConsultations).toHaveBeenCalledOnce();
  });

  it("keeps memo add, complete, persistence and delete usable", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox", { name: "개인 할 일" }), { target: { value: "검사 기록 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "검사 기록 확인 완료" }));
    expect(JSON.parse(localStorage.getItem("respiratory-dashboard-todos:a")!)[0].completed).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "검사 기록 확인 삭제" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps calendar navigation and an empty dashboard usable", () => {
    setup(true);
    const now = new Date();
    fireEvent.click(screen.getByRole("button", { name: "다음 달" }));
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(screen.getByRole("heading", { name: `${next.getFullYear()}년 ${next.getMonth() + 1}월` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(screen.getByRole("heading", { name: `${now.getFullYear()}년 ${now.getMonth() + 1}월` })).toBeInTheDocument();
    expect(screen.getByText("표시할 알림이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
