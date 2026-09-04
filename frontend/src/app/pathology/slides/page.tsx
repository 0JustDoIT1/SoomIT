"use client";

import { useEffect, useState } from "react";

import { PathologyAuthPanel } from "../_components/pathology-auth-panel";
import { usePathologyAuth } from "../_components/pathology-auth-provider";
import {
  CASES_API_URL,
  caseSpecimensApiUrl,
  type PathologyCase,
  type PathologySpecimen,
  readCases,
  readSlides,
  readSpecimens,
  specimenSlidesApiUrl,
  type WholeSlideImage,
} from "../_lib/pathology-api";

const specimenStatusLabel: Record<string, string> = {
  REGISTERED: "등록",
  RECEIVED: "접수",
  PROCESSING: "처리 중",
  READY: "분석 가능",
  INVALIDATED: "무효",
};

const imageStatusLabel: Record<string, string> = {
  UPLOADING: "업로드 중",
  READY: "사용 가능",
  FAILED: "처리 실패",
  INVALIDATED: "무효",
};

const stainLabel: Record<string, string> = {
  HE: "H&E",
  PDL1: "PD-L1",
  OTHER: "기타",
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function PathologySlidesPage() {
  const { authorizedFetch, isConnected, markConnected } = usePathologyAuth();
  const [cases, setCases] = useState<PathologyCase[]>([]);
  const [specimens, setSpecimens] = useState<PathologySpecimen[]>([]);
  const [slides, setSlides] = useState<WholeSlideImage[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<string | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isConnected);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    void authorizedFetch(CASES_API_URL)
      .then(readCases)
      .then(async (caseResults) => {
        if (cancelled) return;
        setCases(caseResults);
        const firstCase = caseResults[0];
        setSelectedCaseId(firstCase?.id ?? null);
        if (!firstCase) return;

        const specimenResponse = await authorizedFetch(
          caseSpecimensApiUrl(firstCase.id),
        );
        const specimenResults = await readSpecimens(specimenResponse);
        if (cancelled) return;
        setSpecimens(specimenResults);
        const firstSpecimen = specimenResults[0];
        setSelectedSpecimenId(firstSpecimen?.id ?? null);
        if (!firstSpecimen) return;

        const slideResponse = await authorizedFetch(
          specimenSlidesApiUrl(firstSpecimen.id),
        );
        const slideResults = await readSlides(slideResponse);
        if (cancelled) return;
        setSlides(slideResults);
        setSelectedSlideId(slideResults[0]?.id ?? null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "WSI 정보를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected]);

  async function loadInitialData() {
    setLoading(true);
    setError("");

    try {
      const caseResponse = await authorizedFetch(CASES_API_URL);
      const caseResults = await readCases(caseResponse);
      setCases(caseResults);
      markConnected();

      const firstCase = caseResults[0];
      setSelectedCaseId(firstCase?.id ?? null);
      if (firstCase) await selectCase(firstCase.id);
      else clearSpecimens();
    } catch (requestError) {
      setCases([]);
      setSelectedCaseId(null);
      clearSpecimens();
      setError(
        requestError instanceof Error
          ? requestError.message
          : "WSI 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  function clearSlides() {
    setSlides([]);
    setSelectedSlideId(null);
  }

  function clearSpecimens() {
    setSpecimens([]);
    setSelectedSpecimenId(null);
    clearSlides();
  }

  async function selectCase(caseId: string) {
    setSelectedCaseId(caseId);
    setContentLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(caseSpecimensApiUrl(caseId));
      const results = await readSpecimens(response);
      setSpecimens(results);
      const firstSpecimen = results[0];
      setSelectedSpecimenId(firstSpecimen?.id ?? null);
      if (firstSpecimen) await selectSpecimen(firstSpecimen.id);
      else clearSlides();
    } catch (requestError) {
      clearSpecimens();
      setError(
        requestError instanceof Error
          ? requestError.message
          : "검체 정보를 불러오지 못했습니다.",
      );
    } finally {
      setContentLoading(false);
    }
  }

  async function selectSpecimen(specimenId: string) {
    setSelectedSpecimenId(specimenId);
    setContentLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(specimenSlidesApiUrl(specimenId));
      const results = await readSlides(response);
      setSlides(results);
      setSelectedSlideId(results[0]?.id ?? null);
    } catch (requestError) {
      clearSlides();
      setError(
        requestError instanceof Error
          ? requestError.message
          : "WSI 목록을 불러오지 못했습니다.",
      );
    } finally {
      setContentLoading(false);
    }
  }

  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? null;
  const selectedSpecimen =
    specimens.find((item) => item.id === selectedSpecimenId) ?? null;
  const selectedSlide =
    slides.find((item) => item.id === selectedSlideId) ?? null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            WSI 등록 및 품질검증
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Case와 검체에 연결된 Whole Slide Image 및 처리 상태를 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadInitialData}
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <PathologyAuthPanel loading={loading} onConnect={loadInitialData} />

      {error && (
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 border border-slate-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
            Case 선택
            <select
              value={selectedCaseId ?? ""}
              onChange={(event) => void selectCase(event.target.value)}
              disabled={loading || cases.length === 0}
              className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 disabled:bg-slate-50"
            >
              <option value="">Case 없음</option>
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.case_code} · {item.patient_name} ({item.patient_code})
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-600">
            검체 선택
            <select
              value={selectedSpecimenId ?? ""}
              onChange={(event) => void selectSpecimen(event.target.value)}
              disabled={contentLoading || specimens.length === 0}
              className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 disabled:bg-slate-50"
            >
              <option value="">검체 없음</option>
              {specimens.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.specimen_code} · {specimenStatusLabel[item.status] ?? item.status}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,0.7fr)]">
        <section className="min-w-0 overflow-hidden border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">등록된 WSI</h2>
              <p className="mt-1 text-xs text-slate-500">
                {selectedSpecimen
                  ? `${selectedSpecimen.specimen_code} 검체의 슬라이드 목록`
                  : "검체를 선택해 주세요."}
              </p>
            </div>
            {contentLoading && <span className="text-xs text-blue-700">조회 중...</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">슬라이드 코드</th>
                  <th className="whitespace-nowrap px-4 py-3">파일명</th>
                  <th className="whitespace-nowrap px-4 py-3">염색</th>
                  <th className="whitespace-nowrap px-4 py-3">버전</th>
                  <th className="whitespace-nowrap px-4 py-3">파일 형식</th>
                  <th className="whitespace-nowrap px-4 py-3">MPP</th>
                  <th className="whitespace-nowrap px-4 py-3">상태</th>
                  <th className="whitespace-nowrap px-4 py-3">등록일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {slides.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedSlideId(item.id)}
                    className={`cursor-pointer hover:bg-blue-50/60 ${selectedSlideId === item.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                      {item.slide_code}
                    </td>
                    <td className="max-w-72 truncate px-4 py-3 text-slate-700" title={item.original_filename}>
                      {item.original_filename}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{stainLabel[item.stain] ?? item.stain}</td>
                    <td className="whitespace-nowrap px-4 py-3">v{item.version}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.file_format}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.mpp ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.image_status === "READY" && item.is_current ? "bg-emerald-50 text-emerald-700" : item.image_status === "FAILED" || !item.is_current ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                        {!item.is_current
                          ? "무효"
                          : (imageStatusLabel[item.image_status] ?? item.image_status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {formatDateTime(item.created_at)}
                    </td>
                  </tr>
                ))}
                {!contentLoading && slides.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-500">
                      선택한 검체에 등록된 WSI가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">WSI 상세 정보</h2>
          </div>
          {selectedSlide ? (
            <div className="p-5">
              <dl className="space-y-4 text-sm">
                {[
                  ["환자", selectedCase ? `${selectedCase.patient_name} · ${selectedCase.patient_code}` : "-"],
                  ["Case", selectedCase?.case_code ?? "-"],
                  ["검체", selectedSpecimen?.specimen_code ?? "-"],
                  ["슬라이드", selectedSlide.slide_code],
                  ["블록", selectedSlide.block_code ?? "-"],
                  ["원본 파일", selectedSlide.original_filename],
                  ["염색", stainLabel[selectedSlide.stain] ?? selectedSlide.stain],
                  ["MPP", selectedSlide.mpp ?? "-"],
                  ["등록일", formatDateTime(selectedSlide.created_at)],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[76px_1fr] gap-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="min-w-0 break-words font-medium text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>

              {!selectedSlide.is_current && selectedSlide.invalidation_reason && (
                <div className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <p className="font-semibold">무효 처리 사유</p>
                  <p className="mt-1">{selectedSlide.invalidation_reason}</p>
                </div>
              )}

              <div className="mt-5 border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                현재 화면은 조회 전용입니다. WSI 업로드와 재등록은 쓰기 API가 준비된 후 연결합니다.
              </div>
            </div>
          ) : (
            <p className="px-5 py-16 text-center text-sm text-slate-500">WSI를 선택해 주세요.</p>
          )}
        </section>
      </div>
    </div>
  );
}
