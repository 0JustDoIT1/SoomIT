import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PatientsPage from "./patients/page";
import CasesPage from "./cases/page";
import CaseDetailPage from "./cases/[caseId]/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ caseId: "scope-case" }) }));
vi.mock("next/script", () => ({ default: () => null }));

const caseData = { id: "scope-case", case_code: "SCOPE-CASE", patient_name: "Synthetic", patient_code: "SCOPE-PATIENT", current_stage: "XRAY", case_status: "ACTIVE", created_at: "2026-09-27T00:00:00Z", updated_at: "2026-09-27T00:00:00Z", latest_clinician_decision: null };

describe("coordinator patient and case authentication", () => {
  beforeEach(() => {
    sessionStorage.setItem("accessToken", "dummy-staff-access");
  });
  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it.each([
    ["patient list", PatientsPage, "/api/patients/", []],
    ["case list", CasesPage, "/api/cases/", [caseData]],
    ["case detail", CaseDetailPage, "/api/cases/scope-case/", caseData],
  ] as const)("sends the staff bearer token for %s", async (_name, Page, path, data) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Page />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const request = fetchMock.mock.calls.find(([url]) => String(url).endsWith(path));
    expect(request).toBeDefined();
    expect(new Headers(request![1].headers).get("Authorization")).toBe("Bearer dummy-staff-access");
  });

  it("shows a denied patient list as an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Denied" }), { status: 403 })));
    render(<PatientsPage />);
    expect(await screen.findByText("환자 목록을 불러오지 못했습니다.")).toBeInTheDocument();
  });
});
