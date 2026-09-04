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

export default function PathologyHandoffsPage() {
  const { authorizedFetch, isConnected, markConnected } = usePathologyAuth();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("OPEN");
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
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "인계 대상 업무를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected]);

  async function loadWorkItems() {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(WORK_ITEMS_API_URL);
      const results = await readWorkItems(response);
      setItems(results);
      setSelectedIds((current) =>
        current.filter((id) => results.some((item) => item.id === id)),
      );
      markConnected();
    } catch (requestError) {
      setItems([]);
      setSelectedIds([]);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "인계 대상 업무를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "OPEN"
          ? !["COMPLETED", "CANCELLED"].includes(item.status)
          : item.status === statusFilter);
      const matchesSearch =
        !keyword ||
        item.patient_name.toLowerCase().includes(keyword) ||
        item.patient_code.toLowerCase().includes(keyword) ||
        item.case_code.toLowerCase().includes(keyword) ||
        (item.specimen_code ?? "").toLowerCase().includes(keyword);

      return matchesStatus && matchesSearch;
    });
  }, [items, search, statusFilter]);

  const selectedItems = items.filter((item) => selectedIds.includes(item.id));

  function toggleItem(itemId: string) {
    setSelectedIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            업무 인계
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            인계할 병리 업무를 선택하고 전달 정보를 준비하는 화면입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadWorkItems}
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <PathologyAuthPanel loading={loading} onConnect={loadWorkItems} />

      {error && (
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["조회 업무", items.length],
          ["진행 중", items.filter((item) => item.status === "IN_PROGRESS").length],
          ["검토 필요", items.filter((item) => ["REVIEW_REQUIRED", "CRITICAL"].includes(item.priority)).length],
          ["선택 업무", selectedItems.length],
        ].map(([label, count]) => (
          <div key={label} className="border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{count}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_380px]">
        <section className="min-w-0 overflow-hidden border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="환자명·Case·검체 검색"
              className="min-w-64 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="OPEN">미완료 업무</option>
              <option value="ALL">전체 업무</option>
              <option value="PENDING">대기</option>
              <option value="IN_PROGRESS">진행 중</option>
              <option value="BLOCKED">차단</option>
              <option value="COMPLETED">완료</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <span className="sr-only">선택</span>
                  </th>
                  <th className="whitespace-nowrap px-4 py-3">우선순위</th>
                  <th className="whitespace-nowrap px-4 py-3">환자</th>
                  <th className="whitespace-nowrap px-4 py-3">Case</th>
                  <th className="whitespace-nowrap px-4 py-3">작업</th>
                  <th className="whitespace-nowrap px-4 py-3">담당자</th>
                  <th className="whitespace-nowrap px-4 py-3">상태</th>
                  <th className="whitespace-nowrap px-4 py-3">마감일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr key={item.id} className={selectedIds.includes(item.id) ? "bg-blue-50" : "hover:bg-slate-50"}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleItem(item.id)}
                        aria-label={`${item.patient_name} ${taskLabel[item.task_type] ?? item.task_type} 인계 선택`}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                      {priorityLabel[item.priority] ?? item.priority}
                    </td>
                    <td className="min-w-36 px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.patient_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.patient_code}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{item.case_code}</td>
                    <td className="whitespace-nowrap px-4 py-3">{taskLabel[item.task_type] ?? item.task_type}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.assigned_to_name ?? "미배정"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>
                        {statusLabel[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDateTime(item.due_at)}</td>
                  </tr>
                ))}
                {!loading && filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-500">인계 대상으로 표시할 병리 업무가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">인계 준비</h2>
            </div>
            <div className="p-5">
              <label className="block text-xs font-semibold text-slate-600">
                수신자
                <select disabled className="mt-2 block w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2.5 text-sm font-normal text-slate-400">
                  <option>수신자 API 연결 필요</option>
                </select>
              </label>

              <label className="mt-5 block text-xs font-semibold text-slate-600">
                인계 메모
                <textarea
                  disabled
                  rows={5}
                  placeholder="인계 API 연결 후 작성할 수 있습니다."
                  className="mt-2 block w-full resize-none rounded-md border border-slate-300 bg-slate-100 px-3 py-2.5 text-sm font-normal placeholder:text-slate-400"
                />
              </label>

              <button
                type="button"
                disabled
                className="mt-5 w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white opacity-40"
              >
                인계 확정
              </button>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                현재 선택 내용은 브라우저에 저장되지 않습니다. 인계 생성 API가 준비되면 확정 기능을 연결합니다.
              </p>
            </div>
          </section>

          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">선택한 업무</h2>
            </div>
            <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {selectedItems.map((item) => (
                <div key={item.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{taskLabel[item.task_type] ?? item.task_type}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{item.case_code} · {item.patient_name}</p>
                    </div>
                    <button type="button" onClick={() => toggleItem(item.id)} className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-800">제외</button>
                  </div>
                  <Link href={`/pathology/work-items/${encodeURIComponent(item.id)}`} className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:text-blue-900">작업 보기</Link>
                </div>
              ))}
              {selectedItems.length === 0 && (
                <p className="px-5 py-10 text-center text-xs text-slate-500">선택한 업무가 없습니다.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
