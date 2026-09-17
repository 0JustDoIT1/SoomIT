"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";

import { useRespiratoryAuth } from "../_components/respiratory-auth-provider";
import { createUnavailableSchedule, createWeeklyAvailability, deleteUnavailableSchedule, deleteWeeklyAvailability, fetchUnavailableSchedules, fetchWeeklyAvailability, type DoctorAvailability, type DoctorUnavailableSchedule, updateWeeklyAvailability } from "./schedule-api";

const WEEKDAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

export function DoctorScheduleWorkspace() {
  const { authorizedFetch, isReady } = useRespiratoryAuth();
  const [availability, setAvailability] = useState<DoctorAvailability[]>([]);
  const [unavailable, setUnavailable] = useState<DoctorUnavailableSchedule[]>([]);
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false);
  const [showUnavailableForm, setShowUnavailableForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isReady) return;
    setLoading(true);
    try {
      const [nextAvailability, nextUnavailable] = await Promise.all([fetchWeeklyAvailability(authorizedFetch), fetchUnavailableSchedules(authorizedFetch)]);
      setAvailability(nextAvailability); setUnavailable(nextUnavailable); setMessage(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "일정 정보를 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [authorizedFetch, isReady]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submitAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const weekday = Number(data.get("weekday")); const start_time = String(data.get("startTime") ?? ""); const end_time = String(data.get("endTime") ?? "");
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !start_time || !end_time || end_time <= start_time) { setMessage("요일과 올바른 시작·종료 시간을 입력해 주세요."); return; }
    setSaving(true);
    try { await createWeeklyAvailability(authorizedFetch, { weekday, start_time, end_time, enabled: data.get("enabled") === "on" }); form.reset(); setShowAvailabilityForm(false); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "기본 진료시간을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }

  async function submitUnavailable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const startRaw = String(data.get("startAt") ?? ""); const endRaw = String(data.get("endAt") ?? "");
    if (!startRaw || !endRaw || endRaw <= startRaw) { setMessage("진료 불가 시작·종료 일시를 올바르게 입력해 주세요."); return; }
    setSaving(true);
    try { await createUnavailableSchedule(authorizedFetch, { start_at: new Date(startRaw).toISOString(), end_at: new Date(endRaw).toISOString(), reason: String(data.get("reason") ?? "") || null }); form.reset(); setShowUnavailableForm(false); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "휴진 일정을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  }

  async function toggle(item: DoctorAvailability) { try { await updateWeeklyAvailability(authorizedFetch, item.id, { enabled: !item.enabled }); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "상태를 변경하지 못했습니다."); } }
  async function removeAvailability(id: string) { if (window.confirm("이 기본 진료시간 구간을 삭제할까요?")) { try { await deleteWeeklyAvailability(authorizedFetch, id); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "삭제하지 못했습니다."); } } }
  async function removeUnavailable(id: string) { if (window.confirm("이 휴진 일정을 삭제할까요?")) { try { await deleteUnavailableSchedule(authorizedFetch, id); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "삭제하지 못했습니다."); } } }

  return <div className="flex min-h-full min-w-[1100px] flex-col bg-[#f6f8fb] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-8 py-4"><p className="text-[11px] font-bold tracking-[0.12em] text-blue-600">의료진 일정 관리</p><h1 className="mt-1 text-[22px] font-bold">기본 진료시간 및 휴진 일정</h1><p className="mt-1 text-sm text-slate-500">환자 예약에 사용할 요일별 기본 진료시간과 특정 날짜의 진료 불가 일정을 관리합니다.</p></header>
    <main className="grid flex-1 grid-cols-[minmax(680px,1fr)_360px] gap-4 p-5">
      <section className="rounded-xl border border-slate-200 bg-white"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold">요일별 기본 진료시간</h2><p className="mt-1 text-xs text-slate-500">같은 요일에 여러 시간 구간을 등록할 수 있으며 예약 간격은 30분으로 고정됩니다.</p></div><button type="button" onClick={() => setShowAvailabilityForm(!showAvailabilityForm)} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white">{showAvailabilityForm ? "입력 닫기" : "시간 구간 입력"}</button></header>
        {showAvailabilityForm && <form onSubmit={submitAvailability} className="m-4 grid grid-cols-[1fr_1fr_1fr_100px_auto] items-end gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4"><Field label="요일"><select name="weekday" required defaultValue=""><option value="" disabled>요일 선택</option>{WEEKDAYS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></Field><Field label="시작 시간"><input name="startTime" type="time" required /></Field><Field label="종료 시간"><input name="endTime" type="time" required /></Field><Field label="예약 간격"><div className="input-like">30분</div></Field><button disabled={saving} className="button-primary">{saving ? "저장 중" : "저장"}</button><label className="col-span-4 flex items-center gap-2 text-xs"><input name="enabled" type="checkbox" defaultChecked />이 시간 구간을 환자 예약에 사용</label></form>}
        <table className="w-full text-left text-sm"><thead className="border-y border-slate-100 bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3">요일</th><th className="px-5 py-3">진료시간</th><th className="px-5 py-3">예약 간격</th><th className="px-5 py-3">상태</th><th className="px-5 py-3 text-right">관리</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">일정 정보를 불러오는 중입니다.</td></tr> : WEEKDAYS.map((label, weekday) => { const items = availability.filter((item) => item.weekday === weekday); return items.length ? items.map((item) => <tr key={item.id}><td className="px-5 py-3 font-semibold">{label}</td><td className="px-5 py-3">{item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}</td><td className="px-5 py-3">30분</td><td className="px-5 py-3"><button type="button" onClick={() => void toggle(item)} className={item.enabled ? "status-on" : "status-off"}>{item.enabled ? "사용" : "미사용"}</button></td><td className="px-5 py-3 text-right"><button type="button" onClick={() => void removeAvailability(item.id)} className="text-xs font-semibold text-rose-600">삭제</button></td></tr>) : <tr key={label}><td className="px-5 py-3 font-semibold">{label}</td><td colSpan={4} className="px-5 py-3 text-slate-400">등록된 기본 진료시간 없음</td></tr>; })}</tbody></table>
      </section>
      <aside className="space-y-4"><section className="rounded-xl border border-slate-200 bg-white"><header className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold">휴진·진료 불가 일정</h2><p className="mt-1 text-xs text-slate-500">휴가, 휴진, 특정 시간 진료 불가를 등록합니다.</p></header><div className="space-y-3 p-5">{unavailable.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">등록된 휴진 일정이 없습니다.</p> : unavailable.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs"><p className="font-semibold">{new Date(item.start_at).toLocaleString("ko-KR")} – {new Date(item.end_at).toLocaleString("ko-KR")}</p>{item.reason && <p className="mt-1 text-slate-500">{item.reason}</p>}<button type="button" onClick={() => void removeUnavailable(item.id)} className="mt-2 font-semibold text-rose-600">삭제</button></div>)}<button type="button" onClick={() => setShowUnavailableForm(!showUnavailableForm)} className="w-full rounded-lg border border-blue-200 py-2.5 text-sm font-semibold text-blue-700">{showUnavailableForm ? "입력 닫기" : "휴진 일정 입력"}</button></div>{showUnavailableForm && <form onSubmit={submitUnavailable} className="space-y-3 border-t border-slate-100 p-5"><Field label="진료 불가 시작"><input name="startAt" type="datetime-local" required /></Field><Field label="진료 불가 종료"><input name="endAt" type="datetime-local" required /></Field><Field label="사유"><textarea name="reason" rows={2} placeholder="휴진 또는 진료 불가 사유" /></Field><button disabled={saving} className="button-primary w-full">{saving ? "저장 중" : "저장"}</button></form>}</section><section className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-xs leading-5 text-slate-600">활성화된 기본 진료시간에서 휴진 일정을 제외해 환자 예약 가능시간을 계산합니다. 추가 진료 가능 일정은 환자 예약 계산에 사용하지 않습니다.</section></aside>
    </main>{message && <div role="alert" className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-3 text-sm text-white shadow-lg">{message}<button type="button" onClick={() => setMessage(null)} className="ml-3 text-slate-300">닫기</button></div>}
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">{label}</span>{children}</label>; }
