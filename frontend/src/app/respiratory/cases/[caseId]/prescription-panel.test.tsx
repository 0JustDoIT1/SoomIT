import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PrescriptionPanel } from "./prescription-panel";
import { showToast } from "@/components/ui/toast/toast";

vi.mock("@/components/ui/toast/toast", () => ({ showToast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));

vi.mock("./mfds-product-selector", () => ({ MfdsProductSelector: () => null }));
vi.mock("./medication-schedule-panel", () => ({ MedicationSchedulePanel: () => <p>복약 일정</p> }));
const safetyMock = vi.hoisted(() => ({ ready: true }));
vi.mock("./patient-safety-data-panel", () => ({ PatientSafetyDataPanel: ({ compact, onReadinessChange }: { compact?: boolean; onReadinessChange?: (ready: boolean) => void }) => {
  useEffect(() => { onReadinessChange?.(safetyMock.ready); }, [onReadinessChange]);
  return compact ? <section aria-label="환자 안전성 정보">안전성 입력 폼</section> : null;
} }));
const openStartDialog = async () => { const button = await screen.findByRole("button", { name: "처방 시작" }); await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button); return screen.getByRole("dialog", { name: "처방 시작" }); };
const props = { caseId: "case-1", apiBaseUrl: "http://test", hasSelectedRegimen: true, availablePrescriptionPhases: ["INDUCTION"] };
const base = { id: "rx-1", cycle_number: 1, regimen_detail: { regimen_name: "Test regimen", regimen_code: "TEST" }, items: [{ id: "item-1", drug_name: "Test drug", route: "INTRAVENOUS", calculated_dose: 80, final_dose: 80, unit: "mg", instructions: "Day 1" }] };
const mockFetch = (status: string, results: object[] = [], safetyFreshness = status === "DRAFT" ? (results.length ? "CURRENT" : "NOT_RUN") : "CURRENT") => vi.fn().mockImplementation(async () => new Response(JSON.stringify([{ ...base, prescription_status: status, safety_freshness: safetyFreshness, safety_check_results: results }])));
const confirmFinalization = () => fireEvent.click(within(screen.getByRole("alertdialog", { name: "처방 최종 확정" })).getByRole("button", { name: "처방 확정" }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("calls the existing Safety Check API when demo mode is off", async () => {
  vi.stubEnv("NEXT_PUBLIC_SAFETY_DEMO", "false");
  const authorizedFetch = mockFetch("DRAFT");
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  fireEvent.click(await screen.findByRole("button", { name: "안전성 검사 실행" }));
  await waitFor(() => expect(authorizedFetch.mock.calls.some(([url, init]) =>
    String(url).endsWith("/safety-check/") && init?.method === "POST",
  )).toBe(true));
});

it("waits 2.5 seconds, uses the demo transition, and renders the stored PASS result", async () => {
  vi.stubEnv("NEXT_PUBLIC_SAFETY_DEMO", "true");
  let validated = false;
  const pass = [{ id: "demo-pass", check_type_label: "신장기능", result: "PASS", message: "시연용 PASS · 신장기능 적합 (실제 검증 미실행)" }];
  const authorizedFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      expect(String(url)).toContain("/demo-safety-check/");
      validated = true;
      return new Response(JSON.stringify({ ...base, prescription_status: "VALIDATED", safety_freshness: "CURRENT", safety_check_results: pass }));
    }
    return new Response(JSON.stringify([{ ...base, prescription_status: validated ? "VALIDATED" : "DRAFT", safety_freshness: validated ? "CURRENT" : "NOT_RUN", safety_check_results: validated ? pass : [] }]));
  });
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  const safetyButton = await screen.findByRole("button", { name: "안전성 검사 실행" });
  vi.useFakeTimers();
  fireEvent.click(safetyButton);
  expect(screen.getByRole("button", { name: "Safety Check 검사 중..." })).toBeDisabled();

  await act(async () => { await vi.advanceTimersByTimeAsync(2_499); });
  expect(authorizedFetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  vi.useRealTimers();

  await waitFor(() => expect(screen.getByText(/현재 상태: VALIDATED/)).toBeInTheDocument());
  expect(screen.getByText("시연용 PASS · 신장기능 적합 (실제 검증 미실행)")).toBeInTheDocument();
  expect(screen.getByText("신장기능 · PASS")).toBeInTheDocument();
  expect(authorizedFetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(authorizedFetch.mock.calls.some(([url]) => String(url).endsWith("/safety-check/"))).toBe(false);
});

it("renders patient safety inputs in the left prescription workspace", async () => {
  render(<PrescriptionPanel {...props} authorizedFetch={mockFetch("DRAFT")} />);
  expect(await screen.findByRole("region", { name: "환자 안전성 정보" })).toBeVisible();
  expect(screen.getByText("안전성 입력 폼")).toBeVisible();
});

it("keeps prescription start disabled until saved safety inputs are complete", async () => {
  safetyMock.ready = false;
  try {
    render(<PrescriptionPanel {...props} authorizedFetch={vi.fn().mockResolvedValue(new Response("[]"))} />);
    expect(await screen.findByRole("button", { name: "처방 시작" })).toBeDisabled();
    expect(screen.queryByRole("dialog", { name: "처방 시작" })).not.toBeInTheDocument();
  } finally { safetyMock.ready = true; }
});

it("closes the start dialog on Escape without creating a prescription", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response("[]"));
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  await openStartDialog();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "처방 시작" })).not.toBeInTheDocument();
  expect(authorizedFetch.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});

it("offers only medication phases configured for the selected regimen", async () => {
  render(<PrescriptionPanel {...props} availablePrescriptionPhases={["MAINTENANCE"]} authorizedFetch={vi.fn().mockResolvedValue(new Response(JSON.stringify([])))} />);
  await openStartDialog();
  const phase = await screen.findByLabelText("치료 단계");
  expect(phase).toHaveValue("MAINTENANCE");
  expect(within(phase).getByRole("option", { name: "MAINTENANCE · 유지요법" })).toBeInTheDocument();
  expect(within(phase).queryByRole("option", { name: /INDUCTION/ })).not.toBeInTheDocument();
});

it("blocks creation when the selected regimen has no medication schedule", async () => {
  render(<PrescriptionPanel {...props} availablePrescriptionPhases={[]} authorizedFetch={vi.fn().mockResolvedValue(new Response(JSON.stringify([])))} />);

  expect(await screen.findByText("선택한 Regimen에 등록된 약물 치료 단계가 없습니다. Regimen 약물 스케줄을 확인해주세요.")).toBeVisible();
  expect(screen.getByRole("button", { name: "처방 시작" })).toBeDisabled();
});

it("renders decimal doses without storage-only trailing zeroes", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
    ...base,
    prescription_status: "FINAL",
    safety_freshness: "CURRENT",
    items: [{ ...base.items[0], calculated_dose: "80.000", final_dose: "3.000", unit: "mg" }],
    safety_check_results: [],
  }])));
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);

  expect(await screen.findByText(/계산 용량: 80mg · 최종 용량: 3mg/)).toBeInTheDocument();
  expect(screen.queryByText(/80\.000mg|3\.000mg/)).not.toBeInTheDocument();
});

it.each(["create", "update", "safety", "finalize"])("never reports successful %s for rejected or failed requests", async action => {
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
      await openStartDialog();
      const button = await screen.findByRole("button", { name: "처방 초안 생성" });
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
      confirmFinalization();
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
    if (action === "create") {
      expect(screen.getByRole("dialog", { name: "처방 시작" })).toBeInTheDocument();
      expect(screen.getByLabelText("Cycle 시작일")).toHaveValue("2026-09-27");
    }
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

it("keeps the prescription workspace mounted while a medication edit refreshes in the background", async () => {
  const changed = vi.fn();
  let resolveRefresh!: (value: Response) => void;
  let listRequests = 0;
  const authorizedFetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") return Promise.resolve(new Response("{}"));
    listRequests += 1;
    if (listRequests === 1) return Promise.resolve(new Response(JSON.stringify([{ ...base, prescription_status: "DRAFT", safety_freshness: "NOT_RUN", safety_check_results: [] }])));
    return new Promise<Response>(resolve => { resolveRefresh = resolve; });
  });
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} onPrescriptionChanged={changed} />);

  fireEvent.change(await screen.findByLabelText("Test drug 최종 용량"), { target: { value: "75" } });
  fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
  await waitFor(() => expect(listRequests).toBe(2));

  expect(screen.queryByText("처방 정보를 불러오는 중입니다.")).not.toBeInTheDocument();
  expect(screen.getByText("선택 Regimen: TEST · Test regimen")).toBeInTheDocument();
  expect(screen.getByLabelText("Test drug 최종 용량")).toHaveValue(75);
  expect(changed).not.toHaveBeenCalled();

  await act(async () => resolveRefresh(new Response(JSON.stringify([{ ...base, prescription_status: "DRAFT", safety_freshness: "NOT_RUN", items: [{ ...base.items[0], final_dose: 75 }], safety_check_results: [] }]))));
  expect(await screen.findByText("처방 약물 정보가 수정되었습니다.")).toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
});

it("keeps the prescription workspace mounted while Safety Check refreshes in the background", async () => {
  const changed = vi.fn();
  let resolveRefresh!: (value: Response) => void;
  let listRequests = 0;
  const authorizedFetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return Promise.resolve(new Response("{}"));
    listRequests += 1;
    if (listRequests === 1) return Promise.resolve(new Response(JSON.stringify([{ ...base, prescription_status: "DRAFT", safety_freshness: "NOT_RUN", safety_check_results: [] }])));
    return new Promise<Response>(resolve => { resolveRefresh = resolve; });
  });
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} onPrescriptionChanged={changed} />);

  fireEvent.click(await screen.findByRole("button", { name: "안전성 검사 실행" }));
  await waitFor(() => expect(listRequests).toBe(2));

  expect(screen.queryByText("처방 정보를 불러오는 중입니다.")).not.toBeInTheDocument();
  expect(screen.getByText("선택 Regimen: TEST · Test regimen")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Safety Check · 검사 중" })).toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();

  await act(async () => resolveRefresh(new Response(JSON.stringify([{ ...base, prescription_status: "VALIDATED", safety_freshness: "CURRENT", safety_check_results: [{ id: "safe", check_type_label: "DUR", result: "PASS", message: "통과" }] }]))));
  expect(await screen.findByRole("button", { name: "처방 최종 확정" })).toBeEnabled();
  expect(changed).not.toHaveBeenCalled();
});

it("keeps the current prescription visible when the parent refresh key changes for the same Case", async () => {
  let resolveRefresh!: (value: Response) => void;
  let listRequests = 0;
  const payload = [{ ...base, prescription_status: "DRAFT", safety_freshness: "NOT_RUN", safety_check_results: [] }];
  const authorizedFetch = vi.fn(() => {
    listRequests += 1;
    if (listRequests === 1) return Promise.resolve(new Response(JSON.stringify(payload)));
    return new Promise<Response>(resolve => { resolveRefresh = resolve; });
  });
  const view = render(<PrescriptionPanel {...props} refreshKey={0} authorizedFetch={authorizedFetch} />);
  expect(await screen.findByText("선택 Regimen: TEST · Test regimen")).toBeInTheDocument();

  view.rerender(<PrescriptionPanel {...props} refreshKey={1} authorizedFetch={authorizedFetch} />);
  await waitFor(() => expect(listRequests).toBe(2));

  expect(screen.queryByText("처방 정보를 불러오는 중입니다.")).not.toBeInTheDocument();
  expect(screen.getByText("선택 Regimen: TEST · Test regimen")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "수정 저장" })).toBeEnabled();

  await act(async () => resolveRefresh(new Response(JSON.stringify(payload))));
  expect(screen.getByText("선택 Regimen: TEST · Test regimen")).toBeInTheDocument();
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
  await openStartDialog();
  const button = await screen.findByRole("button", { name: "처방 초안 생성" });
  fireEvent.change(screen.getByLabelText("Cycle 시작일"), { target: { value: "2026-09-27" } });
  fireEvent.click(button);
  expect(await screen.findByText(/요청은 처리되었지만/)).toBeInTheDocument();
  expect(showToast.success).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});

it("keeps oral schedule fields visible and hides new prescription creation while validated", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ ...base, prescription_status: "VALIDATED", safety_freshness: "CURRENT", patient_account_linked: true, items: [{ ...base.items[0], route: "ORAL" }], safety_check_results: [] }])));
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  const input = await screen.findByLabelText("복용 시각");
  const fields = input.closest("form")?.querySelector("div.grid");
  expect(fields).toHaveClass("overflow-y-auto");
  expect(fields).not.toContainElement(screen.getByRole("button", { name: "처방 확정 및 복약 일정 생성" }));
  expect(screen.queryByText("새 처방 생성 · 확정 치료결정 기반")).not.toBeInTheDocument();
  expect(screen.queryByText("다음 Cycle 처방 생성")).not.toBeInTheDocument();
});

it("offers the next cycle only after existing prescriptions are final", async () => {
  render(<PrescriptionPanel {...props} authorizedFetch={mockFetch("FINAL")} />);
  expect(await screen.findByText("다음 Cycle 처방 생성", { selector: "summary" })).toBeInTheDocument();
  expect(screen.queryByText("새 처방 생성 · 확정 치료결정 기반")).not.toBeInTheDocument();
});

it("places medication adjustment above Safety Check in the right column and preserves both actions", async () => {
  const authorizedFetch = mockFetch("DRAFT");
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  const action = await screen.findByRole("button", { name: "안전성 검사 실행" });
  const adjustment = screen.getByRole("region", { name: "처방 약물 확인 및 조정" });
  const safetyCard = screen.getByRole("complementary", { name: "안전성 검토 및 최종 확정" });
  expect(within(adjustment).getByLabelText("Test drug 최종 용량")).toBeInTheDocument();
  expect(within(adjustment).getByLabelText("Test drug 투여 지시")).toBeInTheDocument();
  expect(within(adjustment).getByRole("button", { name: "수정 저장" })).toBeInTheDocument();
  expect(adjustment.compareDocumentPosition(safetyCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(safetyCard).toContainElement(action);
  expect(screen.getByText(/Day 1/)).toBeInTheDocument();
  act(() => { action.click(); action.click(); });
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith("http://test/api/doctor/cases/case-1/prescriptions/rx-1/safety-check/", { method: "POST" }));
  expect(authorizedFetch.mock.calls.filter(([url, init]) => String(url).endsWith("/safety-check/") && init?.method === "POST")).toHaveLength(1);
});

it.each(["PASS", "WARNING", "BLOCK"] as const)("allows %s final confirmation after a current Safety Check", async result => {
  const authorizedFetch = mockFetch("VALIDATED", [{ id: "safety", result, check_type_label: "DUR", message: "검토 필요" }]);
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  const rail = await screen.findByRole("complementary", { name: "안전성 검토 및 최종 확정" });
  if (result !== "PASS") expect(within(rail).getByRole("heading", { name: `Safety Check · ${result} · 경고` })).toBeInTheDocument();
  fireEvent.click(within(rail).getByRole("button", { name: "처방 최종 확정" }));
  confirmFinalization();
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith(expect.stringContaining("/finalize/"), expect.objectContaining({ method: "POST" })));
  expect(authorizedFetch).not.toHaveBeenCalledWith(expect.stringContaining("/warnings/acknowledge/"), expect.anything());
});

it("shows the prescription confirmation dialog and cancels without sending a finalize request", async () => {
  const authorizedFetch = mockFetch("VALIDATED", [{ id: "safety", result: "PASS", check_type_label: "DUR", message: "통과" }]);
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  fireEvent.click(await screen.findByRole("button", { name: "처방 최종 확정" }));

  const dialog = screen.getByRole("alertdialog", { name: "처방 최종 확정" });
  expect(dialog).toHaveTextContent("처방을 확정하시겠습니까? 확정 후에는 처방 내용을 수정할 수 없습니다.");
  expect(dialog).toHaveTextContent("선택한 치료요법과 용량을 다시 확인해 주세요.");
  expect(within(dialog).getByRole("button", { name: "처방 확정" })).toHaveClass("bg-blue-600");
  expect(authorizedFetch).not.toHaveBeenCalledWith(expect.stringContaining("/finalize/"), expect.anything());

  fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(screen.queryByRole("alertdialog", { name: "처방 최종 확정" })).not.toBeInTheDocument();
  expect(authorizedFetch).not.toHaveBeenCalledWith(expect.stringContaining("/finalize/"), expect.anything());
});

it("retains finalization and allows reviewing previous prescriptions without a wizard", async () => {
  const authorizedFetch = mockFetch("VALIDATED", [{ id: "safety", result: "PASS", check_type_label: "DUR", message: "통과" }]);
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  const rail = await screen.findByRole("complementary", { name: "안전성 검토 및 최종 확정" });
  fireEvent.click(within(rail).getByRole("button", { name: "처방 최종 확정" }));
  confirmFinalization();
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith(expect.stringContaining("/finalize/"), expect.objectContaining({ body: JSON.stringify({ medication_schedules: [] }) })));
  expect(screen.getByRole("combobox", { name: "처방 선택" })).toBeInTheDocument();
});

it("opens the final care summary after confirmed finalization and allows reopening it", async () => {
  let finalized = false;
  const pass = [{ id: "safety", result: "PASS", check_type_label: "DUR", message: "통과" }];
  const authorizedFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/finalize/") && init?.method === "POST") {
      finalized = true;
      return new Response("{}");
    }
    if (url.endsWith("/prescriptions/")) return new Response(JSON.stringify([{ ...base, prescription_status: finalized ? "FINAL" : "VALIDATED", safety_freshness: "CURRENT", finalized_at: finalized ? "2026-09-28T09:00:00Z" : null, safety_check_results: pass }]));
    if (url.endsWith("/clinical-results/")) return new Response(JSON.stringify([
      { workflow_stage: "PET_CT_TNM", result_status: "CONFIRMED", result_detail: { tnm: { t_category: "T2", n_category: "N1", m_category: "M0", stage_group: "IIB" } } },
      { workflow_stage: "PATHOLOGY_GENE", result_status: "CONFIRMED", result_detail: { pathology: { histologic_type: "Adenocarcinoma", subtype: "Acinar" } } },
      { workflow_stage: "PDL1", result_status: "CONFIRMED", result_detail: { pdl1: { tps_percent: null, interpretation: "AI predicted TPS range: <1%" } } },
    ]));
    if (url.endsWith("/treatment-decision/")) return new Response(JSON.stringify({ treatment_type_label: "항암화학요법", treatment_plan: "확정 치료계획" }));
    return new Response(JSON.stringify({ patient_name: "테스트 환자", patient_code: "P-001", case_code: "CASE-001", primary_doctor_name: "doctor1" }));
  });

  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} doctorDisplayName="제청하" />);
  fireEvent.click(await screen.findByRole("button", { name: "처방 최종 확정" }));
  confirmFinalization();

  expect(await screen.findByRole("dialog", { name: "최종 진단 요약" })).toBeInTheDocument();
  expect(await screen.findByText("테스트 환자")).toBeInTheDocument();
  expect(screen.getByText("제청하")).toBeInTheDocument();
  expect(screen.queryByText("doctor1")).not.toBeInTheDocument();
  expect(screen.getByText("T2 / N1 / M0 · Stage IIB")).toBeInTheDocument();
  expect(screen.getByText("확정 TPS 미입력 · AI 예측 TPS <1%")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "확인하고 닫기" }));
  expect(screen.queryByRole("dialog", { name: "최종 진단 요약" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "최종 진료 요약 보기" }));
  expect(screen.getByRole("dialog", { name: "최종 진단 요약" })).toBeInTheDocument();
});

it("does not show a final banner when the refreshed backend status remains validated", async () => {
  const authorizedFetch = mockFetch("VALIDATED", [{ id: "safety", result: "PASS", check_type_label: "DUR", message: "통과" }]);
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);

  const rail = await screen.findByRole("complementary", { name: "안전성 검토 및 최종 확정" });
  fireEvent.click(within(rail).getByRole("button", { name: "처방 최종 확정" }));
  confirmFinalization();

  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith(
    expect.stringContaining("/finalize/"),
    expect.any(Object),
  ));
  expect(screen.queryByText("처방이 최종 확정되었습니다.")).not.toBeInTheDocument();
  await waitFor(() => expect(within(rail).getByRole("button", { name: "처방 최종 확정" })).toBeEnabled());
});

it("creates the first draft once and requires a cycle start date", async () => {
  let resolveCreate!: (response: Response) => void;
  const authorizedFetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") return new Promise<Response>(resolve => { resolveCreate = resolve; });
    return Promise.resolve(new Response(JSON.stringify([])));
  });
  render(<PrescriptionPanel {...props} authorizedFetch={authorizedFetch} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "처방 시작" })).toBeEnabled());
  expect(screen.getByRole("region", { name: "환자 안전성 정보" })).toHaveTextContent("안전성 입력 폼");
  expect(screen.queryByRole("heading", { name: "처방 초안을 생성하세요" })).not.toBeInTheDocument();
  await openStartDialog();
  const createCard = screen.getByRole("heading", { name: "처방 초안을 생성하세요" }).closest("section");
  expect(createCard).toBeInTheDocument();
  expect(createCard).toHaveClass("w-full");
  expect(screen.getByLabelText("Cycle 번호")).toBeInTheDocument();
  expect(screen.getByLabelText("치료 단계")).toBeInTheDocument();
  expect(screen.getByLabelText("Cycle 시작일")).toBeInTheDocument();
  expect(screen.getByText("처방 기본정보 설정")).toBeInTheDocument();
  expect(screen.getByText("Cycle과 치료 일정을 설정한 뒤 처방 초안을 생성합니다. 초안 생성 후 약물과 용량을 확인·조정하고 Safety Check를 진행합니다.")).toBeInTheDocument();
  expect(screen.getByText("Cycle과 시작일을 설정한 뒤 처방 초안을 생성합니다.")).toBeInTheDocument();
  expect(screen.queryByText("등록된 처방이 없습니다.")).not.toBeInTheDocument();
  const create = await screen.findByRole("button", { name: "처방 초안 생성" });
  expect(create).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Cycle 시작일"), { target: { value: "2026-09-24" } });
  expect(create).toBeEnabled();

  act(() => { create.click(); create.click(); });

  expect(authorizedFetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await act(async () => resolveCreate(new Response(JSON.stringify({ id: "rx-1" }), { status: 201 })));
  await waitFor(() => expect(screen.getByText("처방 DRAFT가 생성되었습니다.")).toBeInTheDocument());
  expect(screen.queryByRole("dialog", { name: "처방 시작" })).not.toBeInTheDocument();
});

it("shows a non-drug completion path without a prescription creation CTA", async () => {
  render(<PrescriptionPanel {...props} hasSelectedRegimen={false} requiresPrescription={false} authorizedFetch={mockFetch("DRAFT")} />);
  expect(await screen.findByText(/약물 처방 없이/)).toBeInTheDocument();
  expect(screen.queryByText("처방 정보를 불러오는 중입니다.")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "처방 초안 생성" })).not.toBeInTheDocument();
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

it("shows unresolved safety warnings without blocking finalization", async () => {
  render(<PrescriptionPanel {...props} authorizedFetch={mockFetch("VALIDATED", [{ id: "safety", result: "WARNING", check_type_label: "검사 데이터", source_code: "LAB_MISSING", message: "검사 필요" }])} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("미해결 WARNING");
  expect(screen.getByRole("button", { name: "처방 최종 확정" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "경고 확인 후 다음 단계" })).not.toBeInTheDocument();
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
