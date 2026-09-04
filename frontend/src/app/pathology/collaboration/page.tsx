"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PathologyAuthPanel } from "../_components/pathology-auth-panel";
import { usePathologyAuth } from "../_components/pathology-auth-provider";
import {
  CASES_API_URL,
  type PathologyCase,
  readCases,
  readWorkItems,
  statusLabel,
  taskLabel,
  type WorkItem,
  WORK_ITEMS_API_URL,
} from "../_lib/pathology-api";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default function PathologyCollaborationPage() {
  const { authorizedFetch, isConnected, markConnected } = usePathologyAuth();
  const [cases, setCases] = useState<PathologyCase[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(isConnected);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    void Promise.all([
      authorizedFetch(CASES_API_URL).then(readCases),
      authorizedFetch(WORK_ITEMS_API_URL).then(readWorkItems),
    ])
      .then(([caseResults, itemResults]) => {
        if (cancelled) return;
        setCases(caseResults);
        setWorkItems(itemResults);
        setSelectedCaseId((current) => current ?? caseResults[0]?.id ?? null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "협업 Case 정보를 불러오지 못했습니다.",
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
      const [caseResults, itemResults] = await Promise.all([
        authorizedFetch(CASES_API_URL).then(readCases),
        authorizedFetch(WORK_ITEMS_API_URL).then(readWorkItems),
      ]);

      setCases(caseResults);
      setWorkItems(itemResults);
      setSelectedCaseId((current) =>
        caseResults.some((item) => item.id === current)
          ? current
          : (caseResults[0]?.id ?? null),
      );
      markConnected();
    } catch (requestError) {
      setCases([]);
      setWorkItems([]);
      setSelectedCaseId(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "협업 Case 정보를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
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
  const relatedWorkItems = workItems.filter(
    (item) => item.case_id === selectedCaseId,
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            케이스 협업
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Case별 병리 업무를 확인하고 의료진 협업 기록을 관리하는 화면입니다.
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
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
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
          <div className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
            {filteredCases.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedCaseId(item.id)}
                className={`block w-full px-4 py-4 text-left hover:bg-blue-50/60 ${selectedCaseId === item.id ? "border-l-4 border-blue-600 bg-blue-50 pl-3" : ""}`}
              >
                <p className="truncate text-sm font-semibold text-slate-900">{item.case_code}</p>
                <p className="mt-1 text-sm text-slate-700">{item.patient_name}</p>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{item.patient_code}</span>
                  <span>{item.current_stage}</span>
                </div>
              </button>
            ))}
            {!loading && filteredCases.length === 0 && (
              <p className="px-4 py-14 text-center text-sm text-slate-500">표시할 Case가 없습니다.</p>
            )}
          </div>
        </section>

        <div className="min-w-0 space-y-5">
          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Case 정보</h2>
            </div>
            {selectedCase ? (
              <dl className="grid grid-cols-2 gap-5 p-5 md:grid-cols-4">
                {[
                  ["환자", selectedCase.patient_name],
                  ["환자번호", selectedCase.patient_code],
                  ["Case", selectedCase.case_code],
                  ["현재 단계", selectedCase.current_stage],
                  ["Case 상태", selectedCase.case_status],
                  ["생성일", formatDate(selectedCase.created_at)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="px-5 py-12 text-center text-sm text-slate-500">Case를 선택해 주세요.</p>
            )}
          </section>

          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">협업 스레드</h2>
            </div>
            <div className="flex min-h-[360px] items-center justify-center px-6 text-center">
              <div>
                <p className="text-sm font-semibold text-slate-700">연결된 협업 기록이 없습니다.</p>
                <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">
                  협업 API가 준비되면 의료진 메시지, 요청 상태, 관련 WSI 및 첨부파일을 표시합니다.
                </p>
              </div>
            </div>
            <div className="border-t border-slate-200 bg-slate-50 p-4">
              <textarea
                disabled
                rows={3}
                placeholder="협업 메시지 API 연결 후 입력할 수 있습니다."
                className="w-full resize-none rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm placeholder:text-slate-400"
              />
              <button
                type="button"
                disabled
                className="mt-3 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white opacity-40"
              >
                메시지 보내기
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">연결된 병리 업무</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {relatedWorkItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/pathology/work-items/${encodeURIComponent(item.id)}`}
                  className="block px-5 py-4 hover:bg-slate-50"
                >
                  <p className="text-sm font-semibold text-slate-800">{taskLabel[item.task_type] ?? item.task_type}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {statusLabel[item.status] ?? item.status} · {item.assigned_to_name ?? "미배정"}
                  </p>
                </Link>
              ))}
              {!loading && relatedWorkItems.length === 0 && (
                <p className="px-5 py-10 text-center text-xs text-slate-500">연결된 병리 업무가 없습니다.</p>
              )}
            </div>
          </section>

          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">협업 참여자</h2>
            </div>
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-600">참여자 정보가 없습니다.</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">협업 참여자 API 연결 후 표시합니다.</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
