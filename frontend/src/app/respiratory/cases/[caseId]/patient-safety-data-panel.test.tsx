import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PatientSafetyDataPanel } from "./patient-safety-data-panel";

vi.mock("react-day-picker", () => ({
  DayPicker: ({ onSelect }: { onSelect: (date: Date) => void }) => <button type="button" onClick={() => onSelect(new Date(2026, 8, 15))}>2026-09-15 선택</button>,
}));

function jsonResponse(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

describe("PatientSafetyDataPanel", () => {
  it.each(["none", "saved-medication"])('reports readiness from saved safety data (%s)', async (medicationMode) => {
    const caseId = `ready-${medicationMode}`;
    if (medicationMode === "none") window.localStorage.setItem(`patient-safety-no-medications:${caseId}`, "true");
    const onReadinessChange = vi.fn();
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("allergy-profile")) return jsonResponse({ allergy_status: "NONE", allergies: [], height_cm: "170", weight_kg: "65" });
      if (url.includes("lab-results")) return jsonResponse([{ id: "lab", creatinine: "0.9", ast: "20", alt: "22", total_bilirubin: "0.7", tested_at: "2026-09-15T00:00:00Z" }]);
      return jsonResponse(medicationMode === "none" ? [] : [{ id: "med", medication_name: "약품", mfds_item_seq: "123", is_active: true }]);
    });
    render(<PatientSafetyDataPanel compact caseId={caseId} apiBaseUrl="http://test" authorizedFetch={authorizedFetch} onReadinessChange={onReadinessChange} />);
    await waitFor(() => expect(onReadinessChange).toHaveBeenLastCalledWith(true));
    expect(screen.getByLabelText("Safety 입력 상태")).not.toHaveTextContent("확인 필요");
    window.localStorage.removeItem(`patient-safety-no-medications:${caseId}`);
  });

  it("does not report unsaved profile edits as complete", async () => {
    const onReadinessChange = vi.fn();
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("allergy-profile")) return jsonResponse({ allergy_status: "UNCONFIRMED", allergies: [], height_cm: "", weight_kg: "" });
      if (url.includes("lab-results")) return jsonResponse([{ id: "lab", creatinine: "0.9", ast: "20", alt: "22", total_bilirubin: "0.7", tested_at: "2026-09-15T00:00:00Z" }]);
      return jsonResponse([{ id: "med", medication_name: "약품", mfds_item_seq: "123", is_active: true }]);
    });
    render(<PatientSafetyDataPanel compact caseId="unsaved-profile" apiBaseUrl="http://test" authorizedFetch={authorizedFetch} onReadinessChange={onReadinessChange} />);
    await waitFor(() => expect(screen.getByLabelText("알레르기 상태")).toHaveValue("UNCONFIRMED"));
    fireEvent.change(screen.getByLabelText("키 (cm)"), { target: { value: "170" } });
    fireEvent.change(screen.getByLabelText("몸무게 (kg)"), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText("알레르기 상태"), { target: { value: "NONE" } });
    expect(onReadinessChange).toHaveBeenLastCalledWith(false);
  });
  it.each([true, false])("registers another lab without copying old values (compact=%s)", async (compact) => {
    const changed = vi.fn();
    const oldLab = { id: "old", creatinine: "0.9", tested_at: "2026-09-15T00:00:00Z" };
    let labs = [oldLab];
    const authorizedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("allergy-profile")) return jsonResponse({ allergy_status: "NONE", allergies: [] });
      if (!String(input).includes("lab-results")) return jsonResponse([]);
      if (init?.method === "POST") {
        const payload = JSON.parse(String(init.body));
        labs = [{ id: "new", ...payload }, oldLab];
        return jsonResponse(labs[0], 201);
      }
      return jsonResponse(labs);
    });
    render(<PatientSafetyDataPanel compact={compact} caseId="lab-add" apiBaseUrl="http://test" authorizedFetch={authorizedFetch} onDataChanged={changed} />);
    fireEvent.click(await screen.findByRole("button", { name: "새 검사값 등록" }));
    expect(screen.getByLabelText("Creatinine")).toHaveValue(null);
    expect(screen.getByLabelText("eGFR")).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "등록 취소" }));
    expect(screen.getByLabelText("Creatinine")).toHaveValue(0.9);
    expect(screen.getByLabelText("eGFR")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "새 검사값 등록" }));
    fireEvent.click(screen.getByRole("button", { name: "검사날짜 달력 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "2026-09-15 선택" }));
    const save = screen.getByRole("button", { name: compact ? "검사값 저장" : "검사실 결과 등록" });
    fireEvent.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent("검사 수치를 하나 이상");
    expect(authorizedFetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("eGFR"), { target: { value: "90" } });
    fireEvent.click(save);
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("eGFR")).toHaveValue(90);
    expect(screen.getByLabelText("eGFR")).toBeDisabled();
    expect(labs).toHaveLength(2);
    expect(labs[1]).toEqual(oldLab);
  });

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

  it("shows saved medication details in compact mode while leaving the new-entry fields empty", async () => {
    const authorizedFetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("allergy-profile")) return Promise.resolve(jsonResponse({ allergy_status: "NONE", allergies: [] }));
      if (url.includes("current-medications")) return Promise.resolve(jsonResponse([{
        id: "saved-med-1",
        medication_name: "쿠파린정5밀리그램(와파린나트륨)",
        ingredient_name: "Warfarin sodium",
        mfds_item_seq: "2005020107",
        dose: "5",
        dose_unit: "mg",
        frequency: "1일 1회",
        route: "경구",
        is_active: true,
      }]));
      return Promise.resolve(jsonResponse([]));
    });
    render(<PatientSafetyDataPanel compact caseId="saved-medication" apiBaseUrl="http://test" authorizedFetch={authorizedFetch} />);

    const saved = await screen.findByRole("article");
    expect(saved).toHaveTextContent("쿠파린정5밀리그램(와파린나트륨)");
    expect(saved).toHaveTextContent("저장됨 · 복용 중");
    expect(saved).toHaveTextContent("Warfarin sodium · ITEM_SEQ 2005020107 · 5mg · 1일 1회 · 경구");
    expect(screen.getByLabelText("약품명")).toHaveValue("");
    expect(screen.getByLabelText("성분명")).toHaveValue("");
    expect(screen.getByLabelText("MFDS ITEM_SEQ")).toHaveValue("");
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
    expect(screen.getByRole("combobox", { name: "검사날짜" })).toHaveValue("2026-09-15");
    expect(screen.getByRole("button", { name: "검사날짜 달력 열기" })).toBeDisabled();
  });

  it("selects a calendar date, keeps the ISO timestamp payload and shows the saved locked date", async () => {
    let labGets = 0;
    let savedPayload: Record<string, unknown> | null = null;
    const authorizedFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("allergy-profile")) return Promise.resolve(jsonResponse({ allergy_status: "NONE", allergies: [], height_cm: "170", weight_kg: "65" }));
      if (url.includes("current-medications")) return Promise.resolve(jsonResponse([]));
      if (init?.method === "POST") {
        savedPayload = JSON.parse(String(init.body));
        return Promise.resolve(jsonResponse({ id: "lab-1" }, 201));
      }
      labGets += 1;
      return Promise.resolve(jsonResponse(labGets > 1 ? [{ id: "lab-1", creatinine: "0.9", tested_at: "2026-09-15T00:00:00Z" }] : []));
    });
    render(<PatientSafetyDataPanel compact caseId="case-date" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);

    fireEvent.click(await screen.findByRole("button", { name: "검사날짜 달력 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "2026-09-15 선택" }));
    expect(screen.getByRole("combobox", { name: "검사날짜" })).toHaveValue("2026-09-15");
    fireEvent.change(screen.getByLabelText("Creatinine"), { target: { value: "0.9" } });
    fireEvent.click(screen.getByRole("button", { name: "검사값 저장" }));

    await waitFor(() => expect(savedPayload).toEqual(expect.objectContaining({ tested_at: "2026-09-15T00:00:00.000Z" })));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "검사날짜" })).toHaveValue("2026-09-15"));
    expect(screen.getByRole("button", { name: "검사날짜 달력 열기" })).toBeDisabled();
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
      if (url.includes("/mfds-products/")) return Promise.resolve(jsonResponse({ products: [{ item_seq: "123456", item_name: "복용약 A", item_ingr_name: "성분 A" }] }));
      if (url.includes("current-medications") && init?.method === "POST") return Promise.resolve(jsonResponse({ id: "med-1" }, 201));
      if (url.includes("current-medications")) { medicationGets += 1; return Promise.resolve(jsonResponse(medicationGets > 1 ? [{ id: "med-1", medication_name: "복용약 A", is_active: true }] : [])); }
      return Promise.resolve(jsonResponse([]));
    });

    render(<PatientSafetyDataPanel caseId="case-1" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    await waitFor(() => expect(authorizedFetch).toHaveBeenCalledTimes(3));
    await user.type(screen.getByLabelText("약품 검색"), "복용약");
    expect(await screen.findByRole("option", { name: "복용약 A · 성분 A · ITEM_SEQ 123456" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("약품명"), "123456");
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
      if (url.includes("/mfds-products/")) return Promise.resolve(jsonResponse({ products: [{ item_seq: "123456", item_name: "복용약 A", item_ingr_name: "성분 A" }] }));
      if (url.includes("current-medications") && init?.method === "POST") return Promise.resolve(jsonResponse({ id: "med-1" }, 201));
      return Promise.resolve(jsonResponse([]));
    });
    render(<PatientSafetyDataPanel caseId="case-1" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    await user.type(screen.getByLabelText("약품 검색"), "복용약");
    expect(await screen.findByRole("option", { name: "복용약 A · 성분 A · ITEM_SEQ 123456" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("약품명"), "123456");
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

  it("shows an MFDS search error locally without enabling an arbitrary medication", async () => {
    const user = userEvent.setup();
    const authorizedFetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("allergy-profile")) return Promise.resolve(jsonResponse({ allergy_status: "NONE", allergies: [] }));
      if (url.includes("/mfds-products/")) return Promise.resolve(jsonResponse({ detail: "Unavailable" }, 502));
      return Promise.resolve(jsonResponse([]));
    });
    render(<PatientSafetyDataPanel caseId="case-mfds-error" apiBaseUrl="http://api.test" authorizedFetch={authorizedFetch} />);
    await user.type(await screen.findByLabelText("약품 검색"), "아스피린");
    expect(await screen.findByText("MFDS 약품 검색에 실패했습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "복용약 등록" })).toBeDisabled();
    expect(screen.getByLabelText("약품 검색")).toHaveValue("아스피린");
  });
});
