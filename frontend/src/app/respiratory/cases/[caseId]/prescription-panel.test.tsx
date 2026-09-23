import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  fireEvent.click(action);
  await waitFor(() => expect(authorizedFetch).toHaveBeenCalledWith("http://test/api/doctor/cases/case-1/prescriptions/rx-1/safety-check/", { method: "POST" }));
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
