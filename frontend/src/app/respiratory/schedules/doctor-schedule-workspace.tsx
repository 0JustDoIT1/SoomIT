"use client";

import { type FormEvent, type ReactNode, useState } from "react";

import {
  type ScheduleValidationErrors,
  type AvailabilityDraft,
  type UnavailableDraft,
  validateAvailabilityDraft,
  validateUnavailableDraft,
} from "./schedule-validation";

const WEEKDAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

export function DoctorScheduleWorkspace() {
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false);
  const [showUnavailableForm, setShowUnavailableForm] = useState(false);
  const [availabilityErrors, setAvailabilityErrors] = useState<ScheduleValidationErrors<AvailabilityDraft>>({});
  const [unavailableErrors, setUnavailableErrors] = useState<ScheduleValidationErrors<UnavailableDraft>>({});

  function checkAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAvailabilityErrors(validateAvailabilityDraft({
      weekday: String(data.get("weekday") ?? ""),
      startTime: String(data.get("startTime") ?? ""),
      endTime: String(data.get("endTime") ?? ""),
      slotMinutes: String(data.get("slotMinutes") ?? ""),
    }));
  }

  function checkUnavailable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setUnavailableErrors(validateUnavailableDraft({
      startAt: String(data.get("startAt") ?? ""),
      endAt: String(data.get("endAt") ?? ""),
      reason: String(data.get("reason") ?? ""),
    }));
  }

  return (
    <div className="flex h-full min-w-[1180px] flex-col bg-[#f6f8fb] text-slate-900">
      <header className="shrink-0 border-b border-slate-200 bg-white px-8 py-4">
        <p className="text-[11px] font-bold tracking-[0.12em] text-blue-600">의료진 일정 관리</p>
        <div className="mt-1 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">기본 진료시간 및 휴진 일정</h1>
            <p className="mt-1 text-sm text-slate-500">
              환자 예약에 사용할 요일별 기본 진료시간과 특정 날짜의 진료 불가 일정을 관리합니다.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
            <span className="whitespace-nowrap font-semibold">백엔드 API 연동 대기</span>
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(700px,1fr)_360px] gap-4 overflow-hidden p-5">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-[15px] font-bold">요일별 기본 진료시간</h2>
              <p className="mt-1 text-xs text-slate-500">같은 요일에 오전·오후 등 여러 시간 구간을 등록할 수 있습니다.</p>
            </div>
            <button
              type="button"
              aria-expanded={showAvailabilityForm}
              onClick={() => setShowAvailabilityForm((visible) => !visible)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              {showAvailabilityForm ? "입력 닫기" : "시간 구간 입력"}
            </button>
          </header>

          {showAvailabilityForm && (
            <form onSubmit={checkAvailability} noValidate className="m-4 grid shrink-0 grid-cols-[1fr_1fr_1fr_1fr_auto_auto] items-end gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <ScheduleField label="요일">
                <select name="weekday" aria-invalid={Boolean(availabilityErrors.weekday)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" defaultValue="">
                  <option value="" disabled>요일 선택</option>
                  {WEEKDAYS.map((weekday, index) => <option key={weekday} value={index}>{weekday}</option>)}
                </select>
              </ScheduleField>
              <ScheduleField label="시작 시간"><input name="startTime" aria-invalid={Boolean(availabilityErrors.startTime)} type="time" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" /></ScheduleField>
              <ScheduleField label="종료 시간"><input name="endTime" aria-invalid={Boolean(availabilityErrors.endTime)} type="time" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" /></ScheduleField>
              <ScheduleField label="예약 간격">
                <select name="slotMinutes" aria-invalid={Boolean(availabilityErrors.slotMinutes)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" defaultValue="">
                  <option value="" disabled>간격 선택</option>
                  {[10, 15, 20, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes}분</option>)}
                </select>
              </ScheduleField>
              <button type="submit" className="h-9 whitespace-nowrap rounded-lg border border-blue-200 bg-white px-4 text-xs font-semibold text-blue-700">입력값 확인</button>
              <button type="button" disabled className="h-9 whitespace-nowrap rounded-lg bg-slate-200 px-4 text-xs font-semibold text-slate-400">
                저장 · API 대기
              </button>
              <label className="col-span-4 flex items-center gap-2 text-xs font-medium text-slate-600">
                <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                이 시간 구간을 환자 예약에 사용
              </label>
              <span className="col-span-2 text-right text-[11px] text-slate-500">API 연결 전에는 서버에 반영되지 않습니다.</span>
              <ValidationSummary errors={availabilityErrors} />
            </form>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full min-w-[660px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-y border-slate-100 bg-slate-50/95 text-xs text-slate-500 backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold">요일</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold">진료시간</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold">예약 간격</th>
                  <th className="whitespace-nowrap px-5 py-3 font-semibold">상태</th>
                  <th className="whitespace-nowrap px-5 py-3 text-right font-semibold">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {WEEKDAYS.map((weekday) => (
                  <tr key={weekday} className="transition-colors hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
                      <span className="inline-flex min-w-16 items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" />{weekday}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-400">등록된 기본 진료시간 없음</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-400">-</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-400">-</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right">
                      <button type="button" disabled className="text-xs font-semibold text-slate-300">수정</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[11px] text-slate-500">
            기본 진료시간 조회·저장 API가 연결되면 실제 등록 일정이 표시됩니다.
          </p>
        </section>

        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-0.5">
          <section className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <header className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold">휴진·진료 불가 일정</h2>
              <p className="mt-1 text-xs text-slate-500">휴가, 휴진 또는 특정 시간의 진료 불가 일정을 등록합니다.</p>
            </header>
            <div className="px-5 py-8 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-400" aria-hidden="true">–</div>
              <p className="text-sm font-semibold text-slate-600">조회된 휴진 일정이 없습니다.</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">UNAVAILABLE 일정 API가 연결되면 기간과 사유가 표시됩니다.</p>
              <button
                type="button"
                aria-expanded={showUnavailableForm}
                onClick={() => setShowUnavailableForm((visible) => !visible)}
                className="mt-5 w-full rounded-lg border border-blue-200 bg-white py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                {showUnavailableForm ? "휴진 입력 닫기" : "휴진 일정 입력"}
              </button>
            </div>
            {showUnavailableForm && (
              <form onSubmit={checkUnavailable} noValidate className="space-y-3 border-t border-slate-100 px-5 py-4 text-left">
                <ScheduleField label="진료 불가 시작"><input name="startAt" aria-invalid={Boolean(unavailableErrors.startAt)} type="datetime-local" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" /></ScheduleField>
                <ScheduleField label="진료 불가 종료"><input name="endAt" aria-invalid={Boolean(unavailableErrors.endAt)} type="datetime-local" className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm" /></ScheduleField>
                <ScheduleField label="사유"><textarea name="reason" rows={2} className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="휴진 또는 진료 불가 사유" /></ScheduleField>
                <ValidationSummary errors={unavailableErrors} />
                <button type="submit" className="w-full rounded-lg border border-blue-200 bg-white py-2.5 text-sm font-semibold text-blue-700">입력값 확인</button>
                <button type="button" disabled className="w-full rounded-lg bg-slate-200 py-2.5 text-sm font-semibold text-slate-400">
                  저장 · API 연동 대기
                </button>
              </form>
            )}
          </section>

          <section className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
            <h2 className="text-sm font-bold text-slate-800">환자 예약 적용 기준</h2>
            <ul className="mt-3 space-y-2.5 text-xs leading-5 text-slate-600">
              <li>• 활성화된 요일별 기본 진료시간을 사용합니다.</li>
              <li>• 휴진·진료 불가 시간은 예약 가능 시간에서 제외합니다.</li>
              <li>• 기존 예약과의 중복 검증은 환자 예약 백엔드에서 처리합니다.</li>
              <li>• 추가 진료 가능 일정은 이번 환자 예약 계산에 사용하지 않습니다.</li>
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

function ValidationSummary({ errors }: { errors: Record<string, string | undefined> }) {
  const messages = Object.values(errors).filter(Boolean) as string[];
  if (messages.length === 0) return null;

  return (
    <div role="alert" className="col-span-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {messages.map((message) => <p key={message}>{message}</p>)}
    </div>
  );
}

function ScheduleField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      <span className="mb-1.5 block whitespace-nowrap">{label}</span>
      {children}
    </label>
  );
}
