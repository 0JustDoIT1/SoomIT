"use client";

import { useEffect, useState } from "react";

export type RecentPatient = { case_id: string; patient_name: string; birth_date: string | null };

export function useRecentPatients(key: string) {
  const [patients, setPatients] = useState<RecentPatient[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const data: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
        const seen = new Set<string>();
        const valid = Array.isArray(data) ? data.filter((p): p is RecentPatient => {
          if (!p || typeof p.case_id !== "string" || !p.case_id || typeof p.patient_name !== "string" ||
              !(p.birth_date === null || typeof p.birth_date === "string") || seen.has(p.case_id)) return false;
          seen.add(p.case_id);
          return true;
        }).slice(0, 12).map(({ case_id, patient_name, birth_date }) => ({ case_id, patient_name, birth_date })) : [];
        setPatients(valid);
      } catch { setPatients([]); }
    });
    return () => { cancelled = true; };
  }, [key]);
  function remember(patient: RecentPatient) {
    const entry = { case_id: patient.case_id, patient_name: patient.patient_name, birth_date: patient.birth_date ?? null };
    const next = [entry, ...patients.filter(p => p.case_id !== entry.case_id)].slice(0, 12);
    setPatients(next);
    try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* Keep in-memory selection usable. */ }
  }
  return { patients, remember };
}

export function RecentPatients({ patients, selectedId, onSelect, className }: {
  patients: RecentPatient[]; selectedId: string | null; onSelect: (patient: RecentPatient) => void; className?: string;
}) {
  return <aside aria-label="최근 본 환자" className={className ?? "w-[160px] shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"}>
    <h2 className="mb-3 text-sm font-bold text-slate-700">최근 본 환자</h2>
    {patients.length === 0 ? <p className="text-xs text-slate-400">최근 본 환자가 없습니다.</p> :
      <div className="space-y-1">{patients.map(patient => <button key={patient.case_id} type="button"
        aria-pressed={selectedId === patient.case_id} onClick={() => onSelect(patient)}
        className={`block w-full rounded-md border-l-2 px-2 py-2.5 text-left hover:bg-violet-50 ${selectedId === patient.case_id ? "border-violet-500 bg-violet-50" : "border-transparent"}`}>
        <span className="block truncate text-sm font-semibold text-slate-800">{patient.patient_name}</span>
        <span className="block text-xs text-slate-500">{patient.birth_date || "-"}</span>
      </button>)}</div>}
  </aside>;
}
