"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MfdsProductSelector } from "./mfds-product-selector";
import { MedicationSchedulePanel } from "./medication-schedule-panel";
import { PrescriptionFinalizeScheduleForm, type FinalizeMedicationSchedule } from "./prescription-finalize-schedule-form";
import { PrescriptionDateField } from "./prescription-date-field";
import { formatPrescriptionDose } from "./prescription-dose-format";
import { PatientSafetyDataPanel } from "./patient-safety-data-panel";
import { FinalCareSummaryDialog } from "./final-care-summary-dialog";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";

import { showToast } from "@/components/ui/toast/toast";
import { LoadingIndicator } from "@/components/common/loading-indicator";
import type { AuthorizedFetch } from "./treatment-prescription-types";

type Item = { id: string; drug_name: string; ingredient_name?: string | null; mfds_item_seq?: string | null; calculated_dose: string | number | null; final_dose: string | number | null; unit: string | null; route: string; instructions?: string | null };
type Safety = { id: string; check_type_label: string; result: "PASS" | "WARNING" | "BLOCK"; result_label?: string; message: string; source_code?: string | null; acknowledged_at?: string | null; acknowledgment_note?: string | null };
type Prescription = { id: string; regimen_detail?: { regimen_name: string; regimen_code: string }; cycle_number: number; phase_label?: string; prescription_status: string; prescription_status_label?: string; safety_freshness?: "NOT_RUN" | "CURRENT" | "RECHECK_REQUIRED"; patient_account_linked?: boolean; items: Item[]; safety_check_results: Safety[] };
type Props = { caseId: string; apiBaseUrl: string; authorizedFetch: AuthorizedFetch; doctorDisplayName?: string | null; refreshKey?: number; actionable?: boolean; waitingMessage?: string; hasSelectedRegimen?: boolean; requiresPrescription?: boolean; availablePrescriptionPhases?: string[]; onPrescriptionChanged?: () => void };

const UNRESOLVED_SAFETY_SOURCE_CODES = new Set(["DUR_API_ERROR", "DUR_MAPPING_UNRESOLVED", "ALLERGY_UNCONFIRMED", "LAB_MISSING"]);
const REQUEST_FAILED = "처방 요청에 실패했습니다. 입력값과 연결 상태를 확인해 주세요.";
const REFRESH_FAILED = "요청은 처리되었지만 처방 정보를 새로 불러오지 못했습니다. 상태를 확인한 뒤 계속해 주세요.";
const PHASE_LABELS: Record<string, string> = {
  INDUCTION: "초기치료",
  MAINTENANCE: "유지요법",
  CONTINUOUS: "지속치료",
};

function prescriptionError(data: unknown): string {
  if (!data || typeof data !== "object") return REQUEST_FAILED;
  const values = Object.values(data);
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value)) {
      const message = value.find(item => typeof item === "string" && item.trim());
      if (message) return message;
    }
  }
  return REQUEST_FAILED;
}

export function PrescriptionPanel({ caseId, apiBaseUrl, authorizedFetch, doctorDisplayName, refreshKey = 0, actionable = true, waitingMessage, hasSelectedRegimen = false, requiresPrescription = true, availablePrescriptionPhases = [], onPrescriptionChanged }: Props) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState("");
  const [loading, setLoading] = useState(true); const [working, setWorking] = useState(false);
  const [checkingSafety, setCheckingSafety] = useState(false);
  const workingRef = useRef(false);
  const prescriptionsRef = useRef<Prescription[]>([]);
  const loadedCaseIdRef = useRef<string | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [cycleNumber, setCycleNumber] = useState("1"); const [phase, setPhase] = useState("INDUCTION"); const [cycleStartDate, setCycleStartDate] = useState("");
  const [summaryPrescription, setSummaryPrescription] = useState<Prescription | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [pendingFinalization, setPendingFinalization] = useState<{ id: string; schedules: FinalizeMedicationSchedule[] } | null>(null);
  const supportedPhases = Array.from(new Set(availablePrescriptionPhases)).filter((value) => value in PHASE_LABELS);
  const selectedPhase = supportedPhases.includes(phase) ? phase : (supportedPhases[0] ?? "");

  const load = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setLoading(true); setError("");
    try { const r = await authorizedFetch(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/`); const d = await r.json().catch(() => null); if (!r.ok || !Array.isArray(d)) throw new Error(d?.detail || "처방 목록을 불러오지 못했습니다."); prescriptionsRef.current = d as Prescription[]; setPrescriptions(d as Prescription[]); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "처방 목록을 불러오지 못했습니다."); return false; }
    finally { if (showLoading) setLoading(false); }
  }, [apiBaseUrl, authorizedFetch, caseId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const showLoading = loadedCaseIdRef.current !== caseId;
      loadedCaseIdRef.current = caseId;
      void load({ showLoading });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [caseId, load, refreshKey]);
  const completed = async (text: string, notifyParent = true) => { if (!await load({ showLoading: false })) { setError(REFRESH_FAILED); return false; } setMessage(text); if (notifyParent) onPrescriptionChanged?.(); return true; };
  const request = async (url: string, init: RequestInit, success: string, toastId?: string, notifyParent = true) => {
    if (workingRef.current) return false;
    workingRef.current = true;
    setWorking(true); setError(""); setMessage("");
    try { const r = await authorizedFetch(url, init); const d = await r.json().catch(() => null); if (!r.ok) { const text = prescriptionError(d); setError(text); if (toastId) showToast.error(text, { id: toastId }); return false; } if (!await completed(success, notifyParent)) { if (toastId) showToast.error(REFRESH_FAILED, { id: toastId }); return false; } if (toastId) showToast.success(success, { id: toastId }); return true; }
    catch (e) { const text = e instanceof Error && e.message ? e.message : REQUEST_FAILED; setError(text); if (toastId) showToast.error(text, { id: toastId }); return false; }
    finally { workingRef.current = false; setWorking(false); }
  };
  const create = async () => { if (!actionable || workingRef.current || !requiresPrescription || !hasSelectedRegimen || !supportedPhases.includes(selectedPhase) || !cycleStartDate) return; const id = `case-prescription-create-${caseId}`; showToast.info("처방을 저장하고 있습니다.", { id }); const ok = await request(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycle_number: Number(cycleNumber), phase: selectedPhase, cycle_start_date: cycleStartDate }) }, "처방 DRAFT가 생성되었습니다.", id); if (ok) { setCycleNumber("1"); setPhase(supportedPhases[0] ?? ""); setCycleStartDate(""); } };
  const updateItem = (prescriptionId: string, itemId: string, body: object) => request(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/${prescriptionId}/items/${itemId}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, "처방 약물 정보가 수정되었습니다.", `case-prescription-item-${caseId}-${itemId}`, false);
  const safety = async (id: string) => {
    if (workingRef.current) return;
    setCheckingSafety(true);
    try { await request(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/${id}/safety-check/`, { method: "POST" }, "안전성 검사가 완료되었습니다.", undefined, false); }
    finally { setCheckingSafety(false); }
  };
  const finalize = async (id: string, schedules: FinalizeMedicationSchedule[]) => { const toastId = `case-prescription-finalize-${caseId}-${id}`; showToast.info("처방을 확정하고 있습니다.", { id: toastId }); const completedFinalization = await request(`${apiBaseUrl}/api/doctor/cases/${caseId}/prescriptions/${id}/finalize/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ medication_schedules: schedules }) }, "처방이 최종 확정되었습니다.", toastId); const finalized = prescriptionsRef.current.find((prescription) => prescription.id === id && prescription.prescription_status === "FINAL"); if (completedFinalization && finalized) { setSummaryPrescription(finalized); setSummaryOpen(true); } };
  const closeSummary = useCallback(() => setSummaryOpen(false), []);

  if (loading) return <LoadingIndicator label="처방 정보를 불러오는 중입니다." />;

  const hasOpenPrescription = prescriptions.some(prescription => ["DRAFT", "VALIDATED"].includes(prescription.prescription_status));
  const creationForm = actionable && requiresPrescription && !hasOpenPrescription ? prescriptions.length === 0 ? (
    <section aria-labelledby="first-prescription-title" className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-lg font-bold text-blue-700">Rx</span>
        <div>
          <p className="text-sm font-semibold text-blue-700">처방 시작</p>
          <h3 id="first-prescription-title" className="mt-1 text-lg font-bold text-slate-900">첫 처방을 생성하세요</h3>
          <p className="mt-1 text-sm leading-6 text-slate-500">확정된 치료결정을 기준으로 DRAFT를 생성합니다. 생성 후 약물과 용량을 확인하고 Safety Check를 진행할 수 있습니다.</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="text-sm font-semibold text-slate-600">Cycle 번호
          <input type="number" min="1" value={cycleNumber} onChange={e => setCycleNumber(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="text-sm font-semibold text-slate-600">치료 단계
          <select aria-label="치료 단계" value={selectedPhase} disabled={supportedPhases.length === 0} onChange={e => setPhase(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100">{supportedPhases.length ? supportedPhases.map(value => <option key={value} value={value}>{value} · {PHASE_LABELS[value]}</option>) : <option value="">사용 가능한 치료 단계 없음</option>}</select>
        </label>
        <PrescriptionDateField required label="Cycle 시작일" value={cycleStartDate} onChange={setCycleStartDate} className="w-full" />
      </div>
      {!hasSelectedRegimen && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">선택된 Regimen이 없어 처방을 생성할 수 없습니다. 치료계획에서 Regimen을 먼저 확정해주세요.</p>}
      {hasSelectedRegimen && supportedPhases.length === 0 && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">선택한 Regimen에 등록된 약물 치료 단계가 없습니다. Regimen 약물 스케줄을 확인해주세요.</p>}
      <div className="mt-4 flex flex-col-reverse items-stretch justify-between gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
        <p className="text-sm text-slate-500">처방은 자동 생성되지 않으며, 시작일을 선택한 뒤 직접 생성합니다.</p>
        <button type="button" disabled={working || !hasSelectedRegimen || !supportedPhases.includes(selectedPhase) || !cycleStartDate} onClick={() => void create()} className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none">{working ? "생성 중..." : "처방 생성"}</button>
      </div>
    </section>
  ) : (
      <details className="shrink-0 border-t border-slate-200 pt-2">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">다음 Cycle 처방 생성</summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input type="number" min="1" value={cycleNumber} onChange={e => setCycleNumber(e.target.value)} className="w-20 rounded-lg border border-slate-200 p-2 text-sm" aria-label="Cycle 번호" />
          <select value={selectedPhase} disabled={supportedPhases.length === 0} onChange={e => setPhase(e.target.value)} className="rounded-lg border border-slate-200 p-2 text-sm disabled:bg-slate-100" aria-label="치료 단계">{supportedPhases.length ? supportedPhases.map(value => <option key={value} value={value}>{value} · {PHASE_LABELS[value]}</option>) : <option value="">사용 가능한 단계 없음</option>}</select>
          <PrescriptionDateField required label="Cycle 시작일" value={cycleStartDate} onChange={setCycleStartDate} className="w-36" />
          <button type="button" disabled={working || !hasSelectedRegimen || !supportedPhases.includes(selectedPhase) || !cycleStartDate} onClick={() => void create()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-200 disabled:text-slate-500">{working ? "생성 중..." : "다음 Cycle 처방 생성"}</button>
          {!hasSelectedRegimen && <p className="text-sm text-amber-700">선택된 Regimen이 없어 처방을 생성할 수 없습니다.</p>}
        </div>
      </details>
  ) : null;
  const active = prescriptions.find(p => p.id === selectedPrescriptionId) ?? prescriptions.find(p => p.prescription_status !== "CANCELLED" && p.prescription_status !== "FINAL") ?? prescriptions[0];
  const safetyIsCurrent = active?.safety_freshness === "CURRENT";
  const safetyRecheckRequired = Boolean(active
    && active.prescription_status !== "FINAL"
    && (active.safety_freshness === "RECHECK_REQUIRED"
      || (active.prescription_status === "VALIDATED" && !safetyIsCurrent)));
  const hasUnresolvedWarning = active?.safety_check_results.some(result => result.result === "WARNING" && UNRESOLVED_SAFETY_SOURCE_CODES.has(result.source_code ?? "")) ?? false;
  const hasUnacknowledgedWarning = active?.safety_check_results.some(result => result.result === "WARNING" && !result.acknowledged_at && !UNRESOLVED_SAFETY_SOURCE_CODES.has(result.source_code ?? "")) ?? false;
  const isFinal = active?.prescription_status === "FINAL";
  const hasBlock = active?.safety_check_results.some(result => result.result === "BLOCK") ?? false;
  const safetyLabel = checkingSafety ? "검사 중" : !isFinal && safetyRecheckRequired ? "RECHECK_REQUIRED · 재검사 필요" : hasBlock ? "BLOCK · 경고" : hasUnresolvedWarning || hasUnacknowledgedWarning ? "WARNING · 경고" : active?.safety_freshness === "NOT_RUN" ? "미실행" : active?.safety_check_results.length && active.safety_check_results.every(result => result.result === "PASS") ? "PASS" : active?.safety_check_results.some(result => result.result === "WARNING") ? "WARNING · 확인 완료" : safetyIsCurrent ? "검사 완료" : "결과 확인 필요";
  const finalGuidance = isFinal ? "FINAL · 조회 전용입니다." : active?.prescription_status === "CANCELLED" ? "취소된 처방입니다. 조회만 가능합니다." : !actionable ? "현재 처방은 조회만 가능합니다." : checkingSafety ? "Safety Check 결과를 기다려주세요." : hasBlock || hasUnresolvedWarning ? "Safety 경고를 확인한 뒤 처방을 계속 진행할 수 있습니다." : safetyRecheckRequired ? "검사 결과가 변경되어 Safety Check를 다시 실행해야 합니다." : hasUnacknowledgedWarning ? "안전성 경고가 확인되었습니다. 내용을 검토한 후 처방을 계속 진행할 수 있습니다." : active?.prescription_status === "VALIDATED" && safetyIsCurrent ? "안전성 검토가 완료되었습니다. 용량과 복약 일정을 확인한 뒤 최종 확정해주세요." : "Safety Check를 먼저 실행해주세요.";
  const workflowStateLabel = hasBlock ? "BLOCK 경고" : hasUnresolvedWarning ? "WARNING 경고" : hasUnacknowledgedWarning ? "WARNING 경고" : active?.prescription_status === "VALIDATED" && active.safety_check_results.some(result => result.result === "WARNING") ? "확인 완료" : active?.prescription_status === "VALIDATED" && safetyIsCurrent ? "Safety 통과" : active?.prescription_status_label ?? ({ DRAFT: "작성 중", FINAL: "확정", CANCELLED: "취소" } as Record<string, string>)[active?.prescription_status ?? ""] ?? "상태 확인 필요";
  const progressIndex = isFinal ? 3 : active?.prescription_status === "CANCELLED" ? -1 : active?.prescription_status === "VALIDATED" && safetyIsCurrent ? 2 : 1;
  const visibleMessage = message === "처방이 최종 확정되었습니다." && active?.prescription_status !== "FINAL"
    ? ""
    : message;
  const focusSafetyInput = (sourceCode?: string | null, messageText = "") => {
    const targetId = sourceCode === "ALLERGY_UNCONFIRMED"
      ? "safety-input-allergy"
      : sourceCode === "DUR_MAPPING_UNRESOLVED"
        ? "safety-input-medication"
        : sourceCode === "LAB_MISSING"
          ? (messageText.includes("간") || messageText.includes("AST") ? "safety-input-hepatic" : "safety-input-renal")
          : "patient-safety-inputs";
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.querySelector<HTMLElement>("input, select, textarea")?.focus();
  };
  return <section className="flex h-full min-h-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3" aria-label="처방 작업공간">
    <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-3"><h2 className="text-base font-bold text-slate-800">처방 관리</h2><p className="text-sm text-slate-500">약물 확인 → 용량 확인·조정 → Safety Check → 최종 확정</p></header>
    {active && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm"><ol aria-label="처방 진행 상태" className="flex flex-wrap items-center gap-2">{["DRAFT", "Safety Check", "VALIDATED", "FINAL"].map((label, index) => <li key={label} aria-current={index === progressIndex ? "step" : undefined} className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 font-semibold ${index === progressIndex ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}>{label}</span>{index < 3 && <span aria-hidden="true" className="text-slate-300">→</span>}</li>)}</ol><span className={`rounded-full px-2 py-1 font-semibold ${isFinal ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>현재 상태: {active.prescription_status} · {workflowStateLabel}</span></div>}
    {!actionable && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{waitingMessage ?? "현재 처방은 조회만 가능합니다."}</p>}
    {actionable && !requiresPrescription && <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">확정된 비약물 치료계획입니다. 약물 처방 없이 상단의 종료·의뢰 처리로 진행할 수 있습니다.</p>}
      {error && <p role="alert" className="shrink-0 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">{error}</p>}
      {visibleMessage && <p role="status" className="shrink-0 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">{visibleMessage}</p>}
      {prescriptions.length > 0 && <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-700">처방 선택<select aria-label="처방 선택" value={active?.id ?? ""} onChange={event => setSelectedPrescriptionId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2">{prescriptions.map(p => <option key={p.id} value={p.id}>{p.regimen_detail?.regimen_name ?? "Regimen"} · 주기 {p.cycle_number} · {p.prescription_status_label ?? p.prescription_status}</option>)}</select></label>}
      {active ? <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)] gap-3" key={active.id}>
        <section className="min-h-0 overflow-y-auto pr-1" aria-label="처방 약물 목록">
          <p className="text-sm font-semibold text-slate-800">선택 Regimen: {active.regimen_detail?.regimen_code ?? "-"} · {active.regimen_detail?.regimen_name ?? "정보 없음"}</p>
          <p className="mt-1 text-sm text-slate-500">{active.phase_label ?? "-"} · 투여 주기 {active.cycle_number} · {isFinal ? "약물·용량 조회 전용" : "약물 확인 후 최종 용량을 확인·조정해주세요."}</p>
          {active.items.map(item => <ItemRow key={item.id} item={item} editable={actionable && ["DRAFT", "VALIDATED"].includes(active.prescription_status)} working={working} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} onSave={body => updateItem(active.id, item.id, body)} />)}
          {!isFinal && <PatientSafetyDataPanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} compact onDataChanged={() => void load({ showLoading: false })} />}
          {active.prescription_status === "FINAL" && <MedicationSchedulePanel caseId={caseId} prescriptionId={active.id} items={active.items} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} />}
          {creationForm}
        </section>
        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label="안전성 검토 및 최종 확정">
          <h3 className="shrink-0 text-base font-semibold">Safety Check · {safetyLabel}</h3>
          {!isFinal && <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg bg-white p-2 text-[13px] text-slate-600"><span><b>Safety 입력:</b> 체격 · 신장/간기능 · 알레르기 · 현재 복용약</span><button type="button" onClick={() => focusSafetyInput()} className="shrink-0 rounded border border-blue-200 px-2 py-1 font-semibold text-blue-700">입력 확인</button></div>}
          {active.safety_check_results.some(r => r.result === "BLOCK") && <p role="alert" className="shrink-0 rounded-lg border border-rose-300 bg-rose-50 p-2 text-sm font-semibold text-rose-800">BLOCK 경고가 있습니다. 내용을 확인한 뒤 처방을 계속 진행할 수 있습니다.</p>}
          {safetyRecheckRequired ? <p role="alert" className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm font-semibold text-amber-800">환자 안전성 정보가 변경되어 재검사가 필요합니다.</p> : hasUnresolvedWarning ? <p role="alert" className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm font-semibold text-amber-800">미해결 WARNING · 경고 내용을 확인한 뒤 처방을 계속 진행할 수 있습니다.</p> : hasUnacknowledgedWarning && <p role="alert" className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm font-semibold text-amber-800">WARNING · 경고 내용을 확인한 뒤 처방을 계속 진행할 수 있습니다.</p>}
          <div className="min-h-0 max-h-40 shrink overflow-y-auto" aria-label="안전성 검사 상세">
            {active.safety_check_results.length === 0 && <p className="text-sm text-slate-500">{active.prescription_status === "DRAFT" ? "안전성 검사 대기" : "저장된 안전성 검사 상세 결과가 없습니다."}</p>}
            {active.safety_check_results.map(result => <div key={result.id} className={`border-b py-3 text-sm leading-6 ${result.result === "BLOCK" ? "border-rose-200 text-rose-800" : result.result === "WARNING" ? "border-amber-200 text-amber-800" : "border-slate-200 text-emerald-800"}`}><p className="font-semibold">{result.check_type_label} · {result.result_label ?? result.result}</p><p className="mt-1">{result.message}</p>{result.result === "WARNING" && result.acknowledged_at && <p className="mt-1">의료진 확인 완료{result.acknowledgment_note ? ` · ${result.acknowledgment_note}` : ""}</p>}{result.result === "WARNING" && ["LAB_MISSING", "ALLERGY_UNCONFIRMED", "DUR_MAPPING_UNRESOLVED"].includes(result.source_code ?? "") && <button type="button" onClick={() => focusSafetyInput(result.source_code, result.message)} className="mt-1 rounded border border-amber-300 px-2 py-1 font-semibold">부족한 입력 보완</button>}</div>)}
          </div>
          <p role="status" className="shrink-0 text-sm leading-5 text-slate-600">{finalGuidance}</p>
          {actionable && (active.prescription_status === "DRAFT" || (active.prescription_status === "VALIDATED" && safetyRecheckRequired)) && <button type="button" disabled={working} onClick={() => void safety(active.id)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${hasUnacknowledgedWarning && !hasBlock && !hasUnresolvedWarning && !safetyRecheckRequired ? "border border-slate-300 bg-white text-slate-700" : "bg-blue-600 text-white"}`}>{checkingSafety ? "Safety Check 검사 중..." : working ? "처리 중..." : safetyRecheckRequired ? "안전성 재검사" : active.safety_check_results.length ? "안전성 검사 다시 실행" : "안전성 검사 실행"}</button>}
          {actionable && active.prescription_status === "VALIDATED" && safetyIsCurrent && <div className="flex min-h-0 flex-1 flex-col"><PrescriptionFinalizeScheduleForm items={active.items} working={working} patientAccountLinked={active.patient_account_linked === true} onFinalize={async schedules => { setPendingFinalization({ id: active.id, schedules }); }} /></div>}
          {active.prescription_status === "FINAL" && <div className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 p-2"><p className="text-sm font-semibold text-emerald-700">최종 확정 완료 · 수정 불가</p><button type="button" onClick={() => { setSummaryPrescription(active); setSummaryOpen(true); }} className="mt-2 w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">최종 진료 요약 보기</button></div>}
        </aside>
      </div> : <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
        {actionable && requiresPrescription && hasSelectedRegimen && supportedPhases.length > 0
          ? <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <PatientSafetyDataPanel caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} compact />
              {creationForm}
            </div>
          : <div className="flex justify-center">{creationForm}</div>}
      </div>}
    {pendingFinalization && <ConfirmActionDialog title="처방 최종 확정" description="처방을 확정하시겠습니까? 확정 후에는 처방 내용을 수정할 수 없습니다." supportingText="선택한 치료요법과 용량을 다시 확인해 주세요." confirmLabel="처방 확정" tone="blue" onCancel={() => setPendingFinalization(null)} onConfirm={() => { const { id, schedules } = pendingFinalization; setPendingFinalization(null); void finalize(id, schedules); }} />}
    <FinalCareSummaryDialog open={summaryOpen} caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} doctorDisplayName={doctorDisplayName} prescription={summaryPrescription} onClose={closeSummary} />
  </section>;
}

function ItemRow({ item: rawItem, editable, working, apiBaseUrl, authorizedFetch, onSave }: { item: Item; editable: boolean; working: boolean; apiBaseUrl: string; authorizedFetch: AuthorizedFetch; onSave: (body: object) => Promise<boolean> }) {
  const item = { ...rawItem, calculated_dose: formatPrescriptionDose(rawItem.calculated_dose), final_dose: formatPrescriptionDose(rawItem.final_dose) };
  const [finalDose, setFinalDose] = useState(item.final_dose !== null ? String(item.final_dose) : ""); const [instructions, setInstructions] = useState(item.instructions ?? "");
  return <div className="mt-3 border-b border-slate-200 pb-3"><div className="grid items-baseline gap-x-4 gap-y-2 break-words text-sm leading-6 sm:grid-cols-2"><p className="font-semibold text-slate-700">{item.drug_name}<span className="ml-1 font-normal text-slate-500">{item.ingredient_name}</span></p><p className="text-slate-500">계산 용량: {item.calculated_dose ?? "-"}{item.unit ?? ""} · 최종 용량: {item.final_dose ?? "-"}{item.unit ?? ""} · 투여 경로: {item.route}</p></div>{item.instructions && <p className="mt-1 text-sm text-slate-600">투여 지시 · {item.instructions}</p>}{editable ? <MfdsProductSelector ingredientName={item.ingredient_name ?? item.drug_name} selectedItemSeq={item.mfds_item_seq} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} onSelect={async (mfdsItemSeq) => { await onSave({ mfds_item_seq: mfdsItemSeq }); }} /> : item.mfds_item_seq && <p className="mt-1 text-sm text-slate-500">ITEM_SEQ {item.mfds_item_seq}</p>}{editable && <div className="mt-3 grid gap-2 grid-cols-[90px_minmax(0,1fr)] [&>button]:col-span-2"><label className="text-sm text-slate-600">최종 용량<input type="number" min="0" value={finalDose} onChange={(e) => setFinalDose(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm" aria-label={`${item.drug_name} 최종 용량`} /></label><label className="text-sm text-slate-600">투여 지시<input value={instructions} onChange={(e) => setInstructions(e.target.value)} className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm" aria-label={`${item.drug_name} 투여 지시`} /></label><button type="button" disabled={working || finalDose === ""} onClick={() => void onSave({ final_dose: finalDose, instructions })} className="rounded border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50">수정 저장</button></div>}</div>;
}
