export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type DoctorAvailability = {
  id: string;
  doctor: string;
  weekday: Weekday;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  is_active: boolean;
};

export type DoctorUnavailableSchedule = {
  id: string;
  doctor: string;
  start_at: string;
  end_at: string;
  reason: string | null;
};

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: "월요일",
  1: "화요일",
  2: "수요일",
  3: "목요일",
  4: "금요일",
  5: "토요일",
  6: "일요일",
};
