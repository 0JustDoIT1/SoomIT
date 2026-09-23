"use client";

import { type FormEvent, useState } from "react";

type Item = { id: string; drug_name: string; route: string };
export type FinalizeMedicationSchedule = { reminder_time: string; start_date: string; end_date: string | null; repeat_type: "DAILY" | "WEEKLY" | "CYCLE_DAY"; repeat_weekdays: number[]; cycle_days: number[]; prescription_item_ids: string[] };
const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

export function PrescriptionFinalizeScheduleForm({ items, working, onFinalize }: { items: Item[]; working: boolean; onFinalize: (schedules: FinalizeMedicationSchedule[]) => Promise<void> }) {
  const [error, setError] = useState("");
  const oralItems = items.filter((item) => item.route === "ORAL");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!oralItems.length) { await onFinalize([]); return; }
    const data = new FormData(event.currentTarget);
    const prescription_item_ids = oralItems.filter((item) => data.get(`item-${item.id}`) === "on").map((item) => item.id);
    const repeat_type = String(data.get("repeat_type")) as FinalizeMedicationSchedule["repeat_type"];
    const repeat_weekdays = weekdays.map((_, index) => data.get(`weekday-${index}`) === "on" ? index : null).filter((value): value is number => value !== null);
    const cycle_days = String(data.get("cycle_days") ?? "").split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
    if (!prescription_item_ids.length || (repeat_type === "WEEKLY" && !repeat_weekdays.length) || (repeat_type === "CYCLE_DAY" && !cycle_days.length)) { setError("경구 약물과 반복 규칙의 필수 값을 입력해 주세요."); return; }
    await onFinalize([{ reminder_time: String(data.get("reminder_time")), start_date: String(data.get("start_date")), end_date: String(data.get("end_date") || "") || null, repeat_type, repeat_weekdays, cycle_days, prescription_item_ids }]);
  }
  if (!oralItems.length) return <button type="button" disabled={working} onClick={() => void onFinalize([])} className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">{working ? "처리 중..." : "처방 최종 확정"}</button>;
  return <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col gap-2 border-t border-slate-200 pt-2"><p className="text-xs font-bold text-violet-800">처방 확정과 함께 환자 복약 일정 생성</p><p className="sr-only">입력한 일정은 환자앱 복약 알림의 기준으로 사용됩니다.</p>{error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}<div className="min-h-0 flex-1 overflow-y-auto grid grid-cols-2 content-start gap-2 text-xs"><label>복용 시각<input required name="reminder_time" type="time" className="mt-1 w-full rounded border p-1.5" /></label><label>시작일<input required name="start_date" type="date" className="mt-1 w-full rounded border p-1.5" /></label><label>종료일<input name="end_date" type="date" className="mt-1 w-full rounded border p-1.5" /></label><label>반복 규칙<select name="repeat_type" className="mt-1 w-full rounded border p-1.5"><option value="DAILY">매일</option><option value="WEEKLY">특정 요일</option><option value="CYCLE_DAY">치료주기 Day</option></select></label><fieldset className="col-span-2"><legend className="font-semibold">대상 경구 약물</legend><div className="mt-1 flex flex-wrap gap-2">{oralItems.map((item) => <label key={item.id} className="rounded border bg-white px-2 py-1"><input name={`item-${item.id}`} type="checkbox" defaultChecked /> {item.drug_name}</label>)}</div></fieldset><fieldset className="col-span-2"><legend className="font-semibold">특정 요일 선택 시</legend><div className="mt-1 flex gap-2">{weekdays.map((day, index) => <label key={day}><input name={`weekday-${index}`} type="checkbox" /> {day}</label>)}</div></fieldset><label className="col-span-2">치료주기 Day (예: 1, 8)<input name="cycle_days" className="mt-1 w-full rounded border p-1.5" /></label></div><button disabled={working} className="shrink-0 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:bg-slate-300">{working ? "처리 중..." : "처방 확정 및 복약 일정 생성"}</button></form>;
}
