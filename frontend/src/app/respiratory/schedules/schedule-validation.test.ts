import { describe, expect, it } from "vitest";

import { validateAvailabilityDraft, validateUnavailableDraft } from "./schedule-validation";

describe("schedule validation", () => {
  it("requires every availability field", () => {
    expect(validateAvailabilityDraft({ weekday: "", startTime: "", endTime: "", slotMinutes: "" })).toEqual({
      weekday: "요일을 선택해 주세요.",
      startTime: "시작 시간을 입력해 주세요.",
      endTime: "종료 시간을 입력해 주세요.",
      slotMinutes: "예약 간격을 선택해 주세요.",
    });
  });

  it("rejects an availability end time that is not later than its start", () => {
    const errors = validateAvailabilityDraft({ weekday: "0", startTime: "13:00", endTime: "12:00", slotMinutes: "20" });
    expect(errors.endTime).toBe("종료 시간은 시작 시간보다 늦어야 합니다.");
  });

  it("rejects an unavailable end datetime that is not later than its start", () => {
    const errors = validateUnavailableDraft({ startAt: "2026-09-12T13:00", endAt: "2026-09-12T12:00", reason: "" });
    expect(errors.endAt).toBe("종료 일시는 시작 일시보다 늦어야 합니다.");
  });
});
