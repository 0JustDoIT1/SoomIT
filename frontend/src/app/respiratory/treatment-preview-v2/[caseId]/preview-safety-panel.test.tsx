import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewSafetyPanel } from "./preview-safety-panel";
import type { Prescription } from "./preview-types";

const prescription: Prescription = { id: "rx-1", cycle_number: 1, phase: "INDUCTION", prescription_status: "DRAFT", safety_freshness: "CURRENT", items: [{ id: "item-1", drug_name: "Drug A", final_dose: "80", mfds_item_seq: "123" }], safety_check_results: [] };
const fetcher = () => vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

describe("PreviewSafetyPanel", () => {
  it("connects renal, hepatic, allergy and medication fields to the safety payload", async () => {
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return new Response(JSON.stringify(String(url).includes("/drug-options/") ? [{ id: "drug-1", drug_name: "약 A", ingredient_name: "성분 A", mfds_item_seq: "456" }] : {}), { status: 200 });
    });
    render(<PreviewSafetyPanel caseId="case-1" base="http://api.test" fetcher={request} prescription={prescription} doseInputs={{ height: "170", weight: "65", egfr: "88" }} onRefresh={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("AST"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("ALT"), { target: { value: "21" } });
    fireEvent.change(screen.getByLabelText("Total Bilirubin"), { target: { value: "0.8" } });
    fireEvent.click(screen.getByLabelText("알레르기 없음"));
    fireEvent.change(screen.getByLabelText("약품 검색"), { target: { value: "약 A" } });
    expect(await screen.findByRole("option", { name: "약 A · 성분 A" })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith("http://api.test/api/clinical/drug-options/?q=%EC%95%BD%20A", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    fireEvent.change(screen.getByLabelText("약품명"), { target: { value: "drug-1" } });
    expect(screen.getByText("약 A · 성분 A · ITEM_SEQ 456")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "처방 안전성 검사" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.stringContaining("/preview-safety/"), expect.objectContaining({ method: "POST" })));
    const safetyRequest = request.mock.calls.find(([url]) => String(url).includes("/preview-safety/"));
    expect(JSON.parse(String(safetyRequest?.[1]?.body))).toEqual(expect.objectContaining({ allergy_status: "NONE", egfr: "88", ast: "20", alt: "21", total_bilirubin: "0.8", current_medications: [{ medication_name: "약 A", ingredient_name: "성분 A", mfds_item_seq: "456" }] }));
    expect(screen.queryByPlaceholderText(/한 줄에 하나/)).not.toBeInTheDocument();
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

  it.each(["PASS", "WARNING", "BLOCK"] as const)("allows %s finalization without acknowledgment when safety is current", async result => {
    const request = fetcher();
    const checked = { ...prescription, prescription_status: "VALIDATED", safety_check_results: [{ id: "safe-1", result, message: "검토 필요", source_code: "DUPLICATION_CHECK" }] };
    render(<PreviewSafetyPanel caseId="case-1" base="http://api.test" fetcher={request} prescription={checked} doseInputs={{ height: "170", weight: "65", egfr: "88" }} onRefresh={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "안전성 검사 다시 실행" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "처방 확정" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "처방 확정" }));

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(String(request.mock.calls[1][0])).toContain("/preview-finalize/");
    expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual(expect.objectContaining({ safety_input: expect.objectContaining({ egfr: "88" }) }));
  });
});
