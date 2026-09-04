"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PathologyAuthPanel } from "../_components/pathology-auth-panel";
import { usePathologyAuth } from "../_components/pathology-auth-provider";
import {
  readWorkItems,
  statusLabel,
  statusStyle,
  type WorkItem,
  WORK_ITEMS_API_URL,
} from "../_lib/pathology-api";

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

function selectReportItems(results: WorkItem[]) {
  return results.filter((item) => item.task_type === "REPORT_REVIEW");
}

export default function PathologyReportsPage() {
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
        const reportItems = selectReportItems(results);
        setItems(reportItems);
        setSelectedId((current) => current ?? reportItems[0]?.id ?? null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "병리 보고서 작업을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected]);

  async function loadReportItems() {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(WORK_ITEMS_API_URL);
      const reportItems = selectReportItems(await readWorkItems(response));
      setItems(reportItems);
      setSelectedId((current) =>
        reportItems.some((item) => item.id === current)
          ? current
          : (reportItems[0]?.id ?? null),
      );
      markConnected();
    } catch (requestError) {
      setItems([]);
      setSelectedId(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "병리 보고서 작업을 불러오지 못했습니다.",
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
        (item.specimen_code ?? "").toLowerCase().includes(keyword);

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
            병리 보고서
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            병리 보고서 검토 작업과 발행 준비 상태를 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadReportItems}
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <PathologyAuthPanel loading={loading} onConnect={loadReportItems} />

      {error && (
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["전체", items.length, "text-slate-900"],
          ["작성·검토 대기", items.filter((item) => item.status === "PENDING").length, "text-amber-700"],
          ["검토 중", items.filter((item) => item.status === "IN_PROGRESS").length, "text-blue-700"],
          ["발행 준비", items.filter((item) => item.status === "COMPLETED").length, "text-emerald-700"],
          ["처리 필요", items.filter((item) => ["BLOCKED", "FAILED"].includes(item.status)).length, "text-red-700"],
        ].map(([label, count, color]) => (
          <div key={label} className="border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <section className="min-w-0 overflow-hidden border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="환자명·Case·검체 검색"
              className="min-w-56 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">전체 상태</option>
              <option value="PENDING">대기</option>
              <option value="IN_PROGRESS">검토 중</option>
              <option value="BLOCKED">차단</option>
              <option value="COMPLETED">완료</option>
              <option value="CANCELLED">취소</option>
            </select>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`block w-full px-5 py-4 text-left hover:bg-blue-50/60 ${selectedItem?.id === item.id ? "border-l-4 border-blue-600 bg-blue-50 pl-4" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.patient_name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {item.case_code} · {item.specimen_code ?? "검체 미등록"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>
                    {statusLabel[item.status] ?? item.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{item.assigned_to_name ?? "미배정"}</span>
                  <span>{formatDateTime(item.updated_at)}</span>
                </div>
              </button>
            ))}
            {!loading && filteredItems.length === 0 && (
              <p className="px-5 py-16 text-center text-sm text-slate-500">
                병리 보고서 검토 작업이 없습니다.
              </p>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">보고서 작업 정보</h2>
              {selectedItem && (
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(selectedItem.status)}`}>
                  {statusLabel[selectedItem.status] ?? selectedItem.status}
                </span>
              )}
            </div>
            {selectedItem ? (
              <div className="p-5">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 text-sm">
                  {[
                    ["환자", `${selectedItem.patient_name} · ${selectedItem.patient_code}`],
                    ["Case", selectedItem.case_code],
                    ["검체", selectedItem.specimen_code ?? "-"],
                    ["WSI", selectedItem.slide_code ?? "-"],
                    ["담당자", selectedItem.assigned_to_name ?? "미배정"],
                    ["생성일", formatDateTime(selectedItem.created_at)],
                    ["마감일", formatDateTime(selectedItem.due_at)],
                    ["완료일", formatDateTime(selectedItem.completed_at)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-slate-500">{label}</dt>
                      <dd className="mt-1 break-words font-semibold text-slate-900">{value}</dd>
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
              <p className="px-5 py-14 text-center text-sm text-slate-500">보고서 작업을 선택해 주세요.</p>
            )}
          </section>

          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">보고서 내용</h2>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {["최종 병리 진단", "면역조직화학 및 분자검사", "추가 검사 결과", "보고서 주석"].map((label) => (
                <div key={label} className="min-h-28 border border-dashed border-slate-300 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-600">{label}</p>
                  <p className="mt-4 text-xs text-slate-400">연결된 보고서 데이터가 없습니다.</p>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-600">
              현재 화면은 조회 준비 상태입니다. 보고서 작성·저장·전자서명은 전용 API가 준비된 후 연결합니다.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
