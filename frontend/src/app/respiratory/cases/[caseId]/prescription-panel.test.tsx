import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PrescriptionPanel } from "./prescription-panel";
import { showToast } from "@/components/ui/toast/toast";

vi.mock("@/components/ui/toast/toast", () => ({ showToast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

vi.mock("./mfds-product-selector", () => ({ MfdsProductSelector: () => null }));
vi.mock("./medication-schedule-panel", () => ({ MedicationSchedulePanel: () => <p>복약 일정</p> }));
const props = { caseId: "case-1", apiBaseUrl: "http://test", hasSelectedRegimen: true };
const base = { id: "rx-1", cycle_number: 1, regimen_detail: { regimen_name: "Test regimen", regimen_code: "TEST" }, items: [{ id: "item-1", drug_name: "Test drug", route: "INTRAVENOUS", calculated_dose: 80, final_dose: 80, unit: "mg", instructions: "Day 1" }] };
const mockFetch = (status: string, results: object[] = [], safetyFreshness = status === "DRAFT" ? (results.length ? "CURRENT" : "NOT_RUN") : "CURRENT") => vi.fn().mockImplementation(async () => new Response(JSON.stringify([{ ...base, prescription_status: status, safety_freshness: safetyFreshness, safety_check_results: results }])));

it.each(["create", "update", "safety", "finalize"])("never reports successful %s for rejected or failed requests", async action => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const failure of ["field400", "html502", "network", "unknown"]) {
    vi.mocked(showToast.success).mockClear();
    const changed = vi.fn();
    const authorizedFetch = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method) {
        if (failure === "network") throw new TypeError("Failed to fetch");
        if (failure === "unknown") throw "Disconnected";
        return failure === "field400" ? new Response(JSON.stringify({ final_dose: ["용량을 확인해 주세요."] }), { status: 400 }) : new Response("Bad Gateway", { status: 502 });
      }
      return new Response(JSON.stringify(action === "create" ? [] : [{ ...base, prescription_status: action === "finalize" ? "VALIDATED" : "DRAFT", safety_freshness: "CURRENT", safety_check_results: [] }]));
    });
    const { unmount } = render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} onPrescriptionChanged={changed} />);
    if (action === "create") {
      const button = await screen.findByRole("button", { name: "임시 처방 생성" });
      fireEvent.change(screen.getByLabelText("Cycle 시작일"), { target: { value: "2026-09-27" } });
      fireEvent.click(button);
    } else if (action === "update") {
      const button = await screen.findByRole("button", { name: "수정 저장" });
      fireEvent.change(screen.getByLabelText("Test drug 최종 용량"), { target: { value: "75" } });
      fireEvent.click(button);
    } else if (action === "safety") {
      fireEvent.click(await screen.findByRole("button", { name: "안전성 검사 실행" }));
    } else {
      fireEvent.click(await screen.findByRole("button", { name: "처방 최종 확정" }));
    }
    if (action === "safety") await screen.findByRole("alert");
    else await waitFor(() => expect(showToast.error).toHaveBeenCalled());
    expect(showToast.success).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    if (action === "safety") {
      expect(screen.queryByText("안전성 검사가 완료되었습니다.")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "처방 최종 확정" })).not.toBeInTheDocument();
      expect(screen.getByText(/현재 상태: DRAFT/)).toBeInTheDocument();
    }
    expect(screen.queryByText(/처방 DRAFT가 생성되었습니다|처방 약물 정보가 수정되었습니다|처방이 최종 확정되었습니다/)).not.toBeInTheDocument();
    if (failure === "field400") expect(screen.getByText("용량을 확인해 주세요.")).toBeInTheDocument();
    if (action === "create") expect(screen.getByLabelText("Cycle 시작일")).toHaveValue("2026-09-27");
    if (action === "update") expect(screen.getByLabelText("Test drug 최종 용량")).toHaveValue(75);
    vi.mocked(showToast.error).mockClear();
    unmount();
  }
});

it.each([
  ["DRAFT", "NOT_RUN", "미실행", "Safety Check를 먼저 실행해주세요."],
  ["VALIDATED", "RECHECK_REQUIRED", "RECHECK_REQUIRED · 재검사 필요", "검사 결과가 변경되어 Safety Check를 다시 실행해야 합니다."],
  ["VALIDATED", "CURRENT", "PASS", "안전성 검토가 완료되었습니다."],
  ["FINAL", "CURRENT", "PASS", "FINAL · 조회 전용입니다."],
])("explains %s / %s without changing its safety gate", async (status, freshness, safetyLabel, guidance) => {
  render(<PrescriptionPanel {...props} authorizedFetch={mockFetch(status, freshness === "NOT_RUN" ? [] : [{ id: "safe", check_type_label: "DUR", result: "PASS", message: "통과" }], freshness)} />);
  expect(await screen.findByText("선택 Regimen: TEST · Test regimen")).toBeInTheDocument();
  expect(screen.getByLabelText("처방 진행 상태")).toHaveTextContent(/DRAFT.*Safety Check.*VALIDATED.*FINAL/);
  expect(screen.getByRole("heading", { name: `Safety Check · ${safetyLabel}` })).toBeInTheDocument();
  expect(screen.getByText(guidance, { exact: false })).toBeInTheDocument();
  expect(screen.getByText(/계산 용량: 80mg · 최종 용량: 80mg · 투여 경로: INTRAVENOUS/)).toBeInTheDocument();
  if (status === "FINAL") expect(screen.queryByLabelText("Test drug 최종 용량")).not.toBeInTheDocument();
});

it("shows a pending safety request as checking without announcing validation", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([{ ...base, prescription_status: "DRAFT", safety_freshness: "NOT_RUN", safety_check_results: [] }])))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ ...base, prescription_status: "VALIDATED", safety_freshness: "CURRENT", safety_check_results: [{ id: "safe", check_type_label: "DUR", result: "PASS", message: "통과" }] }])));
  render(<PrescriptionPanel {...props} authorizedFetch={fetch} />);
  fireEvent.click(await screen.findByRole("button", { name: "안전성 검사 실행" }));
  expect(screen.getByRole("heading", { name: "Safety Check · 검사 중" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "처방 최종 확정" })).not.toBeInTheDocument();
  await act(async () => finish(new Response("{}")));
  expect(await screen.findByRole("button", { name: "처방 최종 확정" })).toBeEnabled();
});

it("distinguishes an accepted write from a failed refresh without announcing completion", async () => {
  vi.mocked(showToast.success).mockClear();
  const changed = vi.fn();
  let wrote = false;
  const authorizedFetch = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method) { wrote = true; return new Response("{}", { status: 201 }); }
    return new Response(wrote ? "Bad Gateway" : "[]", { status: wrote ? 502 : 200 });
  });
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} onPrescriptionChanged={changed} />);
  const button = await screen.findByRole("button", { name: "임시 처방 생성" });
  fireEvent.change(screen.getByLabelText("Cycle 시작일"), { target: { value: "2026-09-27" } });
  fireEvent.click(button);
  expect(await screen.findByText(/요청은 처리되었지만/)).toBeInTheDocument();
  expect(showToast.success).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});

it("keeps oral schedule fields separate from the final action and new prescription form", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ ...base, prescription_status: "VALIDATED", safety_freshness: "CURRENT", items: [{ ...base.items[0], route: "ORAL" }], safety_check_results: [] }])));
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  const input = await screen.findByLabelText("복용 시각");
  const fields = input.closest("div.grid");
  expect(fields).toHaveClass("overflow-y-auto");
  expect(fields).not.toContainElement(screen.getByRole("button", { name: "처방 확정 및 복약 일정 생성" }));
  expect(screen.getByRole("region", { name: "처방 약물 목록" })).toContainElement(screen.getByText("새 처방 생성 · 확정 치료결정 기반"));
});

it("keeps the safety action separate from the medication scroll and preserves its request", async () => {
  const authorizedFetch = mockFetch("DRAFT");
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  const action = await screen.findByRole("button", { name: "안전성 검사 실행" });
  const list = screen.getByRole("region", { name: "처방 약물 목록" });
  expect(list).not.toContainElement(action);
  expect(list).toHaveClass("overflow-y-auto");
  expect(screen.getByText(/Day 1/)).toBeInTheDocument();
  act(() => { action.click(); action.click(); });
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith("http://test/api/doctor/cases/case-1/prescriptions/rx-1/safety-check/", { method: "POST" }));
  expect(authorizedFetch.mock.calls.filter(([url, init]) => String(url).endsWith("/safety-check/") && init?.method === "POST")).toHaveLength(1);
});

it.each(["WARNING", "BLOCK"])("keeps %s visible and prevents final confirmation", async result => {
  render(<PrescriptionPanel {...props} authorizedFetch={mockFetch("VALIDATED", [{ id: "safety", result, check_type_label: "DUR", message: "검토 필요" }])} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(result);
  expect(screen.queryByRole("button", { name: "처방 최종 확정" })).not.toBeInTheDocument();
  if (result === "WARNING") expect(screen.getByRole("button", { name: "WARNING 확인" })).toBeEnabled();
});

it("sends the existing acknowledgment note contract", async () => {
  vi.spyOn(window, "prompt").mockReturnValue("담당의 검토");
  const authorizedFetch = mockFetch("VALIDATED", [{ id: "safety", result: "WARNING", check_type_label: "DUR", message: "검토 필요" }]);
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  fireEvent.click(await screen.findByRole("button", { name: "WARNING 확인" }));
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith(expect.stringContaining("/warnings/acknowledge/"), expect.objectContaining({ body: JSON.stringify({ acknowledgment_note: "담당의 검토" }) })));
});

it("retains finalization and allows reviewing previous prescriptions without a wizard", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const authorizedFetch = mockFetch("VALIDATED", [{ id: "safety", result: "PASS", check_type_label: "DUR", message: "통과" }]);
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  const rail = await screen.findByRole("complementary", { name: "안전성 검토 및 최종 확정" });
  fireEvent.click(within(rail).getByRole("button", { name: "처방 최종 확정" }));
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith(expect.stringContaining("/finalize/"), expect.objectContaining({ body: JSON.stringify({ medication_schedules: [] }) })));
  expect(screen.getByRole("combobox", { name: "처방 선택" })).toBeInTheDocument();
});

it("does not show a final banner when the refreshed backend status remains validated", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const authorizedFetch = mockFetch("VALIDATED", [{ id: "safety", result: "PASS", check_type_label: "DUR", message: "통과" }]);
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);

  const rail = await screen.findByRole("complementary", { name: "안전성 검토 및 최종 확정" });
  fireEvent.click(within(rail).getByRole("button", { name: "처방 최종 확정" }));

  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith(
    expect.stringContaining("/finalize/"),
    expect.any(Object),
  ));
  expect(screen.queryByText("처방이 최종 확정되었습니다.")).not.toBeInTheDocument();
  expect(within(rail).getByRole("button", { name: "처방 최종 확정" })).toBeEnabled();
});

it("creates the first draft once and requires a cycle start date", async () => {
  let resolveCreate!: (response: Response) => void;
  const authorizedFetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return new Promise<Response>(resolve => { resolveCreate = resolve; });
    return Promise.resolve(new Response(JSON.stringify([])));
  });
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  const create = await screen.findByRole("button", { name: "임시 처방 생성" });
  expect(create).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Cycle 시작일"), { target: { value: "2026-09-24" } });
  expect(create).toBeEnabled();

  act(() => { create.click(); create.click(); });

  expect(authorizedFetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await act(async () => resolveCreate(new Response(JSON.stringify({ id: "rx-1" }), { status: 201 })));
  await waitFor(() => expect(screen.getByText("처방 DRAFT가 생성되었습니다.")).toBeInTheDocument());
});

it("shows a non-drug completion path without a prescription creation CTA", async () => {
  render(<PrescriptionPanel {...props} hasSelectedRegimen={false} requiresPrescription={false} authorizedFetch={mockFetch("DRAFT")} />);
  expect(await screen.findByText(/약물 처방 없이/)).toBeInTheDocument();
  expect(screen.queryByText("처방 정보를 불러오는 중입니다.")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "임시 처방 생성" })).not.toBeInTheDocument();
});

it("keeps a final prescription visible but read-only after the case is no longer actionable", async () => {
  render(<PrescriptionPanel {...props} actionable={false} authorizedFetch={mockFetch("FINAL")} />);
  expect(await screen.findByText("최종 확정 완료 · 수정 불가")).toBeInTheDocument();
  expect(screen.getByText("저장된 안전성 검사 상세 결과가 없습니다.")).toBeInTheDocument();
  expect(screen.queryByText("안전성 검사 대기")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "수정 저장" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "안전성 검사 실행" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "처방 최종 확정" })).not.toBeInTheDocument();
});

it("keeps unresolved safety warnings in the recheck path", async () => {
  render(<PrescriptionPanel {...props} authorizedFetch={mockFetch("DRAFT", [{ id: "safety", result: "WARNING", check_type_label: "검사 데이터", source_code: "LAB_MISSING", message: "검사 필요" }])} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Safety Check를 다시 실행");
  expect(screen.getByRole("button", { name: "안전성 검사 다시 실행" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "WARNING 확인" })).not.toBeInTheDocument();
});

it("does not offer another Safety Check after validation", async () => {
  render(<PrescriptionPanel {...props} authorizedFetch={mockFetch("VALIDATED")} />);

  expect(await screen.findByRole("heading", { name: /Safety Check/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /안전성 검사/ })).not.toBeInTheDocument();
});

it("offers a backend-declared safety recheck and hides finalization while validated data is stale", async () => {
  const authorizedFetch = mockFetch("VALIDATED", [{ id: "safety", result: "PASS", check_type_label: "DUR", message: "이전 결과" }], "RECHECK_REQUIRED");
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("환자 안전성 정보가 변경되어 재검사가 필요합니다.");
  const recheck = screen.getByRole("button", { name: "안전성 재검사" });
  expect(screen.queryByRole("button", { name: "처방 최종 확정" })).not.toBeInTheDocument();

  fireEvent.click(recheck);
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith(
    "http://test/api/doctor/cases/case-1/prescriptions/rx-1/safety-check/",
    { method: "POST" },
  ));
});

it("keeps a stale final prescription read-only without offering a recheck", async () => {
  render(<PrescriptionPanel {...props} actionable={false} authorizedFetch={mockFetch("FINAL", [], "RECHECK_REQUIRED")} />);

  expect(await screen.findByText("최종 확정 완료 · 수정 불가")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "안전성 재검사" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "처방 최종 확정" })).not.toBeInTheDocument();
});
