"use client";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE_URL } from "@/lib/api";

type PublicQrResult = {
  patient: {
    id: string;
    patient_code: string;
    name: string;
    birth_date: string;
    sex: string;
    hospital: {
      id: string;
      name: string;
    };
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
  ["기저질환·수술 이력", "past_history"],
  ["현재 복용 약", "current_medications"],
  ["약물·음식 알레르기", "allergies"],
];

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PublicQrPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanGenerationRef = useRef(0);
  const resolvingRef = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PublicQrResult | null>(null);
  const questionnaire = result?.questionnaire ?? null;

  const stopCamera = useCallback(() => {
    scanGenerationRef.current += 1;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setStartingCamera(false);
  }, []);

  const resolveToken = useCallback(async (token: string) => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/patients/qr-token/public-resolve/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
        },
      );
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const detail = payload && typeof payload === "object" && "detail" in payload
          ? (payload as { detail?: unknown }).detail
          : null;
        throw new Error(typeof detail === "string" ? detail : "QR 정보를 불러오지 못했습니다.");
      }

      setResult(payload as PublicQrResult);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "QR 정보를 불러오지 못했습니다.",
      );
    } finally {
      resolvingRef.current = false;
      setLoading(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setError("");
    setResult(null);
    resolvingRef.current = false;
    setStartingCamera(true);
    const generation = scanGenerationRef.current;

    try {
      const video = videoRef.current;
      if (!video) {
        setStartingCamera(false);
        return;
      }

      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: { facingMode: { ideal: "environment" } },
        },
        video,
        (scanResult, _scanError, scanControls) => {
          if (generation !== scanGenerationRef.current) {
            scanControls.stop();
            return;
          }

          scannerControlsRef.current = scanControls;
          const token = scanResult?.getText().trim();
          if (!token || resolvingRef.current) return;

          resolvingRef.current = true;
          stopCamera();
          void resolveToken(token);
        },
      );

      if (generation !== scanGenerationRef.current) {
        controls.stop();
        return;
      }

      scannerControlsRef.current = controls;
      setCameraActive(true);
      setStartingCamera(false);
    } catch {
      stopCamera();
      setError("카메라를 열 수 없습니다. 브라우저의 카메라 권한을 허용한 뒤 다시 시도해주세요.");
    }
  }, [resolveToken, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token || resolvingRef.current) return;

    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    resolvingRef.current = true;
    void resolveToken(token);
  }, [resolveToken]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-teal-50 px-4 py-8 text-slate-800 sm:px-6">
      <section className="mx-auto max-w-xl">
        <header className="mb-6 text-center">
          <p className="text-sm font-semibold tracking-wide text-cyan-700">SOOM-IT</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">환자 QR 확인</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">카메라로 환자 앱의 QR 코드를 스캔해주세요.</p>
        </header>

        {!result && (
          <section className="overflow-hidden rounded-3xl border border-sky-100 bg-white p-5 shadow-[0_16px_45px_rgba(14,116,144,0.10)]">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-950">
              <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
              {!cameraActive && !loading && !startingCamera && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-6 text-center text-white">
                  <span className="text-5xl" aria-hidden="true">▣</span>
                  <p className="mt-4 text-base font-semibold">QR 코드를 스캔하세요</p>
                  <p className="mt-1 text-sm text-slate-300">카메라 권한이 필요합니다.</p>
                </div>
              )}
              {cameraActive && <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,0.22)]" />}
              {(loading || startingCamera) && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-sm font-semibold text-white">{loading ? "환자 정보를 확인하고 있습니다…" : "카메라를 준비하고 있습니다…"}</div>}
            </div>

            {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={cameraActive || loading || startingCamera}
              className="mt-5 w-full rounded-xl bg-gradient-to-r from-blue-600 to-teal-500 px-4 py-3.5 text-base font-bold text-white shadow-sm transition hover:from-blue-700 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cameraActive ? "QR을 카메라에 비춰주세요" : "카메라로 QR 스캔"}
            </button>
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

            <button type="button" onClick={() => { setResult(null); setError(""); }} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base font-bold text-slate-700 transition hover:bg-slate-50">다른 환자 QR 스캔</button>
          </section>
        )}
      </section>
    </main>
  );
}
