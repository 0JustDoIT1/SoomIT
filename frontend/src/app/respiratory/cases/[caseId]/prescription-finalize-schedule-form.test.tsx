import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PrescriptionFinalizeScheduleForm } from "./prescription-finalize-schedule-form";

describe("PrescriptionFinalizeScheduleForm", () => {
  it("submits an actual oral medication schedule with the finalize request", async () => {
    const onFinalize = vi.fn().mockResolvedValue(undefined);
    render(<PrescriptionFinalizeScheduleForm items={[{ id: "oral-1", drug_name: "Osimertinib", route: "ORAL" }, { id: "iv-1", drug_name: "Carboplatin", route: "INTRAVENOUS" }]} working={false} onFinalize={onFinalize} />);
    fireEvent.change(screen.getByLabelText("복용 시각"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2026-09-17" } });
    fireEvent.click(screen.getByLabelText("수"));
    fireEvent.change(screen.getByLabelText("반복 규칙"), { target: { value: "WEEKLY" } });
    fireEvent.click(screen.getByRole("button", { name: "처방 확정 및 복약 일정 생성" }));
    expect(onFinalize).toHaveBeenCalledWith([expect.objectContaining({ reminder_time: "09:00", start_date: "2026-09-17", repeat_type: "WEEKLY", repeat_weekdays: [2], prescription_item_ids: ["oral-1"] })]);
  });
});
