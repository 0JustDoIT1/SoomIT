import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewPrescription } from "./preview-prescription";

vi.mock("react-day-picker", () => ({ DayPicker: ({ onSelect }: { onSelect: (date: Date) => void }) => <button type="button" onClick={() => onSelect(new Date("2026-10-01T00:00:00"))}>날짜 선택 완료</button> }));
vi.mock("react-day-picker/locale", () => ({ ko: {} }));

describe("PreviewPrescription", () => {
  it("sends explicitly entered height and weight for dose calculation", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "rx-1" }), { status: 201 }));
    let inputs = { height: "", weight: "", egfr: "" };
    const onChange = vi.fn(next => { inputs = next; rerender(view(next)); });
    const view = (doseInputs: typeof inputs) => <PreviewPrescription caseId="case-1" base="http://api.test" fetcher={fetcher} prescriptions={[]} selectedRegimen="regimen-1" doseInputs={doseInputs} onDoseInputsChange={onChange} onRefresh={vi.fn()} />;
    const { rerender } = render(view(inputs));

    fireEvent.change(screen.getByLabelText("키 (cm)"), { target: { value: "170" } });
    fireEvent.change(screen.getByLabelText("몸무게 (kg)"), { target: { value: "65" } });
    fireEvent.change(screen.getByLabelText("eGFR (용량 계산용)"), { target: { value: "88" } });
    fireEvent.click(screen.getByRole("button", { name: "처방 시작일 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "날짜 선택 완료" }));
    fireEvent.click(screen.getByRole("button", { name: "처방 생성" }));

    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toEqual(expect.objectContaining({ height_cm: "170", weight_kg: "65", egfr: "88" }));
  });
});
