"use client";

import { useMemo, useState } from "react";

import type { DoctorAvailability, DoctorUnavailableSchedule } from "./schedule-api";

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

function dateAtMidnight(year: number, month: number, day: number) {
  return new Date(year, month, day);
}

function appointmentWeekday(date: Date) {
  return (date.getDay() + 6) % 7;
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

function isUnavailableOnDate(item: DoctorUnavailableSchedule, date: Date) {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nextDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return new Date(item.start_at) < nextDayStart && new Date(item.end_at) > dayStart;
}

export function ScheduleMonthCalendar({
  availability,
  unavailable,
}: {
  availability: DoctorAvailability[];
  unavailable: DoctorUnavailableSchedule[];
}) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = dateAtMidnight(year, monthIndex, 1);
    const padding = appointmentWeekday(firstDay);
    const lastDate = new Date(year, monthIndex + 1, 0).getDate();
    return Array.from({ length: padding + lastDate }, (_, index) => index < padding ? null : dateAtMidnight(year, monthIndex, index - padding + 1));
  }, [month]);

  const moveMonth = (offset: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-bold">월간 진료 일정</h2>
          <p className="mt-1 text-xs text-slate-500">기본 진료시간과 휴진·진료 불가 일정을 날짜별로 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달" className="rounded-md border border-slate-200 px-2.5 py-1 text-sm hover:bg-slate-50">‹</button>
          <strong className="min-w-24 text-center text-sm">{month.getFullYear()}년 {month.getMonth() + 1}월</strong>
          <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달" className="rounded-md border border-slate-200 px-2.5 py-1 text-sm hover:bg-slate-50">›</button>
        </div>
      </header>
      <div className="max-h-[560px] overflow-auto">
      <div className="grid min-w-[760px] grid-cols-7 border-l border-t border-slate-200">
        {WEEKDAY_LABELS.map((label, index) => (
          <div key={label} className={`border-b border-r border-slate-200 px-2 py-2 text-center text-xs font-semibold ${index > 4 ? "text-rose-500" : "text-slate-500"}`}>{label}</div>
        ))}
        {calendarDays.map((date, index) => {
          if (!date) return <div key={`blank-${index}`} className="min-h-28 border-b border-r border-slate-200 bg-slate-50/50" />;
          const dailyAvailability = availability.filter((item) => item.enabled && item.weekday === appointmentWeekday(date));
          const dailyUnavailable = unavailable.filter((item) => isUnavailableOnDate(item, date));
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <div key={date.toISOString()} className={`min-h-28 border-b border-r border-slate-200 p-2 ${dailyUnavailable.length ? "bg-rose-50/50" : "bg-white"}`}>
              <div className={`mb-1 text-xs font-semibold ${isToday ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white" : "text-slate-700"}`}>{date.getDate()}</div>
              <div className="space-y-1">
                {dailyUnavailable.length === 0 && dailyAvailability.map((item) => <p key={item.id} className="truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">진료 {formatTime(item.start_time)}–{formatTime(item.end_time)}</p>)}
                {dailyUnavailable.map((item) => <p key={item.id} title={item.reason ?? "휴진·진료 불가"} className="truncate rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">휴진{item.reason ? ` · ${item.reason}` : ""}</p>)}
              </div>
            </div>
          );
        })}
      </div>
      </div>
      <footer className="flex flex-wrap gap-3 px-5 py-3 text-xs text-slate-500">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />기본 진료시간</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />휴진·진료 불가</span>
      </footer>
    </section>
  );
}
