import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authorizedFetch: vi.fn() }));

vi.mock("../_components/respiratory-auth-provider", () => ({
  useRespiratoryAuth: () => ({
    isReady: true,
    authorizedFetch: auth.authorizedFetch,
  }),
}));

import { DoctorScheduleWorkspace } from "./doctor-schedule-workspace";

describe("DoctorScheduleWorkspace", () => {
  beforeEach(() => {
    auth.authorizedFetch.mockReset();
    auth.authorizedFetch.mockImplementation((input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(String(input).includes("weekly-availability") ? [{ id: "slot-1", weekday: 0, start_time: "09:00:00", end_time: "12:00:00", slot_minutes: 30, enabled: true }] : []), { status: 200, headers: { "Content-Type": "application/json" } })));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads actual schedule API data and shows the fixed 30-minute interval", async () => {
    render(<DoctorScheduleWorkspace />);
    expect(await screen.findByText("09:00 – 12:00")).toBeTruthy();
    expect(screen.getByText("30분")).toBeTruthy();
    expect(screen.queryByText("백엔드 API 연동 대기")).toBeNull();
  });

  it("allows selecting multiple weekdays when adding a clinic-time interval", async () => {
    const user = userEvent.setup();
    render(<DoctorScheduleWorkspace />);
    await user.click(screen.getByRole("button", { name: "시간 입력" }));
    expect(screen.getByRole("checkbox", { name: "월" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "일" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "등록된 기본 진료시간" })).toBeNull();
    expect(screen.queryByLabelText("환자 예약 사용")).toBeNull();

    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("종료 시간"), { target: { value: "12:00" } });
    expect(screen.getByRole("checkbox", { name: "월" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "화" })).toBeEnabled();
    expect(screen.getByText("입력한 시간과 겹치는 요일은 선택할 수 없습니다.")).toBeTruthy();
  });

  it("uses 30-minute clinic-time selects instead of the browser time picker", async () => {
    const user = userEvent.setup();
    render(<DoctorScheduleWorkspace />);
    await user.click(screen.getByRole("button", { name: "시간 입력" }));

    expect(screen.getByLabelText("시작 시간")).toHaveProperty("tagName", "SELECT");
    expect(screen.getByLabelText("종료 시간")).toHaveProperty("tagName", "SELECT");
    expect(screen.getAllByRole("option", { name: "오전 9:00" })).toHaveLength(2);
    expect(screen.getAllByRole("option", { name: "오후 11:30" })).toHaveLength(2);
  });

  it("uses the in-app calendar popover for unavailable schedules", async () => {
    const user = userEvent.setup();
    render(<DoctorScheduleWorkspace />);
    await user.click(screen.getByRole("button", { name: "휴진 일정 입력" }));
    await user.click(screen.getByRole("button", { name: "진료 불가 시작 날짜 선택" }));

    expect(screen.getByRole("grid")).toBeInTheDocument();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
  });

  it.each([["12:00", "13:00"], ["08:00", "09:00"]])("allows adjacent %s–%s hours through selection and submission", async (start, end) => {
    render(<DoctorScheduleWorkspace />);
    await screen.findByText("09:00 – 12:00");
    fireEvent.click(screen.getByRole("button", { name: "시간 입력" }));
    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: start } });
    fireEvent.change(screen.getByLabelText("종료 시간"), { target: { value: end } });
    const monday = screen.getByRole("checkbox", { name: "월" });
    expect(monday).toBeEnabled();
    fireEvent.click(monday);
    fireEvent.submit(monday.closest("form")!);
    await waitFor(() => expect(auth.authorizedFetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const [, init] = auth.authorizedFetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(init.body)).toMatchObject({ weekday: 0, start_time: start, end_time: end });
  });
});
