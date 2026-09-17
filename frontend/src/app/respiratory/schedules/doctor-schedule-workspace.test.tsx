import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../_components/respiratory-auth-provider", () => ({
  useRespiratoryAuth: () => ({
    isReady: true,
    authorizedFetch: vi.fn((input: RequestInfo | URL) => Promise.resolve(new Response(JSON.stringify(String(input).includes("weekly-availability") ? [{ id: "slot-1", weekday: 0, start_time: "09:00:00", end_time: "12:00:00", slot_minutes: 30, enabled: true }] : []), { status: 200, headers: { "Content-Type": "application/json" } }))),
  }),
}));

import { DoctorScheduleWorkspace } from "./doctor-schedule-workspace";

describe("DoctorScheduleWorkspace", () => {
  it("loads actual schedule API data and shows the fixed 30-minute interval", async () => {
    render(<DoctorScheduleWorkspace />);
    expect(await screen.findByText("09:00 – 12:00")).toBeTruthy();
    expect(screen.getByText("30분")).toBeTruthy();
    expect(screen.queryByText("백엔드 API 연동 대기")).toBeNull();
  });
});
