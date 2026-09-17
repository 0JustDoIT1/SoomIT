"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from "react";

import { useRespiratoryAuth } from "../_components/respiratory-auth-provider";
import { createUnavailableSchedule, createWeeklyAvailability, deleteUnavailableSchedule, deleteWeeklyAvailability, fetchSchedulingPreference, fetchUnavailableSchedules, fetchWeeklyAvailability, type DoctorAvailability, type DoctorUnavailableSchedule, updateSchedulingPreference, updateUnavailableSchedule, updateWeeklyAvailability } from "./schedule-api";
import { ScheduleMonthCalendar } from "./schedule-month-calendar";

const WEEKDAYS = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function DoctorScheduleWorkspace() {
  const { authorizedFetch, isReady } = useRespiratoryAuth();
  const [availability, setAvailability] = useState<DoctorAvailability[]>([]);
  const [unavailable, setUnavailable] = useState<DoctorUnavailableSchedule[]>([]);
  const [slotCapacity, setSlotCapacity] = useState(5);
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false);
  const [editingAvailability, setEditingAvailability] = useState<DoctorAvailability | null>(null);
  const [showUnavailableForm, setShowUnavailableForm] = useState(false);
  const [editingUnavailable, setEditingUnavailable] = useState<DoctorUnavailableSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isReady) return;
    setLoading(true);
    try {
      const [nextAvailability, nextUnavailable, preference] = await Promise.all([fetchWeeklyAvailability(authorizedFetch), fetchUnavailableSchedules(authorizedFetch), fetchSchedulingPreference(authorizedFetch)]);
      setAvailability(nextAvailability);
      setUnavailable(nextUnavailable);
      setSlotCapacity(Number.isInteger(preference.slot_capacity) && preference.slot_capacity > 0 ? preference.slot_capacity : 5);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "일정 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, isReady]);

  async function saveSlotCapacity() {
    if (!Number.isInteger(slotCapacity) || slotCapacity < 1 || slotCapacity > 99) {
      setMessage("예약 슬롯 정원은 1명 이상 99명 이하로 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const preference = await updateSchedulingPreference(authorizedFetch, { slot_capacity: slotCapacity });
      setSlotCapacity(preference.slot_capacity);
      setMessage("예약 슬롯 정원을 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "예약 슬롯 정원을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submitAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const start_time = String(data.get("startTime") ?? "");
    const end_time = String(data.get("endTime") ?? "");
    const weekdays = editingAvailability ? [Number(data.get("weekday"))] : data.getAll("weekdays").map(Number);
    if (!weekdays.length || weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6) || !start_time || !end_time || end_time <= start_time) {
      setMessage("적용 요일과 올바른 시작·종료 시간을 입력해 주세요.");
      return;
    }
    if (!editingAvailability && weekdays.some((weekday) => availability.some((item) => item.weekday === weekday && item.start_time < end_time && item.end_time > start_time))) {
      setMessage("선택한 요일 중 기존 진료시간과 겹치는 구간이 있습니다.");
      return;
    }
    setSaving(true);
    try {
      const body = { start_time, end_time, enabled: data.get("enabled") === "on" };
      if (editingAvailability) await updateWeeklyAvailability(authorizedFetch, editingAvailability.id, { ...body, weekday: weekdays[0] });
      else await Promise.all(weekdays.map((weekday) => createWeeklyAvailability(authorizedFetch, { ...body, weekday })));
      form.reset();
      setShowAvailabilityForm(false);
      setEditingAvailability(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "기본 진료시간을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function submitUnavailable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startRaw = String(data.get("startAt") ?? "");
    const endRaw = String(data.get("endAt") ?? "");
    if (!startRaw || !endRaw || endRaw <= startRaw) {
      setMessage("진료 불가 시작·종료 일시를 올바르게 입력해 주세요.");
      return;
    }
    setSaving(true);
    try {
      const body = { start_at: new Date(startRaw).toISOString(), end_at: new Date(endRaw).toISOString(), reason: String(data.get("reason") ?? "") || null };
      if (editingUnavailable) await updateUnavailableSchedule(authorizedFetch, editingUnavailable.id, body);
      else await createUnavailableSchedule(authorizedFetch, body);
      form.reset();
      setShowUnavailableForm(false);
      setEditingUnavailable(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "휴진 일정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: DoctorAvailability) {
    try {
      await updateWeeklyAvailability(authorizedFetch, item.id, { enabled: !item.enabled });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상태를 변경하지 못했습니다.");
    }
  }

  async function removeAvailability(id: string) {
    if (!window.confirm("기본 진료시간 구간을 삭제할까요?")) return;
    try {
      await deleteWeeklyAvailability(authorizedFetch, id);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제하지 못했습니다.");
    }
  }

  async function removeUnavailable(id: string) {
    if (!window.confirm("휴진 일정을 삭제할까요?")) return;
    try {
      await deleteUnavailableSchedule(authorizedFetch, id);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제하지 못했습니다.");
    }
  }

  return (
    <div className="flex min-h-full min-w-[1100px] flex-col bg-[#f6f8fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <p className="text-[11px] font-bold tracking-[0.12em] text-blue-600">의료진 일정 관리</p>
        <h1 className="mt-1 text-[22px] font-bold">기본 진료시간 및 휴진 일정</h1>
        <p className="mt-1 text-sm text-slate-500">환자 예약에 사용할 요일별 기본 진료시간과 특정 날짜의 진료 불가 일정을 관리합니다.</p>
      </header>
      <main className="grid flex-1 grid-cols-[minmax(0,1fr)_340px] items-start gap-4 p-5">
        <ScheduleMonthCalendar availability={availability} unavailable={unavailable} />
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white">
            <header className="border-b border-slate-200 px-4 py-4"><h2 className="font-bold">예약 슬롯 정원</h2><p className="mt-1 text-xs text-slate-500">30분 단위 한 슬롯에 예약할 수 있는 최대 인원입니다.</p></header>
            <div className="flex items-end gap-2 p-4"><label className="min-w-0 flex-1 text-xs font-semibold text-slate-600"><span className="mb-1.5 block">최대 인원</span><input aria-label="예약 슬롯 최대 인원" type="number" min={1} max={99} value={slotCapacity} onChange={(event) => setSlotCapacity(Number(event.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label><span className="pb-2 text-sm text-slate-500">명</span><button type="button" disabled={saving || loading} onClick={() => void saveSlotCapacity()} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">저장</button></div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
              <div><h2 className="font-bold">요일별 기본 진료시간</h2><p className="mt-1 text-xs text-slate-500">예약 간격은 30분으로 고정됩니다.</p></div>
              <button type="button" onClick={() => { setShowAvailabilityForm((open) => !open); setEditingAvailability(null); }} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">{showAvailabilityForm ? "입력 닫기" : "시간 입력"}</button>
            </header>
            <div className="divide-y divide-slate-100">
              {loading ? <p className="px-4 py-6 text-center text-sm text-slate-400">일정을 불러오는 중입니다.</p> : availability.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-400">등록된 기본 진료시간이 없습니다.</p> : availability.map((item) => <div key={item.id} className="flex items-center gap-2 px-4 py-3 text-xs"><strong className="w-11 shrink-0">{WEEKDAYS[item.weekday]}</strong><span className="min-w-0 flex-1">{item.start_time.slice(0, 5)} – {item.end_time.slice(0, 5)}</span><span className="rounded bg-slate-100 px-1.5 py-1 font-medium text-slate-600">30분</span><button type="button" onClick={() => void toggle(item)} className={item.enabled ? "rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-500"}>{item.enabled ? "사용" : "미사용"}</button><button type="button" onClick={() => { setEditingAvailability(item); setShowAvailabilityForm(true); }} className="font-semibold text-blue-700">수정</button><button type="button" onClick={() => void removeAvailability(item.id)} className="font-semibold text-rose-600">삭제</button></div>)}
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white">
            <header className="border-b border-slate-200 px-4 py-4"><h2 className="font-bold">휴진·진료 불가 일정</h2><p className="mt-1 text-xs text-slate-500">휴가, 휴진, 특정 시간 진료 불가를 등록합니다.</p></header>
            <div className="space-y-3 p-4">{unavailable.length === 0 ? <p className="py-3 text-center text-sm text-slate-400">등록된 휴진 일정이 없습니다.</p> : unavailable.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3 text-xs"><p className="font-semibold">{new Date(item.start_at).toLocaleString("ko-KR")} – {new Date(item.end_at).toLocaleString("ko-KR")}</p>{item.reason && <p className="mt-1 text-slate-500">{item.reason}</p>}<div className="mt-2 flex gap-3"><button type="button" onClick={() => { setEditingUnavailable(item); setShowUnavailableForm(true); }} className="font-semibold text-blue-700">수정</button><button type="button" onClick={() => void removeUnavailable(item.id)} className="font-semibold text-rose-600">삭제</button></div></div>)}<button type="button" onClick={() => { setShowUnavailableForm((open) => !open); setEditingUnavailable(null); }} className="w-full rounded-lg border border-blue-200 py-2.5 text-sm font-semibold text-blue-700">{showUnavailableForm ? "입력 닫기" : "휴진 일정 입력"}</button></div>
          </section>
          <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-slate-600">활성화된 기본 진료시간에서 휴진 일정을 제외해 환자 예약 가능시간을 계산합니다. 추가 진료 가능 일정은 환자 예약 계산에 사용하지 않습니다.</section>
        </aside>
      </main>
      {showAvailabilityForm && <Modal title={editingAvailability ? "기본 진료시간 수정" : "기본 진료시간 입력"} onClose={() => { setShowAvailabilityForm(false); setEditingAvailability(null); }}>
        <form key={editingAvailability?.id ?? "new"} onSubmit={submitAvailability} className="space-y-4">
          {editingAvailability ? <Field label="요일"><select name="weekday" required defaultValue={editingAvailability.weekday}>{WEEKDAYS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></Field> : <fieldset><legend className="mb-1.5 text-xs font-semibold text-slate-600">적용 요일</legend><div className="grid grid-cols-4 gap-2">{WEEKDAYS.map((label, index) => <label key={label} className="flex items-center gap-1.5 rounded border border-slate-200 px-2 py-2 text-xs"><input name="weekdays" type="checkbox" value={index} />{label.slice(0, 1)}</label>)}</div><p className="mt-2 text-[11px] text-slate-500">같은 시간 구간을 선택한 모든 요일에 등록합니다.</p></fieldset>}
          <div className="grid grid-cols-2 gap-3"><Field label="시작 시간"><input name="startTime" type="time" required defaultValue={editingAvailability?.start_time.slice(0, 5)} /></Field><Field label="종료 시간"><input name="endTime" type="time" required defaultValue={editingAvailability?.end_time.slice(0, 5)} /></Field></div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-500">예약 간격 <strong className="ml-1 text-slate-800">30분</strong></span><label className="flex items-center gap-2"><input name="enabled" type="checkbox" defaultChecked={editingAvailability?.enabled ?? true} /> 환자 예약 사용</label></div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => { setShowAvailabilityForm(false); setEditingAvailability(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">취소</button><button disabled={saving} className="button-primary">{saving ? "저장 중" : editingAvailability ? "수정 저장" : "저장"}</button></div>
        </form>
      </Modal>}
      {showUnavailableForm && <Modal title={editingUnavailable ? "휴진 일정 수정" : "휴진 일정 입력"} onClose={() => { setShowUnavailableForm(false); setEditingUnavailable(null); }}>
        <form key={editingUnavailable?.id ?? "new"} onSubmit={submitUnavailable} className="space-y-4">
          <Field label="진료 불가 시작"><input name="startAt" type="datetime-local" required defaultValue={editingUnavailable ? toLocalDateTimeInput(editingUnavailable.start_at) : ""} /></Field>
          <Field label="진료 불가 종료"><input name="endAt" type="datetime-local" required defaultValue={editingUnavailable ? toLocalDateTimeInput(editingUnavailable.end_at) : ""} /></Field>
          <Field label="사유"><textarea name="reason" rows={3} defaultValue={editingUnavailable?.reason ?? ""} placeholder="휴진 또는 진료 불가 사유" /></Field>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => { setShowUnavailableForm(false); setEditingUnavailable(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">취소</button><button disabled={saving} className="button-primary">{saving ? "저장 중" : editingUnavailable ? "수정 저장" : "저장"}</button></div>
        </form>
      </Modal>}
      {message && <div role="alert" className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-3 text-sm text-white shadow-lg">{message}<button type="button" onClick={() => setMessage(null)} className="ml-3 text-slate-300">닫기</button></div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">{label}</span>{children}</label>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" onMouseDown={onClose}>
    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-bold">{title}</h2><button type="button" onClick={onClose} aria-label="닫기" className="rounded p-1 text-xl leading-none text-slate-500 hover:bg-slate-100">×</button></header>
      <div className="p-5">{children}</div>
    </div>
  </div>;
}
