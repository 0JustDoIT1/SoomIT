import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ staffAuthenticatedFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({
  API_BASE_URL: "http://api.test",
  staffAuthenticatedFetch: api.staffAuthenticatedFetch,
}));

vi.mock("@/components/ui/toast/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn() },
}));

import AppointmentsPage from "./page";

function jsonResponse(value: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("coordinator appointments", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 21, 8));
    const scheduledAt = new Date(2026, 8, 21, 9).toISOString();
    api.staffAuthenticatedFetch.mockReset();
    api.staffAuthenticatedFetch.mockImplementation((input: string) => {
      if (input.includes("/requests/")) return jsonResponse([]);
      if (input.includes("/doctors/")) {
        return jsonResponse([{ id: "doctor-1", name: "김의사" }]);
      }
      return jsonResponse([
        {
          id: "appointment-1",
          patient_code: "P001",
          patient_name: "첫 환자",
          case_code: null,
          doctor_name: "김의사",
          scheduled_at: scheduledAt,
          appointment_status: "REQUESTED",
          created_by_type: "PATIENT",
          confirmed_at: null,
          cancelled_at: null,
          cancellation_reason: null,
          created_at: "2026-09-20T09:00:00+09:00",
          updated_at: "2026-09-20T09:00:00+09:00",
        },
        {
          id: "appointment-2",
          patient_code: "P002",
          patient_name: "둘째 환자",
          case_code: null,
          doctor_name: "김의사",
          scheduled_at: scheduledAt,
          appointment_status: "CONFIRMED",
          created_by_type: "PATIENT",
          confirmed_at: "2026-09-20T10:00:00+09:00",
          cancelled_at: null,
          cancellation_reason: null,
          created_at: "2026-09-20T09:30:00+09:00",
          updated_at: "2026-09-20T10:00:00+09:00",
        },
      ]);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses authenticated requests and shows every booking in a shared slot", async () => {
    render(<AppointmentsPage />);

    await waitFor(() => expect(api.staffAuthenticatedFetch).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole("button", { name: "주간 예약" }));

    expect(await screen.findAllByText("첫 환자")).not.toHaveLength(0);
    expect(await screen.findAllByText("둘째 환자")).not.toHaveLength(0);
    expect(
      api.staffAuthenticatedFetch.mock.calls.every(([url]) =>
        String(url).startsWith("http://api.test/api/appointments"),
      ),
    ).toBe(true);
  });
});
