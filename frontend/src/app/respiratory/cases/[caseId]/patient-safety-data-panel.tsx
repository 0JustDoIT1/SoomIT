"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PrescriptionDateField } from "./prescription-date-field";
import { mfdsIngredient, useMfdsMedicationSearch } from "./use-mfds-medication-search";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Medication = {
  id: string;
  drug_name?: string | null;
  medication_name: string;
  ingredient_name?: string | null;
  mfds_item_seq?: string | null;
  dose?: string | number | null;
  dose_unit?: string | null;
  frequency?: string | null;
  route?: string | null;
  is_active: boolean;
};
type SafetyProfile = { allergy_status: "NONE" | "PRESENT" | "UNCONFIRMED"; allergies: string[]; height_cm?: string | number | null; weight_kg?: string | number | null };
type LabResult = {
  id: string;
  creatinine?: string | number | null;
  egfr?: string | number | null;
  ast?: string | number | null;
  alt?: string | number | null;
  total_bilirubin?: string | number | null;
  tested_at: string;
  note?: string | null;
};

const EMPTY_MEDICATION = { medication_name: "", ingredient_name: "", mfds_item_seq: "", dose: "", dose_unit: "", frequency: "", route: "" };
const EMPTY_LAB = { creatinine: "", egfr: "", ast: "", alt: "", total_bilirubin: "", tested_at: "", note: "" };
const DEMO_LAB = { ...EMPTY_LAB, creatinine: "0.9", egfr: "92", ast: "24", alt: "28", total_bilirubin: "0.8" };
const EMPTY_PROFILE: SafetyProfile = { allergy_status: "UNCONFIRMED", allergies: [], height_cm: "", weight_kg: "" };

function labToForm(lab: LabResult) {
  return {
    creatinine: String(lab.creatinine ?? ""),
    egfr: String(lab.egfr ?? ""),
    ast: String(lab.ast ?? ""),
    alt: String(lab.alt ?? ""),
    total_bilirubin: String(lab.total_bilirubin ?? ""),
    tested_at: lab.tested_at.slice(0, 10),
    note: lab.note ?? "",
  };
}

async function readProfileResponse(response: Response): Promise<SafetyProfile> {
  if (response.status === 404) {
    const data = await response.json().catch(() => null);
    if (data?.detail === "Patient health profile not found.") return { ...EMPTY_PROFILE };
    throw new Error(data?.detail || "환자 기본정보를 불러오지 못했습니다.");
  }
  await requireOk(response, "환자 기본정보를 불러오지 못했습니다.");
  return response.json() as Promise<SafetyProfile>;
}

export function PatientSafetyDataPanel({ caseId, apiBaseUrl, authorizedFetch, compact = false, onDataChanged, onReadinessChange }: { caseId: string; apiBaseUrl: string; authorizedFetch: AuthorizedFetch; compact?: boolean; onDataChanged?: () => void; onReadinessChange?: (ready: boolean) => void }) {
  const safetyDemo = process.env.NEXT_PUBLIC_SAFETY_DEMO === "true";
  const [medications, setMedications] = useState<Medication[]>([]);
  const [labs, setLabs] = useState<LabResult[]>([]);
  const [profile, setProfile] = useState<SafetyProfile>(EMPTY_PROFILE);
  const [savedProfile, setSavedProfile] = useState<SafetyProfile>(EMPTY_PROFILE);
  const [allergiesText, setAllergiesText] = useState("");
  const [profileError, setProfileError] = useState("");
  const [medicationError, setMedicationError] = useState("");
  const [labError, setLabError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"PROFILE" | "MEDICATION" | "LAB" | null>(null);
  const [medicationForm, setMedicationForm] = useState(EMPTY_MEDICATION);
  const [noMedications, setNoMedications] = useState(() => typeof window !== "undefined" && window.localStorage.getItem(`patient-safety-no-medications:${caseId}`) === "true");
  const { search: drugSearch, changeSearch: setDrugSearch, products: drugOptions, error: drugSearchError, loading: drugSearchLoading, query: drugQuery, settledQuery: drugSettledQuery } = useMfdsMedicationSearch(apiBaseUrl, authorizedFetch, !noMedications);
  const [selectedDrugSeq, setSelectedDrugSeq] = useState("");
  const [labForm, setLabForm] = useState(safetyDemo ? DEMO_LAB : EMPTY_LAB);
  const latestLab = labs[0] ?? null;
  const [addingLab, setAddingLab] = useState(false);
  const labLocked = Boolean(latestLab) && !addingLab;
  const safetyInputStatus = {
    body: Boolean(savedProfile.height_cm && savedProfile.weight_kg),
    renal: Boolean(latestLab?.creatinine || latestLab?.egfr),
    hepatic: Boolean(latestLab?.ast && latestLab?.alt && latestLab?.total_bilirubin),
    allergy: savedProfile.allergy_status !== "UNCONFIRMED",
    medication: noMedications || (medications.length > 0 && medications.every(item => Boolean(item.mfds_item_seq))),
  };
  const safetyReady = !loading && !profileError && !medicationError && !labError && Object.values(safetyInputStatus).every(Boolean);
  useEffect(() => { onReadinessChange?.(Boolean(safetyReady)); }, [onReadinessChange, safetyReady]);
  const setLabsAndForm = useCallback((next: LabResult[]) => {
    setLabs(next);
    setLabForm(next[0] ? labToForm(next[0]) : (safetyDemo ? { ...DEMO_LAB } : { ...EMPTY_LAB }));
  }, [safetyDemo]);
  const setMedicationsAndStatus = useCallback((next: Medication[]) => {
    setMedications(next);
    if (next.length > 0) {
      setNoMedications(false);
      window.localStorage.removeItem(`patient-safety-no-medications:${caseId}`);
    }
  }, [caseId]);

  const endpoint = useCallback((resource: "allergy-profile" | "current-medications" | "lab-results") => `${apiBaseUrl}/api/doctor/cases/${caseId}/${resource}/`, [apiBaseUrl, caseId]);

  const selectDrug = (itemSeq: string) => {
    const drug = drugOptions.find(option => option.item_seq === itemSeq);
    if (!drug) return;
    setSelectedDrugSeq(drug.item_seq);
    setMedicationForm(current => ({ ...current, medication_name: drug.item_name ?? "", ingredient_name: mfdsIngredient(drug), mfds_item_seq: drug.item_seq }));
  };
  const changeDrugSearch = (value: string) => {
    setDrugSearch(value);
    setSelectedDrugSeq("");
    setMedicationForm(current => ({ ...current, medication_name: "", ingredient_name: "", mfds_item_seq: "" }));
  };

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      authorizedFetch(endpoint("allergy-profile"), { signal: controller.signal }),
      authorizedFetch(endpoint("current-medications"), { signal: controller.signal }),
      authorizedFetch(endpoint("lab-results"), { signal: controller.signal }),
    ]).then(async ([profileResponse, medicationResponse, labResponse]) => {
      if (controller.signal.aborted) return;
      try {
        if (profileResponse.status === "rejected") throw profileResponse.reason;
        const next = await readProfileResponse(profileResponse.value);
        setProfile(next);
        setSavedProfile(next);
        setAllergiesText((next.allergies ?? []).join(", "));
      } catch (reason) { setProfileError(errorMessage(reason, "환자 기본정보를 불러오지 못했습니다.")); }
      await applyListResponse(medicationResponse, setMedicationsAndStatus, setMedicationError, "현재 복용약");
      await applyListResponse(labResponse, setLabsAndForm, setLabError, "검사실 결과");
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [authorizedFetch, endpoint, setLabsAndForm, setMedicationsAndStatus]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving("PROFILE"); setProfileError("");
    try {
      const allergies = profile.allergy_status === "PRESENT" ? allergiesText.split(",").map(value => value.trim()).filter(Boolean) : [];
      const response = await authorizedFetch(endpoint("allergy-profile"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(compactPayload({ ...profile, allergies })) });
      await requireOk(response, "환자 기본정보를 저장하지 못했습니다.");
      await response.json();
      const next = await readProfileResponse(await authorizedFetch(endpoint("allergy-profile")));
      setProfile(next); setSavedProfile(next); setAllergiesText((next.allergies ?? []).join(", "));
      onDataChanged?.();
    } catch (reason) { setProfileError(errorMessage(reason, "환자 기본정보를 저장하지 못했습니다.")); }
    finally { setSaving(null); }
  };

  const saveMedication = async (event: FormEvent) => {
    event.preventDefault();
    if (noMedications) return;
    if (!selectedDrugSeq || selectedDrugSeq !== medicationForm.mfds_item_seq || !medicationForm.medication_name.trim()) return;
    setSaving("MEDICATION");
    setMedicationError("");
    try {
      const response = await authorizedFetch(endpoint("current-medications"), jsonPost(compactPayload({ ...medicationForm, medication_name: medicationForm.medication_name.trim(), is_active: true })));
      await requireOk(response, "현재 복용약을 등록하지 못했습니다.");
      setMedicationForm(EMPTY_MEDICATION);
      setSelectedDrugSeq("");
      setDrugSearch("");
      await reloadOne(endpoint("current-medications"), authorizedFetch, setMedicationsAndStatus, setMedicationError, "현재 복용약");
      onDataChanged?.();
    } catch (reason) { setMedicationError(errorMessage(reason, "현재 복용약을 등록하지 못했습니다.")); }
    finally { setSaving(null); }
  };

  const toggleNoMedications = (checked: boolean) => {
    setNoMedications(checked);
    window.localStorage.setItem(`patient-safety-no-medications:${caseId}`, String(checked));
    if (checked) { setMedicationForm(EMPTY_MEDICATION); setSelectedDrugSeq(""); setDrugSearch(""); }
  };

  const saveLab = async (event: FormEvent) => {
    event.preventDefault();
    if (labLocked || saving !== null) return;
    if (!labForm.tested_at) return;
    const values = [labForm.creatinine, labForm.egfr, labForm.ast, labForm.alt, labForm.total_bilirubin].filter(value => value !== "");
    if (!values.length) { setLabError("검사 수치를 하나 이상 입력해 주세요."); return; }
    if (values.some(value => !Number.isFinite(Number(value)) || Number(value) < 0)) { setLabError("검사 수치는 0 이상의 숫자로 입력해 주세요."); return; }
    setSaving("LAB");
    setLabError("");
    try {
      const response = await authorizedFetch(endpoint("lab-results"), jsonPost(compactPayload({ ...labForm, tested_at: new Date(labForm.tested_at).toISOString() })));
      await requireOk(response, "검사실 결과를 등록하지 못했습니다.");
      setAddingLab(false);
      await reloadOne(endpoint("lab-results"), authorizedFetch, setLabsAndForm, setLabError, "검사실 결과");
      onDataChanged?.();
    } catch (reason) { setLabError(errorMessage(reason, "검사실 결과를 등록하지 못했습니다.")); }
    finally { setSaving(null); }
  };

  const labActions = latestLab && <div className="col-span-full text-xs text-slate-600">
    <button type="button" disabled={saving !== null || loading} className="rounded border border-blue-200 px-3 py-2 text-blue-700" onClick={() => {
      setLabError("");
      setAddingLab(!addingLab);
      setLabForm(addingLab ? labToForm(latestLab) : { ...EMPTY_LAB });
    }}>{addingLab ? "등록 취소" : "새 검사값 등록"}</button>
    {addingLab && <p className="mt-2">기존 기록은 보존됩니다. 이번 검사 날짜와 확인된 수치를 입력해 주세요. 누락값 보완 시 같은 검사의 기존 수치도 함께 입력해 주세요.</p>}
  </div>;

  if (compact) return (
    <section id="patient-safety-inputs" className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3 [&_input]:text-sm [&_label]:text-[13px] [&_select]:text-sm" aria-label="환자 안전성 정보">
      <div className="flex items-center justify-between gap-2"><div><h3 className="text-base font-bold text-slate-800">환자 안전성 정보</h3><p className="text-xs text-slate-600">저장된 값이 오른쪽 Safety Check에 사용됩니다.</p></div>{loading && <span className="text-xs text-slate-500">불러오는 중</span>}</div>
      {(profileError || medicationError || labError) && <p role="alert" className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-700">{profileError || medicationError || labError}</p>}

      <div className="mx-auto w-full max-w-5xl">
      <form onSubmit={saveProfile} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <p className="col-span-2 text-xs font-bold text-slate-700 sm:col-span-4">환자 기본정보 · 알레르기</p>
        <div id="safety-input-profile"><Input label="키 (cm)" type="number" value={String(profile.height_cm ?? "")} onChange={value => setProfile(current => ({ ...current, height_cm: value }))} /></div>
        <Input label="몸무게 (kg)" type="number" value={String(profile.weight_kg ?? "")} onChange={value => setProfile(current => ({ ...current, weight_kg: value }))} />
        <label id="safety-input-allergy" className="text-[10px] font-medium text-slate-600">알레르기 상태<select aria-label="알레르기 상태" value={profile.allergy_status} onChange={event => setProfile(current => ({ ...current, allergy_status: event.target.value as SafetyProfile["allergy_status"] }))} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="NONE">없음</option><option value="PRESENT">있음</option><option value="UNCONFIRMED">미확인</option></select></label>
        {profile.allergy_status === "PRESENT" ? <Input label="알레르기 약품/성분" value={allergiesText} onChange={setAllergiesText} /> : <span className="self-end pb-2 text-[11px] text-slate-500">{profile.allergy_status === "NONE" ? "알레르기 없음 확인" : "알레르기 확인 필요"}</span>}
        <button disabled={saving !== null || (profile.allergy_status === "PRESENT" && !allergiesText.trim())} className="col-span-2 rounded-md border border-blue-200 bg-white py-1.5 text-xs font-semibold text-blue-700 disabled:text-slate-400 sm:col-span-4">{saving === "PROFILE" ? "저장 중" : "기본정보·알레르기 저장"}</button>
      </form>

      <form onSubmit={saveLab} className="mt-3 grid grid-cols-2 gap-2 border-t border-blue-100 pt-3 sm:grid-cols-5">
        <p className="col-span-2 text-xs font-bold text-slate-700 sm:col-span-5">신장·간기능</p>
        {labActions}
        <fieldset disabled={labLocked} id="safety-input-renal" className="col-span-2 grid grid-cols-2 gap-2"><Input label="Creatinine" type="number" value={labForm.creatinine} onChange={value => setLabForm(current => ({ ...current, creatinine: value }))} /><Input label="eGFR" type="number" value={labForm.egfr} onChange={value => setLabForm(current => ({ ...current, egfr: value }))} /></fieldset>
        <fieldset disabled={labLocked} id="safety-input-hepatic" className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-3"><Input label="AST" type="number" value={labForm.ast} onChange={value => setLabForm(current => ({ ...current, ast: value }))} /><Input label="ALT" type="number" value={labForm.alt} onChange={value => setLabForm(current => ({ ...current, alt: value }))} /><Input label="Total Bilirubin" type="number" value={labForm.total_bilirubin} onChange={value => setLabForm(current => ({ ...current, total_bilirubin: value }))} /></fieldset>
        <PrescriptionDateField disabled={labLocked} required label="검사날짜" value={labForm.tested_at} onChange={value => setLabForm(current => ({ ...current, tested_at: value }))} className="col-span-2 sm:col-span-3" />
        <button disabled={saving !== null || labLocked || !labForm.tested_at} className="col-span-2 rounded-md border border-blue-200 bg-white py-1.5 text-xs font-semibold text-blue-700 disabled:text-slate-400">{saving === "LAB" ? "저장 중" : "검사값 저장"}</button>
        {labs[0] && <p className="col-span-2 text-[11px] text-slate-500 sm:col-span-5">최근 저장값 · {[labs[0].creatinine && `Cr ${labs[0].creatinine}`, labs[0].egfr && `eGFR ${labs[0].egfr}`, labs[0].ast && `AST ${labs[0].ast}`, labs[0].alt && `ALT ${labs[0].alt}`, labs[0].total_bilirubin && `Bilirubin ${labs[0].total_bilirubin}`].filter(Boolean).join(" · ") || "수치 없음"}</p>}
      </form>

      <form id="safety-input-medication" onSubmit={saveMedication} className="mt-3 grid grid-cols-1 gap-2 border-t border-blue-100 pt-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="col-span-full flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={noMedications} disabled={medications.length > 0} onChange={(event) => toggleNoMedications(event.target.checked)} />복용약 없음</label>
        <fieldset disabled={noMedications} className="col-span-full grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <p className="col-span-full text-xs font-bold text-slate-700">현재 복용약 · DUR</p>
        <label className="col-span-full text-[10px] font-medium text-slate-600">약품 검색<input disabled={noMedications} value={drugSearch} onChange={(event) => changeDrugSearch(event.target.value)} placeholder="약품명·성분명" className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs" /></label>
        <label className="text-[10px] font-medium text-slate-600">약품명<select required disabled={noMedications} value={selectedDrugSeq} onChange={(event) => selectDrug(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"><option value="">약품을 선택하세요</option>{drugOptions.map(option => <option key={option.item_seq} value={option.item_seq}>{option.item_name} · {mfdsIngredient(option)} · ITEM_SEQ {option.item_seq}</option>)}</select></label>
        {!noMedications && drugSearchError && <p role="status" className="col-span-full text-xs text-rose-600">{drugSearchError}</p>}
        {!noMedications && drugSettledQuery === drugQuery && drugQuery.length >= 2 && !drugSearchLoading && !drugSearchError && drugOptions.length === 0 && <p role="status" className="col-span-full text-xs text-slate-500">검색 결과 없음</p>}
        <Input label="성분명" value={medicationForm.ingredient_name} onChange={() => undefined} disabled />
        <Input label="MFDS ITEM_SEQ" value={medicationForm.mfds_item_seq} onChange={() => undefined} disabled />
        <details className="col-span-full text-[11px] text-slate-500"><summary className="cursor-pointer">용량·복용 주기·투여 경로 추가 입력</summary><div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3"><Input label="용량" type="number" value={medicationForm.dose} onChange={value => setMedicationForm(current => ({ ...current, dose: value }))} /><Input label="복용 주기" value={medicationForm.frequency} onChange={value => setMedicationForm(current => ({ ...current, frequency: value }))} /><Input label="투여 경로" value={medicationForm.route} onChange={value => setMedicationForm(current => ({ ...current, route: value }))} /></div></details>
        <button disabled={saving !== null || !selectedDrugSeq || !medicationForm.medication_name.trim()} className="col-span-full rounded-md border border-blue-200 bg-white py-1.5 text-xs font-semibold text-blue-700 disabled:text-slate-400">{saving === "MEDICATION" ? "등록 중" : "복용약 등록"}</button>
        </fieldset>
        {medications.length > 0 && <div className="col-span-full space-y-1.5" aria-label="저장된 복용약 목록">
          <p className="text-[11px] font-semibold text-slate-600">저장된 복용약</p>
          {medications.map(item => <CompactMedicationRow key={item.id} item={item} />)}
        </div>}
      </form>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-blue-100 pt-2 text-xs" aria-label="Safety 입력 상태"><DataStatus label="체격" ready={safetyInputStatus.body} /><DataStatus label="신장기능" ready={safetyInputStatus.renal} /><DataStatus label="간기능" ready={safetyInputStatus.hepatic} /><DataStatus label="알레르기" ready={safetyInputStatus.allergy} /><DataStatus label="복용약" ready={safetyInputStatus.medication} /></div>
      </div>
    </section>
  );

  return (
    <section className="grid min-h-0 grid-cols-2 gap-3" aria-label="처방 안전성 기초자료">
      <SafetyPanel title="환자 기본정보 · 알레르기" description="체격과 알레르기 확인 상태는 Safety Check의 환자 기초자료로 사용됩니다." error={profileError} onRetry={() => void authorizedFetch(endpoint("allergy-profile")).then(async response => { const next = await readProfileResponse(response); setProfile(next); setAllergiesText((next.allergies ?? []).join(", ")); setProfileError(""); }).catch(reason => setProfileError(errorMessage(reason, "환자 기본정보를 불러오지 못했습니다.")))}>
        <form onSubmit={saveProfile} className="grid grid-cols-2 gap-2 p-3">
          <Input label="키 (cm)" type="number" value={String(profile.height_cm ?? "")} onChange={value => setProfile(current => ({ ...current, height_cm: value }))} />
          <Input label="몸무게 (kg)" type="number" value={String(profile.weight_kg ?? "")} onChange={value => setProfile(current => ({ ...current, weight_kg: value }))} />
          <label className="col-span-2 text-[10px] font-medium text-slate-600">알레르기 상태<select aria-label="알레르기 상태" value={profile.allergy_status} onChange={event => setProfile(current => ({ ...current, allergy_status: event.target.value as SafetyProfile["allergy_status"] }))} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"><option value="NONE">알레르기 없음</option><option value="PRESENT">알레르기 있음</option><option value="UNCONFIRMED">미확인</option></select></label>
          {profile.allergy_status === "PRESENT" && <label className="col-span-2 text-[10px] font-medium text-slate-600">알레르기 약품/성분<input aria-label="알레르기 약품/성분" value={allergiesText} onChange={event => setAllergiesText(event.target.value)} placeholder="쉼표로 구분" className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs" /></label>}
          <button disabled={saving !== null || (profile.allergy_status === "PRESENT" && !allergiesText.trim())} className="col-span-2 rounded-md bg-blue-600 py-2 text-xs font-semibold text-white disabled:bg-slate-200">{saving === "PROFILE" ? "저장 중" : "기본정보 저장"}</button>
        </form>
      </SafetyPanel>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label="Safety 입력 상태"><h2 className="text-sm font-bold text-slate-900">Safety 입력 상태</h2><p className="mt-1 text-[11px] text-slate-500">값을 변경하면 기존 Safety 결과는 재검사가 필요합니다.</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><DataStatus label="키" ready={Boolean(profile.height_cm)} /><DataStatus label="몸무게" ready={Boolean(profile.weight_kg)} /><DataStatus label="신장기능" ready={Boolean(labs[0]?.creatinine || labs[0]?.egfr)} /><DataStatus label="간기능" ready={Boolean(labs[0]?.ast && labs[0]?.alt && labs[0]?.total_bilirubin)} /><DataStatus label="알레르기" ready={profile.allergy_status !== "UNCONFIRMED"} /><DataStatus label="현재 복용약" ready={noMedications || (medications.length > 0 && medications.every(item => Boolean(item.mfds_item_seq)))} /></div></section>
      <SafetyPanel title="현재 복용약" description="약물 중복과 상호작용 확인에 사용하는 실제 환자 복용약입니다." error={medicationError} onRetry={() => void reloadOne(endpoint("current-medications"), authorizedFetch, setMedicationsAndStatus, setMedicationError, "현재 복용약")}>
        <form onSubmit={saveMedication} className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3">
          <label className="col-span-2 flex items-center gap-2 text-xs font-medium text-slate-700"><input type="checkbox" checked={noMedications} disabled={medications.length > 0} onChange={(event) => toggleNoMedications(event.target.checked)} />복용약 없음</label>
          <fieldset disabled={noMedications} className="col-span-2 grid grid-cols-2 gap-2">
          <label className="col-span-2 text-[10px] font-medium text-slate-600">약품 검색<input disabled={noMedications} value={drugSearch} onChange={(event) => changeDrugSearch(event.target.value)} placeholder="약품명·성분명" className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs" /></label>
          <label className="col-span-2 text-[10px] font-medium text-slate-600">약품명<select required disabled={noMedications} value={selectedDrugSeq} onChange={(event) => selectDrug(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs"><option value="">약품을 선택하세요</option>{drugOptions.map(option => <option key={option.item_seq} value={option.item_seq}>{option.item_name} · {mfdsIngredient(option)} · ITEM_SEQ {option.item_seq}</option>)}</select></label>
          {!noMedications && drugSearchError && <p role="status" className="col-span-2 text-xs text-rose-600">{drugSearchError}</p>}
          {!noMedications && drugSettledQuery === drugQuery && drugQuery.length >= 2 && !drugSearchLoading && !drugSearchError && drugOptions.length === 0 && <p role="status" className="col-span-2 text-xs text-slate-500">검색 결과 없음</p>}
          <Input label="성분명" value={medicationForm.ingredient_name} onChange={() => undefined} disabled />
          <Input label="MFDS ITEM_SEQ" value={medicationForm.mfds_item_seq} onChange={() => undefined} disabled />
          <Input label="용량" type="number" value={medicationForm.dose} onChange={(value) => setMedicationForm((current) => ({ ...current, dose: value }))} />
          <Input label="단위" value={medicationForm.dose_unit} onChange={(value) => setMedicationForm((current) => ({ ...current, dose_unit: value }))} />
          <Input label="복용 주기" value={medicationForm.frequency} onChange={(value) => setMedicationForm((current) => ({ ...current, frequency: value }))} />
          <Input label="투여 경로" value={medicationForm.route} onChange={(value) => setMedicationForm((current) => ({ ...current, route: value }))} />
          <button disabled={saving !== null || !selectedDrugSeq || !medicationForm.medication_name.trim()} className="col-span-2 rounded-md bg-blue-600 py-2 text-xs font-semibold text-white disabled:bg-slate-200">{saving === "MEDICATION" ? "등록 중" : "복용약 등록"}</button>
          </fieldset>
        </form>
        <div className="max-h-72 overflow-y-auto p-3">{loading ? <Empty text="불러오는 중입니다." /> : medications.length ? medications.map((item) => <MedicationRow key={item.id} item={item} />) : <Empty text="등록된 현재 복용약이 없습니다." />}</div>
      </SafetyPanel>

      <SafetyPanel title="검사실 결과" description="처방 안전성 검사에서 사용하는 신장·간 기능 수치입니다." error={labError} onRetry={() => void reloadOne(endpoint("lab-results"), authorizedFetch, setLabsAndForm, setLabError, "검사실 결과")}>
        <form onSubmit={saveLab} className="grid grid-cols-3 gap-2 border-b border-slate-100 p-3">
          {labActions}
          <PrescriptionDateField disabled={labLocked} required label="검사날짜" value={labForm.tested_at} onChange={(value) => setLabForm((current) => ({ ...current, tested_at: value }))} className="col-span-3" />
          {(["creatinine", "egfr", "ast", "alt", "total_bilirubin"] as const).map((field) => <Input disabled={labLocked} key={field} label={{ creatinine: "Creatinine", egfr: "eGFR", ast: "AST", alt: "ALT", total_bilirubin: "총 빌리루빈" }[field]} type="number" value={labForm[field]} onChange={(value) => setLabForm((current) => ({ ...current, [field]: value }))} />)}
          <Input disabled={labLocked} label="메모" value={labForm.note} onChange={(value) => setLabForm((current) => ({ ...current, note: value }))} />
          <button disabled={saving !== null || labLocked || !labForm.tested_at} className="col-span-3 rounded-md bg-blue-600 py-2 text-xs font-semibold text-white disabled:bg-slate-200">{saving === "LAB" ? "등록 중" : "검사실 결과 등록"}</button>
        </form>
        <div className="max-h-72 overflow-y-auto p-3">{loading ? <Empty text="불러오는 중입니다." /> : labs.length ? labs.map((item) => <LabRow key={item.id} item={item} />) : <Empty text="등록된 검사실 결과가 없습니다." />}</div>
      </SafetyPanel>
    </section>
  );
}

function SafetyPanel({ title, description, error, onRetry, children }: { title: string; description: string; error: string; onRetry: () => void; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">{title}</h2><p className="mt-1 text-[11px] text-slate-500">{description}</p></header>{error && <div role="alert" className="flex items-center justify-between bg-rose-50 px-3 py-2 text-xs text-rose-700"><span>{error}</span><button type="button" onClick={onRetry} className="rounded border border-rose-200 bg-white px-2 py-1 font-semibold">다시 시도</button></div>}{children}</section>;
}
function Input({ label, value, onChange, type = "text", required = false, disabled = false, className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; disabled?: boolean; className?: string }) { return <label className={`text-[10px] font-medium text-slate-600 ${className}`}>{label}<input disabled={disabled} required={required} type={type} step={type === "number" ? "any" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs disabled:bg-slate-50 disabled:text-slate-700 disabled:opacity-100" /></label>; }
function MedicationRow({ item }: { item: Medication }) { return <div className="mb-2 rounded-md bg-slate-50 p-3 text-xs"><div className="flex justify-between gap-2"><strong>{item.drug_name || item.medication_name}</strong><span className={item.is_active ? "text-emerald-700" : "text-slate-400"}>{item.is_active ? "복용 중" : "복용 종료"}</span></div><p className="mt-1 text-slate-500">{[item.ingredient_name, item.mfds_item_seq && `ITEM_SEQ ${item.mfds_item_seq}`, item.dose && `${item.dose}${item.dose_unit || ""}`, item.frequency, item.route].filter(Boolean).join(" · ") || "상세 복용 정보 없음"}</p>{!item.mfds_item_seq && <p className="mt-1 font-semibold text-amber-700">DUR 확인을 위해 MFDS ITEM_SEQ 입력이 필요합니다.</p>}</div>; }
function CompactMedicationRow({ item }: { item: Medication }) {
  const details = [
    item.ingredient_name,
    item.mfds_item_seq && `ITEM_SEQ ${item.mfds_item_seq}`,
    item.dose !== null && item.dose !== undefined && item.dose !== "" ? `${item.dose}${item.dose_unit || ""}` : null,
    item.frequency,
    item.route,
  ].filter(Boolean).join(" · ");
  return <article className="rounded-md border border-emerald-100 bg-white px-2.5 py-1.5 text-xs leading-5">
    <div className="flex min-w-0 items-center justify-between gap-2"><strong className="truncate text-slate-800">{item.medication_name}</strong><span className="shrink-0 text-[10px] font-medium text-emerald-700">{item.is_active ? "저장됨 · 복용 중" : "저장됨 · 복용 종료"}</span></div>
    <p className="break-words text-slate-600">{details || "상세 복용 정보 없음"}</p>
  </article>;
}
function LabRow({ item }: { item: LabResult }) { return <div className="mb-2 rounded-md bg-slate-50 p-3 text-xs"><div className="flex justify-between gap-2"><strong>{new Date(item.tested_at).toLocaleString("ko-KR")}</strong><span className="text-slate-400">검사 결과</span></div><p className="mt-1 text-slate-600">{[["Cr", item.creatinine], ["eGFR", item.egfr], ["AST", item.ast], ["ALT", item.alt], ["빌리루빈", item.total_bilirubin]].filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => `${label} ${value}`).join(" · ") || "등록된 수치 없음"}</p>{item.note && <p className="mt-1 text-slate-400">{item.note}</p>}</div>; }
function Empty({ text }: { text: string }) { return <p className="py-8 text-center text-xs text-slate-400">{text}</p>; }
function DataStatus({ label, ready }: { label: string; ready: boolean }) { return <span><b>{label}:</b> <span className={ready ? "text-emerald-700" : "text-amber-700"}>{ready ? "입력됨" : "확인 필요"}</span></span>; }
function jsonPost(body: Record<string, unknown>): RequestInit { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }
function compactPayload(source: Record<string, unknown>) { return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== "")); }
async function requireOk(response: Response, fallback: string) { if (response.ok) return; const data = await response.json().catch(() => ({})); throw new Error(typeof data.detail === "string" ? data.detail : fallback); }
function errorMessage(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
async function reloadOne<T>(url: string, authorizedFetch: AuthorizedFetch, setter: (items: T[]) => void, setError: (message: string) => void, label: string) { setError(""); try { const response = await authorizedFetch(url); await requireOk(response, `${label}을 불러오지 못했습니다.`); setter(normalizeList<T>(await response.json())); } catch (reason) { setError(errorMessage(reason, `${label}을 불러오지 못했습니다.`)); } }
async function applyListResponse<T>(settled: PromiseSettledResult<Response>, setter: (items: T[]) => void, setError: (message: string) => void, label: string) { setError(""); try { if (settled.status === "rejected") throw settled.reason; await requireOk(settled.value, `${label}을 불러오지 못했습니다.`); setter(normalizeList<T>(await settled.value.json())); } catch (reason) { setError(errorMessage(reason, `${label}을 불러오지 못했습니다.`)); } }
function normalizeList<T>(data: unknown): T[] { if (Array.isArray(data)) return data as T[]; if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) return (data as { results: T[] }).results; return []; }
