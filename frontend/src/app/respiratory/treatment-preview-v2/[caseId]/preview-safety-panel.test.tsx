import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewSafetyPanel } from "./preview-safety-panel";
import type { Prescription } from "./preview-types";

const prescription: Prescription = { id: "rx-1", cycle_number: 1, phase: "INDUCTION", prescription_status: "DRAFT", safety_freshness: "CURRENT", items: [{ id: "item-1", drug_name: "Drug A", final_dose: "80", mfds_item_seq: "123" }], safety_check_results: [] };
const fetcher = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

describe("PreviewSafetyPanel", () => {
  it("connects renal, hepatic, allergy and medication fields to the safety payload", async () => {
    const request = fetcher();
    render(<PreviewSafetyPanel caseId="case-1" base="http://api.test" fetcher={request} prescription={prescription} doseInputs={{ height: "170", weight: "65", egfr: "88" }} onRefresh={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("AST"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("ALT"), { target: { value: "21" } });
    fireEvent.change(screen.getByLabelText("Total Bilirubin"), { target: { value: "0.8" } });
    fireEvent.click(screen.getByLabelText("알레르기 없음"));
    fireEvent.change(screen.getByLabelText("현재 복용약"), { target: { value: "약 A | 성분 A | 456" } });
    fireEvent.click(screen.getByRole("button", { name: "처방 안전성 검사" }));
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual(expect.objectContaining({ allergy_status: "NONE", egfr: "88", ast: "20", alt: "21", total_bilirubin: "0.8", current_medications: [{ medication_name: "약 A", ingredient_name: "성분 A", mfds_item_seq: "456" }] }));
  });

  it("marks existing safety results stale after an input changes", async () => {
    render(<PreviewSafetyPanel caseId="case-1" base="http://api.test" fetcher={fetcher()} prescription={{ ...prescription, safety_check_results: [{ id: "safe-1", result: "PASS", message: "통과" }] }} doseInputs={{ height: "170", weight: "65", egfr: "88" }} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "안전성 검사 다시 실행" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "안전성 검사 다시 실행" })).toBeEnabled());
    fireEvent.change(screen.getByLabelText("AST"), { target: { value: "30" } });
    expect(await screen.findByText("입력값이 변경되어 Safety Check를 다시 실행해야 합니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "처방 확정" })).toBeDisabled();
  });

  it("links LAB_MISSING warnings to the missing input section", () => {
    render(<PreviewSafetyPanel caseId="case-1" base="http://api.test" fetcher={fetcher()} prescription={{ ...prescription, safety_check_results: [{ id: "safe-1", result: "WARNING", message: "신장기능 정보가 필요합니다.", source_code: "LAB_MISSING" }] }} doseInputs={{ height: "170", weight: "65", egfr: "" }} onRefresh={vi.fn()} />);
    expect(screen.getByRole("button", { name: "신장기능 입력 보완" })).toBeInTheDocument();
  });

  it("acknowledges a general warning with the checked safety input before validation", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("담당의 검토");
    const request = fetcher();
    render(<PreviewSafetyPanel caseId="case-1" base="http://api.test" fetcher={request} prescription={{ ...prescription, safety_check_results: [{ id: "safe-1", result: "WARNING", message: "중복 성분", source_code: "DUPLICATION_CHECK" }] }} doseInputs={{ height: "170", weight: "65", egfr: "88" }} onRefresh={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "안전성 검사 다시 실행" }));
    fireEvent.click(await screen.findByRole("button", { name: "경고 확인 후 다음 단계" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual(expect.objectContaining({
      acknowledgment_note: "담당의 검토",
      safety_input: expect.objectContaining({ egfr: "88" }),
    }));
  });
});
