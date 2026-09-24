"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MfdsProductSelector } from "./mfds-product-selector";
import { MedicationSchedulePanel } from "./medication-schedule-panel";
import { PrescriptionFinalizeScheduleForm, type FinalizeMedicationSchedule } from "./prescription-finalize-schedule-form";

import { showToast } from "@/components/ui/toast/toast";
import type { AuthorizedFetch } from "./treatment-prescription-types";

type Item = { id: string; drug_name: string; ingredient_name?: string | null; mfds_item_seq?: string | null; calculated_dose: string | number | null; final_dose: string | number | null; unit: string | null; route: string; instructions?: string | null };
type Safety = { id: string; check_type_label: string; result: "PASS" | "WARNING" | "BLOCK"; result_label?: string; message: string; source_code?: string | null; acknowledged_at?: string | null; acknowledgment_note?: string | null };
type Prescription = { id: string; regimen_detail?: { regimen_name: string; regimen_code: string }; cycle_number: number; phase_label?: string; prescription_status: string; prescription_status_label?: string; items: Item[]; safety_check_results: Safety[] };
type Props = { caseId: string; apiBaseUrl: string; authorizedFetch: AuthorizedFetch; refreshKey?: number; actionable?: boolean; waitingMessage?: string; hasSelectedRegimen?: boolean; requiresPrescription?: boolean; onPrescriptionChanged?: () => void };

const UNRESOLVED_SAFETY_SOURCE_CODES = new Set(["DUR_API_ERROR", "DUR_MAPPING_UNRESOLVED", "ALLERGY_UNCONFIRMED", "LAB_MISSING"]);

export function PrescriptionPanel({ caseId, apiBaseUrl, authorizedFetch, refreshKey = 0, actionable = true, waitingMessage, hasSelectedRegimen = false, requiresPrescription = true, onPrescriptionChanged }: Props) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState("");
  const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false);
  const workingRef = useRef(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [cycleNumber, setCycleNumber] = useState("1"); const [phase, setPhase] = useState("INDUCTION"); const [cycleStartDate, setCycleStartDate] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const r = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/`); const d = await r.json().catch(() => ([])); if (!r.ok) throw new Error(d.detail || "처방 목록을 불러오지 못했습니다."); setPrescriptions(d as Prescription[]); }
    catch (e) { setError(e instanceof Error ? e.message : "처방 목록을 불러오지 못했습니다."); }
    finally { setLoading(false); }
  }, [apiBaseUrl, authorizedFetch, caseId]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, refreshKey]);
  const completed = async (text: string) => { await load(); setMessage(text); onPrescriptionChanged?.(); };
  const request = async (url: string, init: RequestInit, success: string, toastId?: string) => {
    if (workingRef.current) return false;
    workingRef.current = true;
    setWorking(true); setError(""); setMessage("");
    try { const r = await authorizedFetch(url, init); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.detail || success); await completed(success); if (toastId) showToast.success(success, { id: toastId }); return true; }
    catch (e) { console.error(e); const text = e instanceof Error ? e.message : success; setError(text); if (toastId) showToast.error(text, { id: toastId }); return false; }
    finally { workingRef.current = false; setWorking(false); }
  };
  const create = async () => { if (!actionable || workingRef.current || !requiresPrescription || !hasSelectedRegimen || !cycleStartDate) return; const id = `case-prescription-create-${caseId}`; showToast.info("처방을 저장하고 있습니다.", { id }); const ok = await request(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycle_number: Number(cycleNumber), phase, cycle_start_date: cycleStartDate }) }, "처방 DRAFT가 생성되었습니다.", id); if (ok) { setCycleNumber("1"); setPhase("INDUCTION"); setCycleStartDate(""); } };
  const updateItem = (prescriptionId: string, itemId: string, body: object) => request(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/items/${itemId}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, "처방 약물 정보가 수정되었습니다.", `case-prescription-item-${caseId}-${itemId}`);
  const safety = (id: string) => request(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/${id}/safety-check/`, { method: "POST" }, "안전성 검사가 완료되었습니다.");
  const acknowledge = async (id: string) => { const note = window.prompt("WARNING 확인 사유를 입력하세요.", "담당의 검토 후 처방 진행"); if (note === null) return; if (!note.trim()) { setError("WARNING 확인 사유를 입력해 주세요."); return; } await request(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/${id}/warnings/acknowledge/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acknowledgment_note: note.trim() }) }, "WARNING 확인이 완료되었습니다."); };
  const finalize = async (id: string, schedules: FinalizeMedicationSchedule[]) => { if (!window.confirm("처방을 최종 확정하면 이후 수정할 수 없습니다.\n계속하시겠습니까?")) return; const toastId = `case-prescription-finalize-${caseId}-${id}`; showToast.info("처방을 확정하고 있습니다.", { id: toastId }); await request(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/${id}/finalize/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ medication_schedules: schedules }) }, "처방이 최종 확정되었습니다.", toastId); };

  if (loading) return <section className="rounded-lg bg-white p-4 text-sm">처방 조회 중...</section>;

  const creationForm = actionable && requiresPrescription ? (
      <details className="shrink-0 border-t border-slate-200 pt-2" open={prescriptions.length === 0}>
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">새 처방 생성 · 확정 치료결정 기반</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input type="number" min="1" value={cycleNumber} onChange={e => setCycleNumber(e.target.value)} className="w-20 rounded-lg border border-slate-200 p-2 text-xs" aria-label="Cycle 번호" />
          <select value={phase} onChange={e => setPhase(e.target.value)} className="rounded-lg border border-slate-200 p-2 text-xs" aria-label="치료 단계"><option value="INDUCTION">INDUCTION</option><option value="MAINTENANCE">MAINTENANCE</option><option value="CONTINUOUS">지속치료</option></select>
          <input required type="date" value={cycleStartDate} onChange={e => setCycleStartDate(e.target.value)} className="rounded-lg border border-slate-200 p-2 text-xs" aria-label="Cycle 시작일" />
          <button type="button" disabled={working || !hasSelectedRegimen || !cycleStartDate} onClick={() => void create()} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:bg-slate-200 disabled:text-slate-500 ${prescriptions.length ? "border border-slate-300 bg-white text-slate-700" : "bg-blue-600 text-white"}`}>{working ? "생성 중..." : "임시 처방 생성"}</button>
          {!hasSelectedRegimen && <p className="text-xs text-amber-700">선택된 Regimen이 없어 처방을 생성할 수 없습니다.</p>}
        </div>
      </details>
  ) : null;
  const active = prescriptions.find(p => p.id === selectedPrescriptionId) ?? prescriptions.find(p => p.prescription_status !== "CANCELLED" && p.prescription_status !== "FINAL") ?? prescriptions[0];
  const hasUnresolvedWarning = active?.safety_check_results.some(result => result.result === "WARNING" && UNRESOLVED_SAFETY_SOURCE_CODES.has(result.source_code ?? "")) ?? false;
  const hasUnacknowledgedWarning = active?.safety_check_results.some(result => result.result === "WARNING" && !result.acknowledged_at && !UNRESOLVED_SAFETY_SOURCE_CODES.has(result.source_code ?? "")) ?? false;
  return <section className="flex h-full min-h-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3" aria-label="처방 작업공간">
    <header className="flex shrink-0 items-center justify-between gap-3"><h2 className="text-sm font-bold text-slate-800">처방 관리</h2><p className="text-xs text-slate-500">임시 처방 → 안전성 검사 → 경고 확인 → 최종 확정</p></header>
    {!actionable && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{waitingMessage ?? "현재 처방은 조회만 가능합니다."}</p>}
    {actionable && !requiresPrescription && <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">확정된 비약물 치료계획입니다. 약물 처방 없이 상단의 종료·의뢰 처리로 진행할 수 있습니다.</p>}
      {error && <p role="alert" className="shrink-0 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
      {message && <p role="status" className="shrink-0 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">{message}</p>}
      {prescriptions.length > 0 && <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-700">처방 선택<select aria-label="처방 선택" value={active?.id ?? ""} onChange={event => setSelectedPrescriptionId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2">{prescriptions.map(p => <option key={p.id} value={p.id}>{p.regimen_detail?.regimen_name ?? "Regimen"} · 주기 {p.cycle_number} · {p.prescription_status_label ?? p.prescription_status}</option>)}</select></label>}
      {active ? <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)] gap-3" key={active.id}>
        <section className="min-h-0 overflow-y-auto pr-1" aria-label="처방 약물 목록">
          <p className="text-xs text-slate-500">{active.regimen_detail?.regimen_code ?? "-"} · {active.phase_label ?? "-"} · 투여 주기 {active.cycle_number}</p>
          {active.items.map(item => <ItemRow key={item.id} item={item} editable={actionable && ["DRAFT", "VALIDATED"].includes(active.prescription_status)} working={working} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} onSave={body => updateItem(active.id, item.id, body)} />)}
          {active.prescription_status === "FINAL" && <MedicationSchedulePanel caseId={caseId} prescriptionId={active.id} items={active.items} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} />}
          {creationForm}
        </section>
        <aside className="flex min-h-0 flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label="안전성 검토 및 최종 확정">
          <h3 className="shrink-0 text-sm font-semibold">Safety Check · {active.prescription_status_label ?? active.prescription_status}</h3>
          {active.safety_check_results.some(r => r.result === "BLOCK") && <p role="alert" className="shrink-0 rounded-lg border border-rose-300 bg-rose-50 p-2 text-xs font-semibold text-rose-800">BLOCK 결과가 있어 처방을 최종 확정할 수 없습니다.</p>}
          {hasUnresolvedWarning ? <p role="alert" className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-800">미해결 WARNING · 환자 정보 또는 외부 조회 상태를 보완한 뒤 Safety Check를 다시 실행해야 합니다.</p> : hasUnacknowledgedWarning && <p role="alert" className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-800">WARNING · 의료진 검토와 확인 사유가 필요합니다.</p>}
          <div className="min-h-0 max-h-16 shrink overflow-y-auto" aria-label="안전성 검사 상세">
            {active.safety_check_results.length === 0 && <p className="text-xs text-slate-500">안전성 검사 대기</p>}
            {active.safety_check_results.map(result => <div key={result.id} className={`border-b py-2 text-xs ${result.result === "BLOCK" ? "border-rose-200 text-rose-800" : result.result === "WARNING" ? "border-amber-200 text-amber-800" : "border-slate-200 text-emerald-800"}`}><p className="font-semibold">{result.check_type_label} · {result.result_label ?? result.result}</p><p className="mt-1">{result.message}</p>{result.result === "WARNING" && result.acknowledged_at && <p className="mt-1">의료진 확인 완료{result.acknowledgment_note ? ` · ${result.acknowledgment_note}` : ""}</p>}</div>)}
          </div>
          {actionable && active.prescription_status === "DRAFT" && <button type="button" disabled={working} onClick={() => void safety(active.id)} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{working ? "실행 중..." : active.safety_check_results.length ? "안전성 검사 다시 실행" : "안전성 검사 실행"}</button>}
          {actionable && active.prescription_status === "VALIDATED" && <button type="button" disabled={working} onClick={() => void safety(active.id)} className="shrink-0 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50">안전성 검사 다시 실행</button>}
          {actionable && active.prescription_status === "VALIDATED" && hasUnacknowledgedWarning && <button type="button" disabled={working} onClick={() => void acknowledge(active.id)} className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">WARNING 확인</button>}
          {actionable && active.prescription_status === "VALIDATED" && !active.safety_check_results.some(r => r.result === "BLOCK") && !hasUnresolvedWarning && !hasUnacknowledgedWarning && <div className="flex min-h-0 flex-1 flex-col"><PrescriptionFinalizeScheduleForm items={active.items} working={working} onFinalize={async schedules => finalize(active.id, schedules)} /></div>}
          {active.prescription_status === "FINAL" && <p className="shrink-0 rounded-lg bg-emerald-50 p-2 text-xs font-semibold text-emerald-700">최종 확정 완료 · 수정 불가</p>}
        </aside>
      </div> : <div className="min-h-0 flex-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{creationForm}<p className="mt-2">등록된 처방이 없습니다.</p></div>}
  </section>;
}

function ItemRow({ item, editable, working, apiBaseUrl, authorizedFetch, onSave }: { item: Item; editable: boolean; working: boolean; apiBaseUrl: string; authorizedFetch: AuthorizedFetch; onSave: (body: object) => Promise<boolean> }) {
  const [finalDose, setFinalDose] = useState(item.final_dose !== null ? String(item.final_dose) : ""); const [instructions, setInstructions] = useState(item.instructions ?? "");
  return <div className="mt-3 rounded border border-slate-100 bg-white p-3"><div className="grid gap-2 text-xs sm:grid-cols-2"><p className="font-semibold text-slate-700">{item.drug_name}<span className="ml-1 font-normal text-slate-400">{item.ingredient_name}</span></p><p className="text-slate-500">계산 {item.calculated_dose ?? "-"}{item.unit ?? ""} · 최종 {item.final_dose ?? "-"}{item.unit ?? ""} · {item.route}</p></div>{item.instructions && <p className="mt-1 text-xs text-slate-600">투여 지시 · {item.instructions}</p>}{editable ? <MfdsProductSelector ingredientName={item.ingredient_name ?? item.drug_name} selectedItemSeq={item.mfds_item_seq} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} onSelect={async (mfdsItemSeq) => { await onSave({ mfds_item_seq: mfdsItemSeq }); }} /> : item.mfds_item_seq && <p className="mt-1 text-xs text-slate-500">ITEM_SEQ {item.mfds_item_seq}</p>}{editable && <div className="mt-3 grid gap-2 grid-cols-[90px_minmax(0,1fr)] [&>button]:col-span-2"><input type="number" min="0" value={finalDose} onChange={(e) => setFinalDose(e.target.value)} className="rounded border border-slate-200 px-3 py-2 text-sm" aria-label={`${item.drug_name} 최종 용량`} /><input value={instructions} onChange={(e) => setInstructions(e.target.value)} className="rounded border border-slate-200 px-3 py-2 text-sm" aria-label={`${item.drug_name} 투여 지시`} /><button type="button" disabled={working || finalDose === ""} onClick={() => void onSave({ final_dose: finalDose, instructions })} className="rounded border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50">수정 저장</button></div>}</div>;
}
