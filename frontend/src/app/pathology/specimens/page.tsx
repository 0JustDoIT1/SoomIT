"use client";

import { useEffect, useMemo, useState } from "react";

import { PathologyAuthPanel } from "../_components/pathology-auth-panel";
import { usePathologyAuth } from "../_components/pathology-auth-provider";
import {
  CASES_API_URL,
  caseSpecimensApiUrl,
  type PathologyCase,
  type PathologySpecimen,
  readCases,
  readSpecimens,
} from "../_lib/pathology-api";

const caseStatusLabel: Record<string, string> = {
  ACTIVE: "진행 중",
  COMPLETED: "완료",
  CLOSED: "종료",
  CANCELLED: "취소",
};

const specimenStatusLabel: Record<string, string> = {
  REGISTERED: "등록",
  RECEIVED: "접수",
  PROCESSING: "처리 중",
  READY: "분석 가능",
  INVALIDATED: "무효",
};

const specimenTypeLabel: Record<string, string> = {
  BIOPSY: "생검",
  RESECTION: "절제 검체",
  CYTOLOGY: "세포 검체",
  OTHER: "기타",
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default function PathologySpecimensPage() {
  const { authorizedFetch, isConnected, markConnected } = usePathologyAuth();
  const [cases, setCases] = useState<PathologyCase[]>([]);
  const [specimens, setSpecimens] = useState<PathologySpecimen[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedSpecimenId, setSelectedSpecimenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(isConnected);
  const [specimensLoading, setSpecimensLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isConnected) return;

    let cancelled = false;

    void authorizedFetch(CASES_API_URL)
      .then(readCases)
      .then(async (results) => {
        if (cancelled) return;
        setCases(results);

        const firstCase = results[0];
        setSelectedCaseId(firstCase?.id ?? null);

        if (!firstCase) {
          setSpecimens([]);
          return;
        }

        const response = await authorizedFetch(caseSpecimensApiUrl(firstCase.id));
        const specimenResults = await readSpecimens(response);
        if (cancelled) return;
        setSpecimens(specimenResults);
        setSelectedSpecimenId(specimenResults[0]?.id ?? null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "케이스·검체 정보를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected]);

  async function loadCases() {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(CASES_API_URL);
      const results = await readCases(response);
      const nextCaseId = results.some((item) => item.id === selectedCaseId)
        ? selectedCaseId
        : (results[0]?.id ?? null);

      setCases(results);
      setSelectedCaseId(nextCaseId);
      markConnected();

      if (nextCaseId) {
        await loadSpecimens(nextCaseId);
      } else {
        setSpecimens([]);
        setSelectedSpecimenId(null);
      }
    } catch (requestError) {
      setCases([]);
      setSpecimens([]);
      setSelectedCaseId(null);
      setSelectedSpecimenId(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "케이스·검체 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadSpecimens(caseId: string) {
    setSpecimensLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(caseSpecimensApiUrl(caseId));
      const results = await readSpecimens(response);
      setSpecimens(results);
      setSelectedSpecimenId(results[0]?.id ?? null);
    } catch (requestError) {
      setSpecimens([]);
      setSelectedSpecimenId(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "검체 정보를 불러오지 못했습니다.",
      );
    } finally {
      setSpecimensLoading(false);
    }
  }

  function selectCase(caseId: string) {
    setSelectedCaseId(caseId);
    void loadSpecimens(caseId);
  }

  const filteredCases = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return cases;

    return cases.filter(
      (item) =>
        item.case_code.toLowerCase().includes(keyword) ||
        item.patient_name.toLowerCase().includes(keyword) ||
        item.patient_code.toLowerCase().includes(keyword),
    );
  }, [cases, search]);

  const selectedCase =
    cases.find((item) => item.id === selectedCaseId) ?? null;
  const selectedSpecimen =
    specimens.find((item) => item.id === selectedSpecimenId) ?? null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">케이스·검체</h1>
          <p className="mt-2 text-sm text-slate-500">
            환자 Case를 선택해 등록된 병리 검체와 WSI 연결 현황을 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadCases}
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <PathologyAuthPanel loading={loading} onConnect={loadCases} />

      {error && (
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["조회 Case", cases.length],
          ["선택 Case 검체", specimens.length],
          ["분석 가능", specimens.filter((item) => item.status === "READY").length],
          ["연결 WSI", specimens.reduce((sum, item) => sum + item.wsi_count, 0)],
        ].map(([label, value]) => (
          <div key={label} className="border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Case 목록</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="환자명·환자번호·Case 검색"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
          </div>
          <div className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
            {filteredCases.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectCase(item.id)}
                className={`block w-full px-4 py-4 text-left hover:bg-slate-50 ${selectedCaseId === item.id ? "border-l-4 border-blue-600 bg-blue-50 pl-3" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.case_code}</p>
                  <span className="shrink-0 text-xs text-slate-500">{caseStatusLabel[item.case_status] ?? item.case_status}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{item.patient_name}</p>
                <p className="mt-1 text-xs text-slate-500">{item.patient_code}</p>
              </button>
            ))}
            {!loading && filteredCases.length === 0 && (
              <p className="px-4 py-12 text-center text-sm text-slate-500">표시할 Case가 없습니다.</p>
            )}
          </div>
        </section>

        <div className="min-w-0 space-y-5">
          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">선택 Case 정보</h2>
            </div>
            {selectedCase ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 lg:grid-cols-4">
                {[
                  ["환자", selectedCase.patient_name],
                  ["환자번호", selectedCase.patient_code],
                  ["Case", selectedCase.case_code],
                  ["현재 단계", selectedCase.current_stage],
                  ["Case 상태", caseStatusLabel[selectedCase.case_status] ?? selectedCase.case_status],
                  ["생성일", formatDate(selectedCase.created_at)],
                  ["최근 변경", formatDate(selectedCase.updated_at)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium text-slate-500">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="px-5 py-12 text-center text-sm text-slate-500">Case를 선택해 주세요.</p>
            )}
          </section>

          <section className="min-w-0 overflow-hidden border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">연결된 검체</h2>
                <p className="mt-1 text-xs text-slate-500">선택한 Case에 등록된 실제 검체 목록입니다.</p>
              </div>
              {specimensLoading && <span className="text-xs text-blue-700">불러오는 중...</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3">검체번호</th>
                    <th className="whitespace-nowrap px-4 py-3">검체 유형</th>
                    <th className="whitespace-nowrap px-4 py-3">채취 부위</th>
                    <th className="whitespace-nowrap px-4 py-3">상태</th>
                    <th className="whitespace-nowrap px-4 py-3">WSI</th>
                    <th className="whitespace-nowrap px-4 py-3">채취일</th>
                    <th className="whitespace-nowrap px-4 py-3">접수일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {specimens.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedSpecimenId(item.id)}
                      className={`cursor-pointer hover:bg-blue-50/60 ${selectedSpecimenId === item.id ? "bg-blue-50" : ""}`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{item.specimen_code}</td>
                      <td className="whitespace-nowrap px-4 py-3">{specimenTypeLabel[item.specimen_type] ?? item.specimen_type}</td>
                      <td className="whitespace-nowrap px-4 py-3">{item.body_site ?? "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3">{specimenStatusLabel[item.status] ?? item.status}</td>
                      <td className="whitespace-nowrap px-4 py-3">{item.wsi_count}건</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(item.collected_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(item.received_at)}</td>
                    </tr>
                  ))}
                  {!specimensLoading && specimens.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-500">
                        선택한 Case에 등록된 검체가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {selectedSpecimen && (
            <section className="border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">선택 검체 요약</h2>
              <dl className="mt-4 grid grid-cols-2 gap-5 md:grid-cols-4">
                {[
                  ["검체번호", selectedSpecimen.specimen_code],
                  ["검체 유형", specimenTypeLabel[selectedSpecimen.specimen_type] ?? selectedSpecimen.specimen_type],
                  ["상태", specimenStatusLabel[selectedSpecimen.status] ?? selectedSpecimen.status],
                  ["연결 WSI", `${selectedSpecimen.wsi_count}건`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
