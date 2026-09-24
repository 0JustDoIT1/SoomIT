import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PrescriptionPanel } from "./prescription-panel";

vi.mock("./mfds-product-selector", () => ({ MfdsProductSelector: () => null }));
vi.mock("./medication-schedule-panel", () => ({ MedicationSchedulePanel: () => <p>복약 일정</p> }));
const props = { caseId: "case-1", apiBaseUrl: "http://test", hasSelectedRegimen: true };
const base = { id: "rx-1", cycle_number: 1, regimen_detail: { regimen_name: "Test regimen", regimen_code: "TEST" }, items: [{ id: "item-1", drug_name: "Test drug", route: "INTRAVENOUS", calculated_dose: 80, final_dose: 80, unit: "mg", instructions: "Day 1" }] };
const mockFetch = (status: string, results: object[] = []) => vi.fn().mockImplementation(async () => new Response(JSON.stringify([{ ...base, prescription_status: status, safety_check_results: results }])));

it("keeps oral schedule fields separate from the final action and new prescription form", async () => {
  const authorizedFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ ...base, prescription_status: "VALIDATED", items: [{ ...base.items[0], route: "ORAL" }], safety_check_results: [] }])));
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
  expect(await screen.findByRole("status")).toHaveTextContent("약물 처방 없이");
  expect(screen.queryByRole("button", { name: "임시 처방 생성" })).not.toBeInTheDocument();
});

it("keeps a final prescription visible but read-only after the case is no longer actionable", async () => {
  render(<PrescriptionPanel {...props} actionable={false} authorizedFetch={mockFetch("FINAL")} />);
  expect(await screen.findByText("최종 확정 완료 · 수정 불가")).toBeInTheDocument();
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

  expect(await screen.findByText(/Safety Check/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /안전성 검사/ })).not.toBeInTheDocument();
});
