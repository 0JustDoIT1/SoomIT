"use client";

import { useState } from "react";

import { cancelExaminationOrder, updateExaminationOrder, type ExaminationOrder, type ExaminationOrderPriority } from "../../_lib/respiratory-api";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function OrderManagementItem({ caseId, order, authorizedFetch, onChanged }: { caseId: string; order: ExaminationOrder; authorizedFetch: AuthorizedFetch; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [priority, setPriority] = useState<ExaminationOrderPriority>(order.priority);
  const [purpose, setPurpose] = useState(order.purpose ?? "");
  const [clinicalNote, setClinicalNote] = useState(order.clinical_note ?? "");
  const [error, setError] = useState("");
  const canEdit = order.status === "ORDERED";
  const canCancel = order.status === "ORDERED" || order.status === "SCHEDULED";

  async function save() {
    if (!purpose.trim()) { setError("검사 목적을 입력해 주세요."); return; }
    setSaving(true); setError("");
    try {
      await updateExaminationOrder(authorizedFetch, caseId, order.id, { priority, purpose: purpose.trim(), clinical_note: clinicalNote.trim() });
      setEditing(false); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "검사 오더 수정에 실패했습니다."); }
    finally { setSaving(false); }
  }

  async function cancel() {
    setSaving(true); setError("");
    try {
      await cancelExaminationOrder(authorizedFetch, caseId, order.id);
      setConfirmingCancel(false); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "검사 오더 취소에 실패했습니다."); }
    finally { setSaving(false); }
  }

  return <article className="rounded-md border border-slate-100 bg-slate-50 p-3 text-xs">
    <div className="grid grid-cols-2 gap-x-3 gap-y-1"><Field label="검사" value={order.order_type_label} /><Field label="상태" value={statusLabel(order.status)} /><Field label="우선순위" value={order.priority === "URGENT" ? "긴급" : "일반"} /><Field label="생성 시각" value={formatDateTime(order.created_at)} /><div className="col-span-2"><Field label="검사 목적" value={order.purpose || "-"} /></div></div>
    {(canEdit || canCancel) && !editing && !confirmingCancel && <div className="mt-3 flex justify-end gap-2">{canEdit && <button type="button" onClick={() => { setEditing(true); setError(""); }} className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700">수정</button>}{canCancel && <button type="button" onClick={() => { setConfirmingCancel(true); setError(""); }} className="rounded border border-rose-200 bg-white px-2 py-1 font-semibold text-rose-700">오더 취소</button>}</div>}
    {editing && <div className="mt-3 border-t border-slate-200 pt-3"><p className="font-semibold text-slate-800">오더 수정</p><div className="mt-2 grid grid-cols-2 gap-2"><label>우선순위<select aria-label="수정 우선순위" value={priority} disabled={saving} onChange={(event) => setPriority(event.target.value as ExaminationOrderPriority)} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1"><option value="NORMAL">일반</option><option value="URGENT">긴급</option></select></label><label className="col-span-2">검사 목적<input aria-label="수정 검사 목적" value={purpose} maxLength={500} disabled={saving} onChange={(event) => setPurpose(event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1" /></label><label className="col-span-2">임상 소견<textarea aria-label="수정 임상 소견" value={clinicalNote} maxLength={1000} rows={2} disabled={saving} onChange={(event) => setClinicalNote(event.target.value)} className="mt-1 w-full resize-none rounded border border-slate-300 bg-white px-2 py-1" /></label></div><div className="mt-2 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded border border-slate-300 bg-white px-2 py-1">닫기</button><button type="button" disabled={saving} onClick={() => void save()} className="rounded bg-blue-600 px-2 py-1 font-semibold text-white">{saving ? "저장 중" : "수정 저장"}</button></div></div>}
    {confirmingCancel && <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-2 text-rose-800"><p>이 오더를 취소하시겠습니까? 취소 후에는 다시 활성화할 수 없습니다.</p><div className="mt-2 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setConfirmingCancel(false)} className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700">닫기</button><button type="button" disabled={saving} onClick={() => void cancel()} className="rounded bg-rose-600 px-2 py-1 font-semibold text-white">{saving ? "취소 중" : "오더 취소 확정"}</button></div></div>}
    {error && <p role="alert" className="mt-2 text-rose-700">{error}</p>}
  </article>;
}

function Field({ label, value }: { label: string; value: string }) { return <div><p className="text-slate-400">{label}</p><p className="mt-1 break-words font-semibold text-slate-700">{value}</p></div>; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR"); }
function statusLabel(value: string) { return ({ ORDERED: "요청됨", SCHEDULED: "예약됨", COMPLETED: "완료", CANCELLED: "취소됨" } as Record<string, string>)[value] ?? value; }
