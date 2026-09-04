"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PathologyAuthPanel } from "../_components/pathology-auth-panel";
import { usePathologyAuth } from "../_components/pathology-auth-provider";
import {
  readWorkItems,
  statusLabel,
  statusStyle,
  taskLabel,
  type WorkItem,
  WORK_ITEMS_API_URL,
} from "../_lib/pathology-api";

const priorityLabel: Record<string, string> = {
  NORMAL: "일반",
  REVIEW_REQUIRED: "검토 필요",
  CRITICAL: "중요",
  URGENT: "긴급",
  HIGH: "높음",
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

function selectAiItems(results: WorkItem[]) {
  return results.filter((item) =>
    ["PATHOLOGY_ANALYSIS", "AI_ANALYSIS"].includes(item.task_type),
  );
}

export default function PathologyAiAnalysisPage() {
  const { authorizedFetch, isConnected, markConnected } = usePathologyAuth();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(isConnected);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    void authorizedFetch(WORK_ITEMS_API_URL)
      .then(readWorkItems)
      .then((results) => {
        if (cancelled) return;
        const aiItems = selectAiItems(results);
        setItems(aiItems);
        setSelectedId((current) => current ?? aiItems[0]?.id ?? null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "병리 AI 작업을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected]);

  async function loadAiItems() {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(WORK_ITEMS_API_URL);
      const aiItems = selectAiItems(await readWorkItems(response));
      setItems(aiItems);
      setSelectedId((current) =>
        aiItems.some((item) => item.id === current)
          ? current
          : (aiItems[0]?.id ?? null),
      );
      markConnected();
    } catch (requestError) {
      setItems([]);
      setSelectedId(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "병리 AI 작업을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesStatus =
        statusFilter === "ALL" || item.status === statusFilter;
      const matchesSearch =
        !keyword ||
        item.patient_name.toLowerCase().includes(keyword) ||
        item.patient_code.toLowerCase().includes(keyword) ||
        item.case_code.toLowerCase().includes(keyword) ||
        (item.specimen_code ?? "").toLowerCase().includes(keyword) ||
        (item.slide_code ?? "").toLowerCase().includes(keyword);

      return matchesStatus && matchesSearch;
    });
  }, [items, search, statusFilter]);

  const selectedItem =
    items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            병리 AI 작업 관리
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            병리 AI 분석 작업의 대기, 실행 및 처리 상태를 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAiItems}
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <PathologyAuthPanel loading={loading} onConnect={loadAiItems} />

      {error && (
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["전체", items.length, "text-slate-900"],
          ["실행 가능", items.filter((item) => item.status === "PENDING").length, "text-slate-700"],
          ["분석 중", items.filter((item) => item.status === "IN_PROGRESS").length, "text-blue-700"],
          ["완료", items.filter((item) => item.status === "COMPLETED").length, "text-emerald-700"],
          ["처리 필요", items.filter((item) => ["BLOCKED", "FAILED"].includes(item.status)).length, "text-red-700"],
        ].map(([label, count, color]) => (
          <div key={label} className="border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(350px,0.75fr)]">
        <section className="min-w-0 overflow-hidden border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="환자명·Case·검체·WSI 검색"
              className="min-w-64 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">전체 상태</option>
              <option value="PENDING">실행 가능</option>
              <option value="IN_PROGRESS">분석 중</option>
              <option value="BLOCKED">차단</option>
              <option value="COMPLETED">완료</option>
              <option value="CANCELLED">취소</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">우선순위</th>
                  <th className="whitespace-nowrap px-4 py-3">환자</th>
                  <th className="whitespace-nowrap px-4 py-3">Case</th>
                  <th className="whitespace-nowrap px-4 py-3">검체</th>
                  <th className="whitespace-nowrap px-4 py-3">WSI</th>
                  <th className="whitespace-nowrap px-4 py-3">담당자</th>
                  <th className="whitespace-nowrap px-4 py-3">상태</th>
                  <th className="whitespace-nowrap px-4 py-3">생성일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`cursor-pointer hover:bg-blue-50/60 ${selectedItem?.id === item.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                      {priorityLabel[item.priority] ?? item.priority}
                    </td>
                    <td className="min-w-36 px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.patient_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.patient_code}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{item.case_code}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.specimen_code ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.slide_code ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.assigned_to_name ?? "미배정"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>
                        {statusLabel[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {formatDateTime(item.created_at)}
                    </td>
                  </tr>
                ))}
                {!loading && filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-500">
                      병리 AI 작업이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-5">
          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">선택 Case</h2>
            </div>
            {selectedItem ? (
              <div className="p-5">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-900">{selectedItem.patient_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{selectedItem.patient_code}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(selectedItem.status)}`}>
                    {statusLabel[selectedItem.status] ?? selectedItem.status}
                  </span>
                </div>
                <dl className="space-y-4 text-sm">
                  {[
                    ["Case", selectedItem.case_code],
                    ["검체", selectedItem.specimen_code ?? "-"],
                    ["WSI", selectedItem.slide_code ?? "-"],
                    ["작업", taskLabel[selectedItem.task_type] ?? selectedItem.task_type],
                    ["담당자", selectedItem.assigned_to_name ?? "미배정"],
                    ["마감일", formatDateTime(selectedItem.due_at)],
                    ["완료일", formatDateTime(selectedItem.completed_at)],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[68px_1fr] gap-3">
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
              <p className="px-5 py-14 text-center text-sm text-slate-500">작업을 선택해 주세요.</p>
            )}
          </section>

          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">AI 실행 정보 및 결과</h2>
            </div>
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-700">연결된 모델 실행 정보가 없습니다.</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                모델 실행·진행률·결과 API가 준비되면 모델 버전, 실행 상태 및 분석 결과를 표시합니다.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
