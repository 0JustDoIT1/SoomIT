"use client";

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { ko } from "react-day-picker/locale";
import { MfdsProductSelector } from "../../cases/[caseId]/mfds-product-selector";
import type { AuthorizedFetch } from "../../cases/[caseId]/treatment-prescription-types";
import { apiJson } from "./preview-api";
import type { Item, Prescription } from "./preview-types";

export type PreviewDoseInputs = { height: string; weight: string; egfr: string };

const phaseOptions = {
  INDUCTION: { label: "유도요법 · 초기 치료", description: "초기 치료 단계에서 사용하는 처방입니다." },
  MAINTENANCE: { label: "유지요법 · 초기 치료 후", description: "초기 치료 후 효과 유지를 위해 사용하는 처방입니다." },
  CONTINUOUS: { label: "지속요법 · 계속 투여", description: "정해진 종료 주기 없이 지속 투여하는 처방입니다." },
} as const;

type Props = { caseId: string; base: string; fetcher: AuthorizedFetch; prescriptions: Prescription[]; selectedRegimen: string | null; doseInputs: PreviewDoseInputs; onDoseInputsChange: (inputs: PreviewDoseInputs) => void; onRefresh: () => void };

export function PreviewPrescription({ caseId, base, fetcher, prescriptions, selectedRegimen, doseInputs, onDoseInputsChange, onRefresh }: Props) {
  const [phase, setPhase] = useState<keyof typeof phaseOptions>("INDUCTION");
  const [date, setDate] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [month, setMonth] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = prescriptions[0];

  const create = async () => {
    setBusy(true); setError("");
    try {
      await apiJson(fetcher, base, `/api/doctor/cases/${caseId}/preview-prescriptions/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycle_number: 1, phase, cycle_start_date: date, height_cm: doseInputs.height, weight_kg: doseInputs.weight, egfr: doseInputs.egfr }) });
      onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "처방 생성 실패"); }
    finally { setBusy(false); }
  };
  const patchItem = async (item: Item, body: Record<string, unknown>) => {
    if (!active) return;
    setBusy(true); setError("");
    try {
      await apiJson(fetcher, base, `/api/doctor/cases/${caseId}/prescriptions/${active.id}/items/${item.id}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "처방 항목 저장 실패"); }
    finally { setBusy(false); }
  };
  const editable = active && !["FINALIZED", "FINAL", "CANCELLED"].includes(active.prescription_status);
  const formatDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const setDoseInput = (field: keyof PreviewDoseInputs, value: string) => onDoseInputsChange({ ...doseInputs, [field]: value });

  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-base font-bold">06 · 처방정보 Dose / 최종 처방량</h2>
    {!active && <div className="mt-3 space-y-3">
      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-xs font-bold text-slate-700">환자 기본정보</legend>
        <p className="mb-2 text-[11px] text-slate-500">Preview V2에서 직접 입력한 값이 용량 계산에 사용됩니다.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <CompactNumber label="키 (cm)" value={doseInputs.height} onChange={value => setDoseInput("height", value)} />
          <CompactNumber label="몸무게 (kg)" value={doseInputs.weight} onChange={value => setDoseInput("weight", value)} />
          <CompactNumber label="eGFR (용량 계산용)" value={doseInputs.egfr} onChange={value => setDoseInput("egfr", value)} />
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold">치료 단계<select value={phase} onChange={event => setPhase(event.target.value as keyof typeof phaseOptions)} className="mt-1 block rounded border p-2 text-sm">{(Object.keys(phaseOptions) as Array<keyof typeof phaseOptions>).map(value => <option key={value} value={value}>{phaseOptions[value].label}</option>)}</select><span className="mt-1 block max-w-xs font-normal text-slate-500">{phaseOptions[phase].description}</span></label>
        <div className="relative z-30"><label className="text-xs font-semibold">처방 시작일</label><button type="button" aria-expanded={dateOpen} onClick={() => { setMonth(date ? new Date(`${date}T00:00:00`) : new Date()); setDateOpen(value => !value); }} className={`mt-1 block rounded border p-2 text-left text-sm font-normal ${date ? "" : "text-slate-400"}`}>{date || "처방 시작일 선택"}</button>{dateOpen && <div role="dialog" aria-label="처방 시작일 선택" className="absolute left-0 top-full z-40 mt-2 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"><DayPicker mode="single" month={month} onMonthChange={setMonth} selected={date ? new Date(`${date}T00:00:00`) : undefined} onSelect={value => { if (!value) return; setDate(formatDate(value)); setDateOpen(false); }} locale={ko} disabled={{ before: new Date() }} /></div>}</div>
        <button type="button" disabled={busy || !selectedRegimen || !date || !doseInputs.height || !doseInputs.weight} onClick={() => void create()} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:bg-slate-300">처방 생성</button>
      </div>
      {(!doseInputs.height || !doseInputs.weight) && <p className="text-xs text-amber-700">용량 계산을 위해 키와 몸무게를 입력해주세요.</p>}
    </div>}
    {error && <p role="alert" className="mt-2 text-sm text-rose-600">{error}</p>}
    {active && <div className="mt-3 space-y-3"><p className="text-sm">{active.regimen_detail?.regimen_code} · {active.phase} · cycle {active.cycle_number} · {active.prescription_status}</p>{active.items.map(item => <DoseItem key={`${item.id}-${item.final_dose}-${item.instructions}-${item.mfds_item_seq}`} item={item} editable={Boolean(editable)} busy={busy} base={base} fetcher={fetcher} onSave={body => void patchItem(item, body)} />)}</div>}
  </section>;
}

function CompactNumber({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs font-semibold text-slate-600">{label}<input aria-label={label} type="number" min="0" step="any" value={value} onChange={event => onChange(event.target.value)} className="mt-1 block h-9 w-full rounded border border-slate-200 px-2 font-normal" /></label>; }

function DoseItem({ item, editable, busy, base, fetcher, onSave }: { item: Item; editable: boolean; busy: boolean; base: string; fetcher: AuthorizedFetch; onSave: (body: Record<string, unknown>) => void }) {
  const [finalDose, setFinalDose] = useState(item.final_dose == null ? "" : String(item.final_dose));
  const [instructions, setInstructions] = useState(item.instructions ?? "");
  return <div className="rounded-lg border p-3 text-sm"><b>{item.drug_name}</b><div className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-3"><span>Standard dose: {item.standard_dose ?? "-"}</span><span>Dose basis: {item.dose_basis ?? "-"}</span><span>BSA: {item.patient_bsa ?? "-"}</span><span>Target AUC: {item.target_auc ?? "-"}</span><span>Renal value: {item.renal_value ?? "-"}</span><span>Calculated dose: {item.calculated_dose ?? "-"} {item.unit ?? ""}</span></div>{editable ? <MfdsProductSelector ingredientName={item.ingredient_name ?? item.drug_name} selectedItemSeq={item.mfds_item_seq} apiBaseUrl={base} authorizedFetch={fetcher} onSelect={async value => onSave({ mfds_item_seq: value })} /> : item.mfds_item_seq && <p className="mt-2 text-xs text-slate-500">ITEM_SEQ {item.mfds_item_seq}</p>}<div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-semibold">Final dose<input aria-label={`${item.drug_name} Final dose`} type="number" step="any" disabled={!editable || busy} value={finalDose} onChange={event => setFinalDose(event.target.value)} onBlur={() => { if (finalDose !== "" && finalDose !== String(item.final_dose ?? "")) onSave({ final_dose: finalDose }); }} className="mt-1 block w-full rounded border p-2 font-normal" /></label><label className="text-xs font-semibold">Instructions<textarea disabled={!editable || busy} value={instructions} onChange={event => setInstructions(event.target.value)} onBlur={() => { if (instructions !== (item.instructions ?? "")) onSave({ instructions }); }} className="mt-1 block w-full rounded border p-2 font-normal" rows={2} /></label></div></div>;
}
