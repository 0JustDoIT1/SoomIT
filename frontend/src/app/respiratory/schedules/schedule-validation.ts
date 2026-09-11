export type AvailabilityDraft = {
  weekday: string;
  startTime: string;
  endTime: string;
  slotMinutes: string;
};

export type UnavailableDraft = {
  startAt: string;
  endAt: string;
  reason: string;
};

export type ScheduleValidationErrors<T> = Partial<Record<keyof T, string>>;

export function validateAvailabilityDraft(draft: AvailabilityDraft): ScheduleValidationErrors<AvailabilityDraft> {
  const errors: ScheduleValidationErrors<AvailabilityDraft> = {};

  if (!draft.weekday) errors.weekday = "요일을 선택해 주세요.";
  if (!draft.startTime) errors.startTime = "시작 시간을 입력해 주세요.";
  if (!draft.endTime) errors.endTime = "종료 시간을 입력해 주세요.";
  if (draft.startTime && draft.endTime && draft.endTime <= draft.startTime) {
    errors.endTime = "종료 시간은 시작 시간보다 늦어야 합니다.";
  }
  if (!draft.slotMinutes) errors.slotMinutes = "예약 간격을 선택해 주세요.";

  return errors;
}

export function validateUnavailableDraft(draft: UnavailableDraft): ScheduleValidationErrors<UnavailableDraft> {
  const errors: ScheduleValidationErrors<UnavailableDraft> = {};

  if (!draft.startAt) errors.startAt = "진료 불가 시작 일시를 입력해 주세요.";
  if (!draft.endAt) errors.endAt = "진료 불가 종료 일시를 입력해 주세요.";
  if (draft.startAt && draft.endAt && draft.endAt <= draft.startAt) {
    errors.endAt = "종료 일시는 시작 일시보다 늦어야 합니다.";
  }

  return errors;
}
