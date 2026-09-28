import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PrescriptionFinalizeScheduleForm } from "./prescription-finalize-schedule-form";

describe("PrescriptionFinalizeScheduleForm", () => {
  it("keeps required schedule inputs visible and reports a missing time in the form", async () => {
    const onFinalize = vi.fn().mockResolvedValue(undefined);
    render(<PrescriptionFinalizeScheduleForm items={[{ id: "oral-1", drug_name: "Osimertinib", route: "ORAL" }]} working={false} patientAccountLinked onFinalize={onFinalize} />);

    const form = screen.getByRole("form", { name: "처방 확정 복약 일정" });
    expect(form).toHaveAttribute("novalidate");
    expect(screen.getByLabelText("복용 시각 시")).toBeVisible();
    expect(screen.getByLabelText("복용 시각 분")).toBeVisible();
    expect(screen.getByLabelText("시작일")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "처방 확정 및 복약 일정 생성" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("복용 시각을 입력해 주세요.");
    expect(onFinalize).not.toHaveBeenCalled();
  });

  it("submits an actual oral medication schedule with the finalize request", async () => {
    const onFinalize = vi.fn().mockResolvedValue(undefined);
    render(<PrescriptionFinalizeScheduleForm items={[{ id: "oral-1", drug_name: "Osimertinib", route: "ORAL" }, { id: "iv-1", drug_name: "Carboplatin", route: "INTRAVENOUS" }]} working={false} patientAccountLinked onFinalize={onFinalize} />);
    fireEvent.change(screen.getByLabelText("복용 시각 시"), { target: { value: "09" } });
    fireEvent.change(screen.getByLabelText("복용 시각 분"), { target: { value: "00" } });
    fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2026-09-17" } });
    fireEvent.click(screen.getByLabelText("수"));
    fireEvent.change(screen.getByLabelText("반복 규칙"), { target: { value: "WEEKLY" } });
    fireEvent.click(screen.getByRole("button", { name: "처방 확정 및 복약 일정 생성" }));
    expect(onFinalize).toHaveBeenCalledWith([expect.objectContaining({ reminder_time: "09:00", start_date: "2026-09-17", repeat_type: "WEEKLY", repeat_weekdays: [2], prescription_item_ids: ["oral-1"] })]);
  });

  it("allows finalizing without a medication schedule when no patient app account is linked", async () => {
    const onFinalize = vi.fn().mockResolvedValue(undefined);
    render(<PrescriptionFinalizeScheduleForm items={[{ id: "oral-1", drug_name: "Osimertinib", route: "ORAL" }]} working={false} patientAccountLinked={false} onFinalize={onFinalize} />);

    expect(screen.getByText("환자 앱 계정이 연결되지 않았습니다.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "복약 일정 없이 처방 최종 확정" }));

    expect(onFinalize).toHaveBeenCalledWith([]);
    expect(screen.queryByLabelText("복용 시각 시")).not.toBeInTheDocument();
  });
});
