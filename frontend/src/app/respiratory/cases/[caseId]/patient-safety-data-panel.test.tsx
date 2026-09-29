import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PatientSafetyDataPanel } from "./patient-safety-data-panel";

function jsonResponse(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

describe("PatientSafetyDataPanel", () => {
  it("treats a missing profile as first input, saves it, and reloads the stored values", async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    let profileGets = 0;
    let savedPayload: Record<string, unknown> | null = null;
    const stored = { allergy_status: "PRESENT", allergies: ["Penicillin"], height_cm: "170.50", weight_kg: "65.25" };
    const authorizedFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes("allergy-profile")) return Promise.resolve(jsonResponse([]));
      if (init?.method === "PATCH") {
        savedPayload = JSON.parse(String(init.body));
        return Promise.resolve(jsonResponse(stored));
      }
      profileGets += 1;
      return Promise.resolve(profileGets === 1
        ? jsonResponse({ detail: "Patient health profile not found." }, 404)
        : jsonResponse(stored));
    });

    render(<PatientSafetyDataPanel compact caseId="case-1" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} onDataChanged={changed} />);
    expect(await screen.findByRole("region", { name: "환자 안전성 정보" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("키 (cm)"), "170.5");
    await user.type(screen.getByLabelText("몸무게 (kg)"), "65.25");
    await user.selectOptions(screen.getByLabelText("알레르기 상태"), "PRESENT");
    await user.type(screen.getByLabelText("알레르기 약품/성분"), "Penicillin");
    await user.click(screen.getByRole("button", { name: "기본정보·알레르기 저장" }));

    await waitFor(() => expect(profileGets).toBe(2));
    expect(savedPayload).toEqual({
      allergy_status: "PRESENT",
      allergies: ["Penicillin"],
      height_cm: "170.5",
      weight_kg: "65.25",
    });
    expect(screen.getByLabelText("키 (cm)")).toHaveValue(170.5);
    expect(screen.getByLabelText("몸무게 (kg)")).toHaveValue(65.25);
    expect(screen.getByLabelText("알레르기 상태")).toHaveValue("PRESENT");
    expect(screen.getByLabelText("알레르기 약품/성분")).toHaveValue("Penicillin");
    expect(changed).toHaveBeenCalledOnce();
  });

  it("renders every safety input in compact prescription mode", async () => {
    const authorizedFetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("allergy-profile")) return Promise.resolve(jsonResponse({ allergy_status: "UNCONFIRMED", allergies: [], height_cm: "", weight_kg: "" }));
      return Promise.resolve(jsonResponse([]));
    });
    render(<PatientSafetyDataPanel compact caseId="case-1" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    expect(await screen.findByRole("region", { name: "환자 안전성 정보" })).toBeInTheDocument();
    for (const label of ["키 (cm)", "몸무게 (kg)", "Creatinine", "eGFR", "AST", "ALT", "Total Bilirubin", "알레르기 상태", "약품명", "성분명", "MFDS ITEM_SEQ"]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
  });

  it("loads current medications and lab results independently", async () => {
    const authorizedFetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("allergy-profile")) return Promise.resolve(jsonResponse({ allergy_status: "NONE", allergies: [], height_cm: "170", weight_kg: "65" }));
      if (url.includes("current-medications")) return Promise.resolve(jsonResponse([{ id: "med-1", medication_name: "복용약 A", dose: "10", dose_unit: "mg", is_active: true }]));
      return Promise.resolve(jsonResponse([{ id: "lab-1", creatinine: "0.9", egfr: "90", tested_at: "2026-09-15T01:00:00Z" }]));
    });

    render(<PatientSafetyDataPanel caseId="case-1" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    expect(await screen.findByText("복용약 A")).toBeTruthy();
    expect(await screen.findByText(/Cr 0.9 · eGFR 90/)).toBeTruthy();
  });

  it("keeps medication data visible when the lab request fails", async () => {
    const authorizedFetch = vi.fn((input: RequestInfo | URL) => String(input).includes("allergy-profile")
      ? Promise.resolve(jsonResponse({ allergy_status: "NONE", allergies: [] }))
      : String(input).includes("current-medications")
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
      if (url.includes("allergy-profile")) return Promise.resolve(jsonResponse({ allergy_status: "NONE", allergies: [] }));
      if (url.includes("/api/clinical/drug-options/")) return Promise.resolve(jsonResponse([{ id: "drug-1", drug_name: "복용약 A", ingredient_name: "성분 A", mfds_item_seq: "123456" }]));
      if (url.includes("current-medications") && init?.method === "POST") return Promise.resolve(jsonResponse({ id: "med-1" }, 201));
      if (url.includes("current-medications")) { medicationGets += 1; return Promise.resolve(jsonResponse(medicationGets > 1 ? [{ id: "med-1", medication_name: "복용약 A", is_active: true }] : [])); }
      return Promise.resolve(jsonResponse([]));
    });

    render(<PatientSafetyDataPanel caseId="case-1" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(3));
    await user.type(screen.getByLabelText("약품 검색"), "복용약");
    expect(await screen.findByRole("option", { name: "복용약 A · 성분 A" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("약품명"), "drug-1");
    await user.click(screen.getByRole("button", { name: "복용약 등록" }));

    expect(await screen.findByText("복용약 A")).toBeTruthy();
    expect(authorizedFetch).toHaveBeenCalledWith(
      "http://api.test/api/doctor/cases/case-1/current-medications/",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(authorizedFetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body))).toEqual(expect.objectContaining({ medication_name: "복용약 A", ingredient_name: "성분 A", mfds_item_seq: "123456" }));
  });

  it("posts an explicit MFDS ITEM_SEQ with the current medication", async () => {
    const user = userEvent.setup();
    const authorizedFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("allergy-profile")) return Promise.resolve(jsonResponse({ allergy_status: "UNCONFIRMED", allergies: [] }));
      if (url.includes("/api/clinical/drug-options/")) return Promise.resolve(jsonResponse([{ id: "drug-1", drug_name: "복용약 A", ingredient_name: "성분 A", mfds_item_seq: "123456" }]));
      if (url.includes("current-medications") && init?.method === "POST") return Promise.resolve(jsonResponse({ id: "med-1" }, 201));
      return Promise.resolve(jsonResponse([]));
    });
    render(<PatientSafetyDataPanel caseId="case-1" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    await user.type(screen.getByLabelText("약품 검색"), "복용약");
    expect(await screen.findByRole("option", { name: "복용약 A · 성분 A" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("약품명"), "drug-1");
    await user.click(screen.getByRole("button", { name: "복용약 등록" }));
    const post = authorizedFetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual(expect.objectContaining({ medication_name: "복용약 A", ingredient_name: "성분 A", mfds_item_seq: "123456" }));
  });

  it("disables drug search and selection when no medications is checked", async () => {
    const user = userEvent.setup();
    const authorizedFetch = vi.fn((input: RequestInfo | URL) => String(input).includes("allergy-profile")
      ? Promise.resolve(jsonResponse({ allergy_status: "UNCONFIRMED", allergies: [] }))
      : Promise.resolve(jsonResponse([])));
    render(<PatientSafetyDataPanel caseId="case-no-medications" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    const checkbox = await screen.findByRole("checkbox", { name: "복용약 없음" });
    await user.click(checkbox);
    expect(screen.getByLabelText("약품 검색")).toBeDisabled();
    expect(screen.getByLabelText("약품명")).toBeDisabled();
  });
});
