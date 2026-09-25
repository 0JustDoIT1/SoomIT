import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ authorizedFetch: vi.fn() }));

vi.mock("../_components/respiratory-auth-provider", () => ({
  useRespiratoryAuth: () => ({
    isReady: true,
    authorizedFetch: auth.authorizedFetch,
  }),
}));

import { DoctorScheduleWorkspace } from "./doctor-schedule-workspace";

describe("DoctorScheduleWorkspace appointment polling", () => {
  beforeEach(() => {
    auth.authorizedFetch.mockReset();
    auth.authorizedFetch.mockImplementation(() => Promise.resolve(new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes only the doctor appointment feed every 15 seconds", async () => {
    render(<DoctorScheduleWorkspace />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(auth.authorizedFetch).toHaveBeenCalledTimes(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(auth.authorizedFetch).toHaveBeenCalledTimes(4);
    expect(String(auth.authorizedFetch.mock.calls[3][0])).toContain("doctor/appointments");
  });

  it("keeps the right-side schedule details independently scrollable", async () => {
    render(<DoctorScheduleWorkspace />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId("schedule-detail-panel")).toHaveClass(
      "overflow-y-auto",
      "min-h-0",
    );
  });

  it("stops appointment polling after unmount", async () => {
    const { unmount } = render(<DoctorScheduleWorkspace />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(auth.authorizedFetch).toHaveBeenCalledTimes(3);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(auth.authorizedFetch).toHaveBeenCalledTimes(3);
  });
});
