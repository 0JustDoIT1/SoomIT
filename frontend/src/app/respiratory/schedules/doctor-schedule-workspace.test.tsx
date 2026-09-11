import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DoctorScheduleWorkspace } from "./doctor-schedule-workspace";

describe("DoctorScheduleWorkspace", () => {
  it("shows backend-dependent schedule controls as unavailable", () => {
    render(<DoctorScheduleWorkspace />);

    expect(screen.getByText("백엔드 API 연동 대기")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "시간 구간 입력" }));
    fireEvent.click(screen.getByRole("button", { name: "휴진 일정 입력" }));
    fireEvent.click(screen.getAllByRole("button", { name: "입력값 확인" })[0]);

    expect(screen.getByRole("button", { name: "저장 · API 대기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "저장 · API 연동 대기" })).toBeDisabled();
    expect(screen.getByText("요일을 선택해 주세요.")).toBeTruthy();
  });

  it("explains that extra availability is excluded from patient booking", () => {
    render(<DoctorScheduleWorkspace />);

    expect(screen.getByText(/추가 진료 가능 일정은 이번 환자 예약 계산에 사용하지 않습니다/)).toBeTruthy();
    expect(document.body).not.toHaveTextContent("EXTRA_AVAILABLE");
  });
});
