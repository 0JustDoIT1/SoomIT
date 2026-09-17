"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

type Item = { id: string; drug_name: string; route: string; frequency?: string | null };
type Schedule = { id: string; reminder_time: string; start_date: string; end_date?: string | null; repeat_type: string; repeat_weekdays: number[]; cycle_days: number[]; enabled: boolean; items: { prescription_item_id: string; drug_name: string }[] };
type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

export function MedicationSchedulePanel({ caseId, prescriptionId, items, apiBaseUrl, authorizedFetch }: { caseId: string; prescriptionId: string; items: Item[]; apiBaseUrl: string; authorizedFetch: AuthorizedFetch }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const oralItems = items.filter((item) => item.route === "ORAL");
  const endpoint = `${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/medication-schedules/`;
  const load = useCallback(async () => {
    try { const response = await authorizedFetch(endpoint); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.detail || "복약 일정을 불러오지 못했습니다."); setSchedules(Array.isArray(data) ? data : []); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "복약 일정을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [authorizedFetch, endpoint]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const selected = oralItems.filter((item) => data.get(`item-${item.id}`) === "on").map((item) => item.id);
    const repeat_type = String(data.get("repeat_type"));
    const repeat_weekdays = weekdays.map((_, index) => data.get(`weekday-${index}`) === "on" ? index : null).filter((value): value is number => value !== null);
    const cycle_days = String(data.get("cycle_days") ?? "").split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
    if (!selected.length) { setError("복약 일정에 포함할 경구 약물을 선택해 주세요."); return; }
    if (repeat_type === "WEEKLY" && !repeat_weekdays.length) { setError("반복할 요일을 하나 이상 선택해 주세요."); return; }
    if (repeat_type === "CYCLE_DAY" && !cycle_days.length) { setError("치료주기 Day 번호를 입력해 주세요."); return; }
    setSaving(true);
    try {
      const response = await authorizedFetch(editing ? `${endpoint}${editing.id}/` : endpoint, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reminder_time: data.get("reminder_time"), start_date: data.get("start_date"), end_date: data.get("end_date") || null, repeat_type, repeat_weekdays, cycle_days, prescription_item_ids: selected }) });
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.detail || "복약 일정을 저장하지 못했습니다.");
      form.reset(); setOpen(false); setEditing(null); setLoading(true); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "복약 일정을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }
  async function disable(id: string) { if (!window.confirm("이 복약 일정을 비활성화할까요?")) return; try { const response = await authorizedFetch(`${endpoint}${id}/`, { method: "DELETE" }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.detail || "비활성화하지 못했습니다."); } setLoading(true); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "비활성화하지 못했습니다."); } }

  if (!oralItems.length) return <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">환자용 복약 일정은 경구 처방 약물이 있을 때만 등록합니다.</div>;
  const selectedItemIds = new Set(editing?.items.map((item) => item.prescription_item_id) ?? []);
  return <section className="mt-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-violet-800">환자용 복약 일정</p><p className="mt-1 text-[11px] text-slate-500">확정 처방의 경구 약물 복용 시간과 반복 규칙을 관리합니다.</p></div><button type="button" onClick={() => { setOpen(!open); setEditing(null); }} className="rounded border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700">{open ? "닫기" : "일정 등록"}</button></div>{error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}{loading ? <p className="mt-3 text-xs text-slate-400">복약 일정을 불러오는 중입니다.</p> : <div className="mt-3 space-y-2">{schedules.length ? schedules.map((schedule) => <div key={schedule.id} className="flex items-center justify-between gap-3 rounded border border-violet-100 bg-white px-3 py-2 text-xs"><div><p className="font-semibold">{schedule.reminder_time.slice(0, 5)} · {schedule.items.map((item) => item.drug_name).join(", ")}</p><p className="mt-1 text-slate-500">{schedule.start_date}{schedule.end_date ? ` ~ ${schedule.end_date}` : "부터"} · {schedule.repeat_type === "DAILY" ? "매일" : schedule.repeat_type === "WEEKLY" ? schedule.repeat_weekdays.map((day) => weekdays[day]).join(", ") : `치료주기 Day ${schedule.cycle_days.join(", ")}`}</p></div><div className="flex gap-2"><button type="button" onClick={() => { setEditing(schedule); setOpen(true); }} className="text-xs font-semibold text-violet-700">수정</button><button type="button" onClick={() => void disable(schedule.id)} className="text-xs font-semibold text-rose-600">비활성화</button></div></div>) : <p className="text-xs text-slate-400">등록된 복약 일정이 없습니다.</p>}</div>}{open && <form key={editing?.id ?? "new"} onSubmit={submit} className="mt-3 grid grid-cols-2 gap-2 rounded border border-violet-100 bg-white p-3 text-xs"><label>복용 시각<input required name="reminder_time" type="time" defaultValue={editing?.reminder_time.slice(0, 5)} className="mt-1 w-full rounded border p-1.5" /></label><label>시작일<input required name="start_date" type="date" defaultValue={editing?.start_date} className="mt-1 w-full rounded border p-1.5" /></label><label>종료일<input name="end_date" type="date" defaultValue={editing?.end_date ?? ""} className="mt-1 w-full rounded border p-1.5" /></label><label>반복 규칙<select name="repeat_type" defaultValue={editing?.repeat_type ?? "DAILY"} className="mt-1 w-full rounded border p-1.5"><option value="DAILY">매일</option><option value="WEEKLY">특정 요일</option><option value="CYCLE_DAY">치료주기 Day</option></select></label><fieldset className="col-span-2"><legend className="font-semibold">경구 약물</legend><div className="mt-1 flex flex-wrap gap-2">{oralItems.map((item) => <label key={item.id} className="rounded border px-2 py-1"><input name={`item-${item.id}`} type="checkbox" defaultChecked={selectedItemIds.has(item.id)} /> {item.drug_name}</label>)}</div></fieldset><fieldset className="col-span-2"><legend className="font-semibold">특정 요일 선택 시</legend><div className="mt-1 flex gap-2">{weekdays.map((day, index) => <label key={day}><input name={`weekday-${index}`} type="checkbox" defaultChecked={editing?.repeat_weekdays.includes(index)} /> {day}</label>)}</div></fieldset><label className="col-span-2">치료주기 Day (예: 1, 8)<input name="cycle_days" defaultValue={editing?.cycle_days.join(", ") ?? ""} className="mt-1 w-full rounded border p-1.5" /></label><button disabled={saving} className="col-span-2 rounded bg-violet-600 py-2 font-semibold text-white">{saving ? "저장 중" : editing ? "복약 일정 수정" : "복약 일정 저장"}</button></form>}</section>;
}
