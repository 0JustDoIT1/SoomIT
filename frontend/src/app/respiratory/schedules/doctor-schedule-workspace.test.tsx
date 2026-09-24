import { render, screen } from "@testing-library/react";
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
  });
});
