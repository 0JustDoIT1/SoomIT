"use client";

import { useMemo, useState } from "react";
import { mfdsIngredient, useMfdsMedicationSearch } from "../../cases/[caseId]/use-mfds-medication-search";
import { apiJson } from "./preview-api";
import type { AuthorizedFetch } from "../../cases/[caseId]/treatment-prescription-types";
import type { PreviewDoseInputs } from "./preview-prescription";
import type { Prescription, Safety } from "./preview-types";

const BLOCKED_CODES = new Set(["DUR_API_ERROR", "DUR_MAPPING_UNRESOLVED", "ALLERGY_UNCONFIRMED", "LAB_MISSING"]);
type Labs = { creatinine: string; egfr: string; ast: string; alt: string; total_bilirubin: string };
type CurrentMedication = { medication_name: string; ingredient_name: string; mfds_item_seq: string };

export function PreviewSafetyPanel({ caseId, base, fetcher, prescription, doseInputs, onRefresh }: { caseId: string; base: string; fetcher: AuthorizedFetch; prescription?: Prescription; doseInputs: PreviewDoseInputs; onRefresh: () => void }) {
  const [status, setStatus] = useState("UNCONFIRMED");
  const [allergies, setAllergies] = useState("");
  const [medications, setMedications] = useState<CurrentMedication[]>([]);
  const { search: drugSearch, changeSearch: setDrugSearch, products: drugOptions, error: drugSearchError, loading: drugSearchLoading, query: drugQuery, settledQuery: drugSettledQuery } = useMfdsMedicationSearch(base, fetcher);
  const [labs, setLabs] = useState<Labs>({ creatinine: "", egfr: "", ast: "", alt: "", total_bilirubin: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastCheckedSignature, setLastCheckedSignature] = useState<string | null>(null);

  const selectDrug = (itemSeq: string) => {
    const drug = drugOptions.find(option => option.item_seq === itemSeq);
    if (!drug) return;
    setMedications(current => [...current, { medication_name: drug.item_name ?? "", ingredient_name: mfdsIngredient(drug), mfds_item_seq: drug.item_seq }]);
    setDrugSearch("");
  };

  const safetyInput = useMemo(() => ({
    allergy_status: status,
    allergies: allergies.split(",").map(value => value.trim()).filter(Boolean),
    current_medications: medications,
    ...labs,
    egfr: labs.egfr || doseInputs.egfr,
  }), [allergies, doseInputs.egfr, labs, medications, status]);
  const signature = JSON.stringify({ safetyInput, items: prescription?.items.map(item => [item.id, item.final_dose, item.mfds_item_seq]) ?? [] });
  const results: Safety[] = prescription?.safety_check_results ?? [];
  const inputChanged = Boolean(
    results.length
    && prescription?.prescription_status !== "FINAL"
    && (
      prescription?.safety_freshness === "RECHECK_REQUIRED"
      || lastCheckedSignature === null
      || lastCheckedSignature !== signature
    )
  );
  const unresolved = results.some(result => result.result === "BLOCK" || BLOCKED_CODES.has(result.source_code ?? ""));
  const needsAck = results.some(result => result.result === "WARNING" && !result.acknowledged_at && !BLOCKED_CODES.has(result.source_code ?? ""));
  const completeFinalDose = Boolean(prescription?.items.length && prescription.items.every(item => item.final_dose != null));
  const canFinalize = Boolean(prescription?.prescription_status === "VALIDATED" && completeFinalDose && results.length && prescription.safety_freshness === "CURRENT" && !inputChanged);

  const run = async () => {
    if (!prescription) return;
    setBusy(true); setError("");
    try {
      await apiJson(fetcher, base, `/api/doctor/cases/${caseId}/prescriptions/${prescription.id}/preview-safety/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(safetyInput) });
      setLastCheckedSignature(signature);
      onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Safety Check 실패"); }
    finally { setBusy(false); }
  };
  const finalize = async () => {
    if (!prescription) return;
    setBusy(true); setError("");
    try { await apiJson(fetcher, base, `/api/doctor/cases/${caseId}/prescriptions/${prescription.id}/preview-finalize/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ safety_input: safetyInput }) }); onRefresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "처방 확정 실패"); }
    finally { setBusy(false); }
  };
  const moveTo = (target: "renal" | "hepatic" | "allergy" | "medication") => {
    const element = document.getElementById(`preview-safety-${target}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.querySelector<HTMLElement>("input, textarea")?.focus();
  };

  if (!prescription) return <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-base font-bold">Safety Check</h2><p className="mt-2 text-sm text-slate-500">처방을 생성하면 안전성 입력을 확인할 수 있습니다.</p></section>;
  const renalReady = Boolean(labs.creatinine || labs.egfr || doseInputs.egfr);
  const hepaticReady = Boolean(labs.ast && labs.alt && labs.total_bilirubin);
  const allergyReady = status === "NONE" || (status === "PRESENT" && Boolean(allergies.trim()));
  const medicationReady = safetyInput.current_medications.length > 0 && safetyInput.current_medications.every(item => item.medication_name && item.ingredient_name && item.mfds_item_seq);

  const safetyHeading = results.some(result => result.result === "BLOCK") ? "BLOCK · 경고" : results.some(result => result.result === "WARNING") ? "WARNING · 경고" : results.length ? "Safety 통과" : "미실행";
  return <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-base font-bold">Safety Check · {safetyHeading}</h2><div className="mt-3 space-y-3">
    <div className="grid gap-3 lg:grid-cols-2">
      <fieldset id="preview-safety-renal" className="rounded-lg border border-slate-200 p-3"><legend className="px-1 text-xs font-bold">신장기능</legend><p className="mb-2 text-[11px] text-slate-500">Creatinine 또는 eGFR 중 하나를 입력해주세요.</p><div className="grid grid-cols-2 gap-2"><NumberInput label="Creatinine" value={labs.creatinine} onChange={value => setLabs(current => ({ ...current, creatinine: value }))} /><NumberInput label="eGFR" value={labs.egfr || doseInputs.egfr} onChange={value => setLabs(current => ({ ...current, egfr: value }))} /></div></fieldset>
      <fieldset id="preview-safety-hepatic" className="rounded-lg border border-slate-200 p-3"><legend className="px-1 text-xs font-bold">간기능</legend><p className="mb-2 text-[11px] text-slate-500">AST, ALT, Total Bilirubin을 모두 확인해주세요.</p><div className="grid grid-cols-3 gap-2"><NumberInput label="AST" value={labs.ast} onChange={value => setLabs(current => ({ ...current, ast: value }))} /><NumberInput label="ALT" value={labs.alt} onChange={value => setLabs(current => ({ ...current, alt: value }))} /><NumberInput label="Total Bilirubin" value={labs.total_bilirubin} onChange={value => setLabs(current => ({ ...current, total_bilirubin: value }))} /></div></fieldset>
    </div>
    <fieldset className="rounded-lg border border-slate-200 p-3"><legend className="px-1 text-xs font-bold">DUR / 안전성 확인</legend><div className="grid gap-3 lg:grid-cols-2">
      <div id="preview-safety-allergy"><p className="text-xs font-semibold">알레르기</p><div className="mt-1 flex flex-wrap gap-3 text-sm">{[["NONE", "알레르기 없음"], ["PRESENT", "알레르기 있음"], ["UNCONFIRMED", "미확인"]].map(([value, label]) => <label key={value}><input type="radio" checked={status === value} onChange={() => setStatus(value)} /> {label}</label>)}</div>{status === "PRESENT" && <input value={allergies} onChange={event => setAllergies(event.target.value)} placeholder="알레르기 약품/성분 (쉼표 구분)" className="mt-2 w-full rounded border p-2 text-sm" />}</div>
      <div id="preview-safety-medication" className="text-xs font-semibold">현재 복용약
        <label className="mt-1 block font-normal">약품 검색<input value={drugSearch} onChange={event => setDrugSearch(event.target.value)} placeholder="약품명·성분명" className="mt-1 w-full rounded border p-2 text-sm" /></label>
        <label className="mt-2 block font-normal">약품명<select value="" onChange={event => selectDrug(event.target.value)} className="mt-1 w-full rounded border p-2 text-sm"><option value="">약품을 선택하세요</option>{drugOptions.map(option => <option key={option.item_seq} value={option.item_seq}>{option.item_name} · {mfdsIngredient(option)} · ITEM_SEQ {option.item_seq}</option>)}</select></label>
        {drugSearchError && <p role="status" className="mt-1 font-normal text-rose-600">{drugSearchError}</p>}
        {drugSettledQuery === drugQuery && drugQuery.length >= 2 && !drugSearchLoading && !drugSearchError && drugOptions.length === 0 && <p role="status" className="mt-1 font-normal text-slate-500">검색 결과 없음</p>}
        {medications.map((item, index) => <div key={`${item.medication_name}-${item.mfds_item_seq}-${index}`} className="mt-2 flex items-center justify-between gap-2 rounded border p-2 font-normal"><span>{item.medication_name} · {item.ingredient_name} · ITEM_SEQ {item.mfds_item_seq || "없음"}</span><button type="button" onClick={() => setMedications(current => current.filter((_, itemIndex) => itemIndex !== index))} className="shrink-0 text-blue-700">제거</button></div>)}
      </div>
    </div></fieldset>
    <div className="rounded-lg bg-slate-50 px-3 py-2" aria-label="Safety 입력 상태"><p className="text-xs font-bold text-slate-700">Safety 입력 상태</p><div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-3"><Status label="키" ready={Boolean(doseInputs.height)} /><Status label="몸무게" ready={Boolean(doseInputs.weight)} /><Status label="신장기능" ready={renalReady} /><Status label="간기능" ready={hepaticReady} /><Status label="알레르기" ready={allergyReady} /><Status label="현재 복용약" ready={medicationReady} /></div></div>
    {inputChanged && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-800">입력값이 변경되어 Safety Check를 다시 실행해야 합니다.</p>}
    {(needsAck || unresolved) && !inputChanged && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-800">안전성 경고가 확인되었습니다. 내용을 검토한 후 처방을 계속 진행할 수 있습니다.</p>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void run()} className={`rounded px-4 py-2 text-sm font-semibold disabled:opacity-50 ${needsAck && !inputChanged && !unresolved ? "border border-slate-300 bg-white text-slate-700" : "bg-blue-600 text-white"}`}>{busy ? "처리 중..." : results.length ? "안전성 검사 다시 실행" : "처방 안전성 검사"}</button><button type="button" disabled={busy || !canFinalize} onClick={() => void finalize()} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300">처방 확정</button></div>
    {!canFinalize && <p className="text-xs text-amber-700">{!completeFinalDose ? "최종 처방량을 모두 입력해주세요." : inputChanged ? "변경된 입력값으로 Safety Check를 다시 실행해주세요." : !results.length ? "안전성 검사가 필요합니다." : "안전성 검사 결과를 확인해주세요."}</p>}
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {results.map((result, index) => <SafetyResult key={`${result.id}-${index}`} result={result} onMove={moveTo} />)}
  </div></section>;
}

function NumberInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs font-semibold">{label}<input aria-label={label} type="number" step="any" value={value} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded border p-2 font-normal" /></label>; }
function Status({ label, ready }: { label: string; ready: boolean }) { return <span><b>{label}:</b> <span className={ready ? "text-emerald-700" : "text-amber-700"}>{ready ? "입력됨" : "확인 필요"}</span></span>; }
function SafetyResult({ result, onMove }: { result: Safety; onMove: (target: "renal" | "hepatic" | "allergy" | "medication") => void }) {
  const target = result.source_code === "ALLERGY_UNCONFIRMED" ? "allergy" : result.source_code === "DUR_MAPPING_UNRESOLVED" ? "medication" : result.source_code === "LAB_MISSING" ? (result.message.includes("간기능") ? "hepatic" : "renal") : null;
  return <div className="rounded border p-3 text-sm"><b>{result.result}</b><p className="mt-1 text-xs">{result.message}</p><p className="text-[11px] text-slate-400">{result.source_code ?? "-"}</p>{target && <button type="button" onClick={() => onMove(target)} className="mt-2 rounded border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-800">{target === "renal" ? "신장기능 입력 보완" : target === "hepatic" ? "간기능 입력 보완" : target === "allergy" ? "알레르기 입력 보완" : "현재 복용약 입력 보완"}</button>}</div>;
}
