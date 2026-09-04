"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

export default function PathologyWorkItemsPage() {
  const router = useRouter();
  const { authorizedFetch, markConnected } = usePathologyAuth();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");

  async function loadWorkItems() {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(WORK_ITEMS_API_URL);
      const results = await readWorkItems(response);

      setItems(results);
      markConnected();
    } catch (requestError) {
      setItems([]);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "작업목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  const counts = useMemo(
    () => ({
      total: items.length,
      pending: items.filter((item) => item.status === "PENDING").length,
      progress: items.filter((item) => item.status === "IN_PROGRESS").length,
      completed: items.filter((item) => item.status === "COMPLETED").length,
    }),
    [items],
  );

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesStatus = status === "ALL" || item.status === status;
      const matchesSearch =
        !keyword ||
        item.patient_name.toLowerCase().includes(keyword) ||
        item.patient_code.toLowerCase().includes(keyword) ||
        item.case_code.toLowerCase().includes(keyword) ||
        (item.specimen_code ?? "").toLowerCase().includes(keyword) ||
        (item.slide_code ?? "").toLowerCase().includes(keyword);

      return matchesStatus && matchesSearch;
    });
  }, [items, search, status]);

  function openDetail(itemId: string) {
    router.push(`/pathology/work-items/${encodeURIComponent(itemId)}`);
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">병리 작업목록</h2>
          <p className="mt-2 text-sm text-slate-500">
            검체 접수부터 WSI 분석 및 판독까지의 진행 상태를 확인합니다.
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

      <section className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          ["전체 작업", counts.total, "text-slate-900"],
          ["대기", counts.pending, "text-amber-600"],
          ["진행 중", counts.progress, "text-blue-700"],
          ["완료", counts.completed, "text-emerald-700"],
        ].map(([label, count, color]) => (
          <div
            key={String(label)}
            className="border border-slate-200 bg-white p-5"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className={`mt-2 text-3xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </section>

      <PathologyAuthPanel loading={loading} onConnect={loadWorkItems} />

      <section className="mt-6 overflow-hidden border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="환자명, 환자번호, Case, 검체번호 검색"
            className="min-w-64 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="ALL">전체 상태</option>
            <option value="PENDING">대기</option>
            <option value="IN_PROGRESS">진행 중</option>
            <option value="BLOCKED">차단</option>
            <option value="COMPLETED">완료</option>
            <option value="CANCELLED">취소</option>
          </select>
        </div>

        {error && (
          <div className="border-b border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-3">환자</th>
                <th className="whitespace-nowrap px-5 py-3">Case</th>
                <th className="whitespace-nowrap px-5 py-3">검체</th>
                <th className="whitespace-nowrap px-5 py-3">WSI</th>
                <th className="whitespace-nowrap px-5 py-3">작업 유형</th>
                <th className="whitespace-nowrap px-5 py-3">담당자</th>
                <th className="whitespace-nowrap px-5 py-3">상태</th>
                <th className="whitespace-nowrap px-5 py-3">우선순위</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`${item.patient_name} 병리 작업 상세 보기`}
                  onClick={() => openDetail(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openDetail(item.id);
                    }
                  }}
                  className="cursor-pointer hover:bg-blue-50/50 focus:bg-blue-50 focus:outline-none"
                >
                  <td className="min-w-40 px-5 py-4">
                    <p className="font-semibold text-slate-900">
                      {item.patient_name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.patient_code}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 font-medium">
                    {item.case_code}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {item.specimen_code ?? "미등록"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {item.slide_code ?? "미등록"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {taskLabel[item.task_type] ?? item.task_type}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {item.assigned_to_name ?? "미배정"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}
                    >
                      {statusLabel[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {priorityLabel[item.priority] ?? item.priority}
                  </td>
                </tr>
              ))}

              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-16 text-center text-slate-500"
                  >
                    {items.length === 0
                      ? "API를 연결하면 병리 작업목록이 표시됩니다."
                      : "검색 조건에 해당하는 작업이 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
