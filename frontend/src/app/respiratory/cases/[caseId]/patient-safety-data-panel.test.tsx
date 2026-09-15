import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PatientSafetyDataPanel } from "./patient-safety-data-panel";

function jsonResponse(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

describe("PatientSafetyDataPanel", () => {
  it("loads current medications and lab results independently", async () => {
    const authorizedFetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("current-medications")) return Promise.resolve(jsonResponse([{ id: "med-1", medication_name: "복용약 A", dose: "10", dose_unit: "mg", is_active: true }]));
      return Promise.resolve(jsonResponse([{ id: "lab-1", creatinine: "0.9", egfr: "90", tested_at: "2026-09-15T01:00:00Z" }]));
    });

    render(<PatientSafetyDataPanel caseId="case-1" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    expect(await screen.findByText("복용약 A")).toBeTruthy();
    expect(await screen.findByText(/Cr 0.9 · eGFR 90/)).toBeTruthy();
  });

  it("keeps medication data visible when the lab request fails", async () => {
    const authorizedFetch = vi.fn((input: RequestInfo | URL) => String(input).includes("current-medications")
      ? Promise.resolve(jsonResponse([{ id: "med-1", medication_name: "복용약 A", is_active: true }]))
      : Promise.resolve(jsonResponse({ detail: "검사실 조회 실패" }, 500)));

    render(<PatientSafetyDataPanel caseId="case-1" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    expect(await screen.findByText("복용약 A")).toBeTruthy();
    expect(await screen.findByRole("alert")).toHaveTextContent("검사실 조회 실패");
  });

  it("posts a medication using the existing doctor API and refreshes that list", async () => {
    const user = userEvent.setup();
    let medicationGets = 0;
    const authorizedFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("current-medications") && init?.method === "POST") return Promise.resolve(jsonResponse({ id: "med-1" }, 201));
      if (url.includes("current-medications")) { medicationGets += 1; return Promise.resolve(jsonResponse(medicationGets > 1 ? [{ id: "med-1", medication_name: "복용약 A", is_active: true }] : [])); }
      return Promise.resolve(jsonResponse([]));
    });

    render(<PatientSafetyDataPanel caseId="case-1" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(2));
    await user.type(screen.getByLabelText("약품명"), "복용약 A");
    await user.click(screen.getByRole("button", { name: "복용약 등록" }));

    expect(await screen.findByText("복용약 A")).toBeTruthy();
    expect(authorizedFetch).toHaveBeenCalledWith(
      "http://api.test/api/doctor/cases/case-1/current-medications/",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
