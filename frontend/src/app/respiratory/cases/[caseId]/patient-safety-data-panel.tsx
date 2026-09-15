"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Medication = {
  id: string;
  drug_name?: string | null;
  medication_name: string;
  ingredient_name?: string | null;
  dose?: string | number | null;
  dose_unit?: string | null;
  frequency?: string | null;
  route?: string | null;
  is_active: boolean;
};
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

const EMPTY_MEDICATION = { medication_name: "", ingredient_name: "", dose: "", dose_unit: "", frequency: "", route: "" };
const EMPTY_LAB = { creatinine: "", egfr: "", ast: "", alt: "", total_bilirubin: "", tested_at: "", note: "" };

export function PatientSafetyDataPanel({ caseId, apiBaseUrl, authorizedFetch }: { caseId: string; apiBaseUrl: string; authorizedFetch: AuthorizedFetch }) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [labs, setLabs] = useState<LabResult[]>([]);
  const [medicationError, setMedicationError] = useState("");
  const [labError, setLabError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"MEDICATION" | "LAB" | null>(null);
  const [medicationForm, setMedicationForm] = useState(EMPTY_MEDICATION);
  const [labForm, setLabForm] = useState(EMPTY_LAB);

  const endpoint = useCallback((resource: "current-medications" | "lab-results") => `${apiBaseUrl}/api/doctor/cases/${caseId}/${resource}/`, [apiBaseUrl, caseId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      authorizedFetch(endpoint("current-medications"), { signal: controller.signal }),
      authorizedFetch(endpoint("lab-results"), { signal: controller.signal }),
    ]).then(async ([medicationResponse, labResponse]) => {
      if (controller.signal.aborted) return;
      await applyListResponse(medicationResponse, setMedications, setMedicationError, "현재 복용약");
      await applyListResponse(labResponse, setLabs, setLabError, "검사실 결과");
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [authorizedFetch, endpoint]);

  const saveMedication = async (event: FormEvent) => {
    event.preventDefault();
    if (!medicationForm.medication_name.trim()) return;
    setSaving("MEDICATION");
    setMedicationError("");
    try {
      const response = await authorizedFetch(endpoint("current-medications"), jsonPost(compactPayload({ ...medicationForm, medication_name: medicationForm.medication_name.trim(), is_active: true })));
      await requireOk(response, "현재 복용약을 등록하지 못했습니다.");
      setMedicationForm(EMPTY_MEDICATION);
      await reloadOne(endpoint("current-medications"), authorizedFetch, setMedications, setMedicationError, "현재 복용약");
    } catch (reason) { setMedicationError(errorMessage(reason, "현재 복용약을 등록하지 못했습니다.")); }
    finally { setSaving(null); }
  };

  const saveLab = async (event: FormEvent) => {
    event.preventDefault();
    if (!labForm.tested_at) return;
    setSaving("LAB");
    setLabError("");
    try {
      const response = await authorizedFetch(endpoint("lab-results"), jsonPost(compactPayload({ ...labForm, tested_at: new Date(labForm.tested_at).toISOString() })));
      await requireOk(response, "검사실 결과를 등록하지 못했습니다.");
      setLabForm(EMPTY_LAB);
      await reloadOne(endpoint("lab-results"), authorizedFetch, setLabs, setLabError, "검사실 결과");
    } catch (reason) { setLabError(errorMessage(reason, "검사실 결과를 등록하지 못했습니다.")); }
    finally { setSaving(null); }
  };

  return (
    <section className="grid min-h-0 grid-cols-2 gap-3" aria-label="처방 안전성 기초자료">
      <SafetyPanel title="현재 복용약" description="약물 중복과 상호작용 확인에 사용하는 실제 환자 복용약입니다." error={medicationError} onRetry={() => void reloadOne(endpoint("current-medications"), authorizedFetch, setMedications, setMedicationError, "현재 복용약")}>
        <form onSubmit={saveMedication} className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3">
          <Input required label="약품명" value={medicationForm.medication_name} onChange={(value) => setMedicationForm((current) => ({ ...current, medication_name: value }))} />
          <Input label="성분명" value={medicationForm.ingredient_name} onChange={(value) => setMedicationForm((current) => ({ ...current, ingredient_name: value }))} />
          <Input label="용량" type="number" value={medicationForm.dose} onChange={(value) => setMedicationForm((current) => ({ ...current, dose: value }))} />
          <Input label="단위" value={medicationForm.dose_unit} onChange={(value) => setMedicationForm((current) => ({ ...current, dose_unit: value }))} />
          <Input label="복용 주기" value={medicationForm.frequency} onChange={(value) => setMedicationForm((current) => ({ ...current, frequency: value }))} />
          <Input label="투여 경로" value={medicationForm.route} onChange={(value) => setMedicationForm((current) => ({ ...current, route: value }))} />
          <button disabled={saving !== null || !medicationForm.medication_name.trim()} className="col-span-2 rounded-md bg-blue-600 py-2 text-xs font-semibold text-white disabled:bg-slate-200">{saving === "MEDICATION" ? "등록 중" : "복용약 등록"}</button>
        </form>
        <div className="max-h-72 overflow-y-auto p-3">{loading ? <Empty text="불러오는 중입니다." /> : medications.length ? medications.map((item) => <MedicationRow key={item.id} item={item} />) : <Empty text="등록된 현재 복용약이 없습니다." />}</div>
      </SafetyPanel>

      <SafetyPanel title="검사실 결과" description="처방 안전성 검사에서 사용하는 신장·간 기능 수치입니다." error={labError} onRetry={() => void reloadOne(endpoint("lab-results"), authorizedFetch, setLabs, setLabError, "검사실 결과")}>
        <form onSubmit={saveLab} className="grid grid-cols-3 gap-2 border-b border-slate-100 p-3">
          <Input required label="검사 시각" type="datetime-local" value={labForm.tested_at} onChange={(value) => setLabForm((current) => ({ ...current, tested_at: value }))} className="col-span-3" />
          {(["creatinine", "egfr", "ast", "alt", "total_bilirubin"] as const).map((field) => <Input key={field} label={{ creatinine: "Creatinine", egfr: "eGFR", ast: "AST", alt: "ALT", total_bilirubin: "총 빌리루빈" }[field]} type="number" value={labForm[field]} onChange={(value) => setLabForm((current) => ({ ...current, [field]: value }))} />)}
          <Input label="메모" value={labForm.note} onChange={(value) => setLabForm((current) => ({ ...current, note: value }))} />
          <button disabled={saving !== null || !labForm.tested_at} className="col-span-3 rounded-md bg-blue-600 py-2 text-xs font-semibold text-white disabled:bg-slate-200">{saving === "LAB" ? "등록 중" : "검사실 결과 등록"}</button>
        </form>
        <div className="max-h-72 overflow-y-auto p-3">{loading ? <Empty text="불러오는 중입니다." /> : labs.length ? labs.map((item) => <LabRow key={item.id} item={item} />) : <Empty text="등록된 검사실 결과가 없습니다." />}</div>
      </SafetyPanel>
    </section>
  );
}

function SafetyPanel({ title, description, error, onRetry, children }: { title: string; description: string; error: string; onRetry: () => void; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><header className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">{title}</h2><p className="mt-1 text-[11px] text-slate-500">{description}</p></header>{error && <div role="alert" className="flex items-center justify-between bg-rose-50 px-3 py-2 text-xs text-rose-700"><span>{error}</span><button type="button" onClick={onRetry} className="rounded border border-rose-200 bg-white px-2 py-1 font-semibold">다시 시도</button></div>}{children}</section>;
}
function Input({ label, value, onChange, type = "text", required = false, className = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; className?: string }) { return <label className={`text-[10px] font-medium text-slate-600 ${className}`}>{label}<input required={required} type={type} step={type === "number" ? "any" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-xs" /></label>; }
function MedicationRow({ item }: { item: Medication }) { return <div className="mb-2 rounded-md bg-slate-50 p-3 text-xs"><div className="flex justify-between gap-2"><strong>{item.drug_name || item.medication_name}</strong><span className={item.is_active ? "text-emerald-700" : "text-slate-400"}>{item.is_active ? "복용 중" : "복용 종료"}</span></div><p className="mt-1 text-slate-500">{[item.ingredient_name, item.dose && `${item.dose}${item.dose_unit || ""}`, item.frequency, item.route].filter(Boolean).join(" · ") || "상세 복용 정보 없음"}</p></div>; }
function LabRow({ item }: { item: LabResult }) { return <div className="mb-2 rounded-md bg-slate-50 p-3 text-xs"><div className="flex justify-between gap-2"><strong>{new Date(item.tested_at).toLocaleString("ko-KR")}</strong><span className="text-slate-400">검사 결과</span></div><p className="mt-1 text-slate-600">{[["Cr", item.creatinine], ["eGFR", item.egfr], ["AST", item.ast], ["ALT", item.alt], ["빌리루빈", item.total_bilirubin]].filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => `${label} ${value}`).join(" · ") || "등록된 수치 없음"}</p>{item.note && <p className="mt-1 text-slate-400">{item.note}</p>}</div>; }
function Empty({ text }: { text: string }) { return <p className="py-8 text-center text-xs text-slate-400">{text}</p>; }
function jsonPost(body: Record<string, unknown>): RequestInit { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }
function compactPayload(source: Record<string, unknown>) { return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== "")); }
async function requireOk(response: Response, fallback: string) { if (response.ok) return; const data = await response.json().catch(() => ({})); throw new Error(typeof data.detail === "string" ? data.detail : fallback); }
function errorMessage(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
async function reloadOne<T>(url: string, authorizedFetch: AuthorizedFetch, setter: (items: T[]) => void, setError: (message: string) => void, label: string) { setError(""); try { const response = await authorizedFetch(url); await requireOk(response, `${label}을 불러오지 못했습니다.`); setter(normalizeList<T>(await response.json())); } catch (reason) { setError(errorMessage(reason, `${label}을 불러오지 못했습니다.`)); } }
async function applyListResponse<T>(settled: PromiseSettledResult<Response>, setter: (items: T[]) => void, setError: (message: string) => void, label: string) { setError(""); try { if (settled.status === "rejected") throw settled.reason; await requireOk(settled.value, `${label}을 불러오지 못했습니다.`); setter(normalizeList<T>(await settled.value.json())); } catch (reason) { setError(errorMessage(reason, `${label}을 불러오지 못했습니다.`)); } }
function normalizeList<T>(data: unknown): T[] { if (Array.isArray(data)) return data as T[]; if (data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)) return (data as { results: T[] }).results; return []; }
