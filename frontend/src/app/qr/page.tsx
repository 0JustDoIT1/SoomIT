"use client";

import { useCallback, useEffect, useState } from "react";

import { API_BASE_URL } from "@/lib/api";

type PublicQrResult = {
  patient: {
    id: string;
    patient_code: string;
    name: string;
    birth_date: string;
    sex: string;
    hospital: { id: string; name: string };
  };
  questionnaire: {
    id: string;
    questionnaire_type: string;
    questionnaire_version: string;
    responses: Record<string, unknown>;
    is_completed: boolean;
    completed_at: string | null;
  } | null;
};

const questionnaireLabels: Array<[string, string]> = [
  ["현재 불편한 증상", "current_symptoms"],
  ["증상 시작 시점", "symptom_onset"],
  ["흡연 경험", "smoking_history"],
  ["호흡곤란", "dyspnea"],
  ["기침", "cough"],
  ["객혈", "hemoptysis"],
  ["기저질환 및 수술 이력", "past_history"],
  ["현재 복용 약", "current_medications"],
  ["알레르기", "allergies"],
];

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function PublicQrPage() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublicQrResult | null>(null);
  const questionnaire = result?.questionnaire ?? null;

  const resolveToken = useCallback(async (token: string) => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/patients/qr-token/public-resolve/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && typeof payload === "object" && "detail" in payload
          ? (payload as { detail?: unknown }).detail
          : null;
        throw new Error(typeof detail === "string" ? detail : "QR 정보를 불러오지 못했습니다.");
      }
      setResult(payload as PublicQrResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "QR 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setToken(new URLSearchParams(window.location.hash.slice(1)).get("token"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (token === undefined) return;
    if (!token) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    const timer = window.setTimeout(() => void resolveToken(token), 0);
    return () => window.clearTimeout(timer);
  }, [resolveToken, token]);

  const displayError = error || (token === null ? "유효한 QR 코드로 접속해주세요." : "");

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-teal-50 px-4 py-8 text-slate-800 sm:px-6">
      <section className="mx-auto max-w-xl">
        <header className="mb-6 text-center">
          <p className="text-sm font-semibold tracking-wide text-cyan-700">SOOM-IT</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">환자 QR 확인</h1>
        </header>

        {loading && (
          <section className="rounded-3xl border border-sky-100 bg-white p-8 text-center shadow-[0_16px_45px_rgba(14,116,144,0.10)]">
            <p className="text-sm font-medium text-slate-600">환자 정보를 확인하고 있습니다.</p>
          </section>
        )}

        {!loading && displayError && (
          <section className="rounded-3xl border border-rose-100 bg-white p-8 text-center shadow-[0_16px_45px_rgba(14,116,144,0.10)]">
            <p role="alert" className="text-sm font-medium text-rose-700">{displayError}</p>
          </section>
        )}

        {result && (
          <section className="space-y-4">
            <div className="rounded-3xl border border-sky-100 bg-white p-6 shadow-[0_16px_45px_rgba(14,116,144,0.10)]">
              <p className="text-xs font-bold tracking-wider text-cyan-700">PATIENT</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">{result.patient.name}</h2>
              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
                <div><dt className="text-slate-500">환자번호</dt><dd className="mt-1 font-semibold text-slate-800">{result.patient.patient_code}</dd></div>
                <div><dt className="text-slate-500">성별</dt><dd className="mt-1 font-semibold text-slate-800">{result.patient.sex}</dd></div>
                <div><dt className="text-slate-500">생년월일</dt><dd className="mt-1 font-semibold text-slate-800">{result.patient.birth_date}</dd></div>
                <div><dt className="text-slate-500">병원</dt><dd className="mt-1 font-semibold text-slate-800">{result.patient.hospital.name}</dd></div>
              </dl>
            </div>

            <div className="rounded-3xl border border-sky-100 bg-white p-6 shadow-[0_16px_45px_rgba(14,116,144,0.10)]">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-bold tracking-wider text-cyan-700">QUESTIONNAIRE</p><h2 className="mt-2 text-xl font-bold text-slate-950">진료 전 문진표</h2></div>
                {questionnaire && <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">제출 완료</span>}
              </div>
              {questionnaire ? (
                <div className="mt-5 space-y-4">
                  <p className="text-sm text-slate-500">제출일시: {formatDateTime(questionnaire.completed_at)}</p>
                  {questionnaireLabels.map(([label, key]) => (
                    <div key={key} className="border-t border-slate-100 pt-4">
                      <dt className="text-sm font-semibold text-slate-700">{label}</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{formatValue(questionnaire.responses[key])}</dd>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-5 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-600">제출된 문진표가 없습니다.</p>}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
