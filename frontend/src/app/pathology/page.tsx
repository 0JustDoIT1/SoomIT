"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PathologyAuthPanel } from "./_components/pathology-auth-panel";
import { usePathologyAuth } from "./_components/pathology-auth-provider";
import {
  readWorkItems,
  statusLabel,
  statusStyle,
  taskLabel,
  type WorkItem,
  WORK_ITEMS_API_URL,
} from "./_lib/pathology-api";

type SummaryDefinition = {
  label: string;
  taskTypes: readonly string[];
  statuses: readonly string[];
  color: string;
};

const summaryDefinitions: readonly SummaryDefinition[] = [
  {
    label: "WSI 등록 대기",
    taskTypes: ["WSI_UPLOAD"],
    statuses: ["PENDING"],
    color: "text-teal-700",
  },
  {
    label: "품질검증 대기",
    taskTypes: ["QUALITY_CHECK"],
    statuses: ["PENDING"],
    color: "text-teal-700",
  },
  {
    label: "적정성 분석 대기",
    taskTypes: ["ADEQUACY_ANALYSIS"],
    statuses: ["PENDING"],
    color: "text-blue-700",
  },
  {
    label: "의사 판정 대기",
    taskTypes: ["ADEQUACY_REVIEW", "DIAGNOSTIC_REVIEW"],
    statuses: ["PENDING"],
    color: "text-slate-700",
  },
  {
    label: "AI 분석 중",
    taskTypes: ["PATHOLOGY_ANALYSIS", "AI_ANALYSIS"],
    statuses: ["IN_PROGRESS"],
    color: "text-blue-700",
  },
  {
    label: "처리 차단",
    taskTypes: [],
    statuses: ["BLOCKED", "FAILED"],
    color: "text-red-600",
  },
];

const workflow = [
  ["WSI_UPLOAD", "WSI 등록"],
  ["QUALITY_CHECK", "품질검증"],
  ["ADEQUACY_ANALYSIS", "적정성 AI"],
  ["ADEQUACY_REVIEW", "적정성 판정"],
  ["PATHOLOGY_ANALYSIS", "병리 AI"],
  ["DIAGNOSTIC_REVIEW", "병리 판독"],
  ["REPORT_REVIEW", "보고서 검토"],
] as const;

const priorityLabel: Record<string, string> = {
  NORMAL: "일반",
  REVIEW_REQUIRED: "검토 필요",
  CRITICAL: "중요",
  URGENT: "긴급",
  HIGH: "높음",
};

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function PathologyDashboardPage() {
  const { authorizedFetch, isConnected, markConnected } = usePathologyAuth();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isConnected);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isConnected) return;

    let cancelled = false;

    void authorizedFetch(WORK_ITEMS_API_URL)
      .then(readWorkItems)
      .then((results) => {
        if (cancelled) return;
        setItems(results);
        setSelectedId((current) => current ?? results[0]?.id ?? null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "병리 업무 현황을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected]);

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(WORK_ITEMS_API_URL);
      const results = await readWorkItems(response);

      setItems(results);
      setSelectedId((current) =>
        results.some((item) => item.id === current)
          ? current
          : (results[0]?.id ?? null),
      );
      markConnected();
    } catch (requestError) {
      setItems([]);
      setSelectedId(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "병리 업무 현황을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  const summaries = useMemo(
    () =>
      summaryDefinitions.map((definition) => ({
        ...definition,
        count: items.filter(
          (item) =>
            definition.statuses.includes(item.status) &&
            (definition.taskTypes.length === 0 ||
              definition.taskTypes.includes(item.task_type)),
        ).length,
      })),
    [items],
  );

  const selectedItem =
    items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const activeAnalyses = items.filter(
    (item) =>
      item.status === "IN_PROGRESS" &&
      ["ADEQUACY_ANALYSIS", "PATHOLOGY_ANALYSIS", "AI_ANALYSIS"].includes(
        item.task_type,
      ),
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            병리 업무 대시보드
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            병리 작업의 현재 대기 및 진행 상태를 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadDashboard}
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <PathologyAuthPanel loading={loading} onConnect={loadDashboard} />

      {error && (
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section aria-label="병리 업무 요약" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {summaries.map((summary) => (
          <div key={summary.label} className="border border-slate-200 bg-white px-4 py-4">
            <p className="text-xs font-medium text-slate-500">{summary.label}</p>
            <p className={`mt-2 text-2xl font-bold ${summary.color}`}>
              {summary.count}
              <span className="ml-1 text-sm font-medium text-slate-500">건</span>
            </p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.8fr)]">
        <section className="min-w-0 overflow-hidden border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">병리 업무 대기열</h2>
              <p className="mt-1 text-xs text-slate-500">API에서 조회된 전체 작업입니다.</p>
            </div>
            <Link href="/pathology/work-items" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
              전체 보기
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">우선순위</th>
                  <th className="whitespace-nowrap px-4 py-3">Case</th>
                  <th className="whitespace-nowrap px-4 py-3">환자</th>
                  <th className="whitespace-nowrap px-4 py-3">검체</th>
                  <th className="whitespace-nowrap px-4 py-3">현재 작업</th>
                  <th className="whitespace-nowrap px-4 py-3">상태</th>
                  <th className="whitespace-nowrap px-4 py-3">최근 변경</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.slice(0, 8).map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`cursor-pointer hover:bg-blue-50/60 ${selectedItem?.id === item.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                      {priorityLabel[item.priority] ?? item.priority}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{item.case_code}</td>
                    <td className="min-w-32 px-4 py-3">
                      <p className="font-medium text-slate-900">{item.patient_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.patient_code}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.specimen_code ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{taskLabel[item.task_type] ?? item.task_type}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>
                        {statusLabel[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatTime(item.updated_at)}</td>
                  </tr>
                ))}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-500">
                      API를 연결하면 병리 업무가 표시됩니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">선택 작업 정보</h2>
          </div>
          {selectedItem ? (
            <div className="p-5">
              <dl className="space-y-4 text-sm">
                {[
                  ["환자", `${selectedItem.patient_name} · ${selectedItem.patient_code}`],
                  ["Case", selectedItem.case_code],
                  ["검체", selectedItem.specimen_code ?? "-"],
                  ["WSI", selectedItem.slide_code ?? "-"],
                  ["현재 작업", taskLabel[selectedItem.task_type] ?? selectedItem.task_type],
                  ["담당자", selectedItem.assigned_to_name ?? "미배정"],
                ].map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[80px_1fr] gap-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="min-w-0 break-words font-medium text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
              <Link
                href={`/pathology/work-items/${encodeURIComponent(selectedItem.id)}`}
                className="mt-5 block rounded-md border border-blue-700 px-4 py-2.5 text-center text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                작업 상세 보기
              </Link>
            </div>
          ) : (
            <p className="px-5 py-14 text-center text-sm text-slate-500">선택된 작업이 없습니다.</p>
          )}
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">선택 작업 단계</h2>
          {selectedItem ? (
            <div className="mt-5 overflow-x-auto pb-2">
              <ol className="flex min-w-[720px] items-start">
                {workflow.map(([taskType, label], index) => {
                  const current = selectedItem.task_type === taskType;
                  return (
                    <li key={taskType} className="flex flex-1 items-start last:flex-none">
                      <div className="flex w-24 shrink-0 flex-col items-center text-center">
                        <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${current ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-400"}`}>
                          {index + 1}
                        </span>
                        <span className={`mt-2 text-xs ${current ? "font-semibold text-blue-700" : "text-slate-500"}`}>{label}</span>
                        {current && <span className="mt-1 text-[11px] text-slate-500">{statusLabel[selectedItem.status] ?? selectedItem.status}</span>}
                      </div>
                      {index < workflow.length - 1 && <span className="mt-4 h-px flex-1 bg-slate-200" />}
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">작업을 선택하면 현재 단계가 표시됩니다.</p>
          )}
        </section>

        <section className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">진행 중인 분석 작업</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {activeAnalyses.map((item) => (
              <Link key={item.id} href={`/pathology/work-items/${encodeURIComponent(item.id)}`} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{taskLabel[item.task_type] ?? item.task_type}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.case_code} · {item.patient_name}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-blue-700">진행 중</span>
              </Link>
            ))}
            {!loading && activeAnalyses.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-slate-500">현재 진행 중인 분석 작업이 없습니다.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
