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

function selectReviewItems(results: WorkItem[]) {
  return results.filter((item) => item.task_type === "DIAGNOSTIC_REVIEW");
}

export default function PathologyReviewPage() {
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
        const reviewItems = selectReviewItems(results);
        setItems(reviewItems);
        setSelectedId((current) => current ?? reviewItems[0]?.id ?? null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "병리 판독 작업을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected]);

  async function loadReviewItems() {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(WORK_ITEMS_API_URL);
      const reviewItems = selectReviewItems(await readWorkItems(response));
      setItems(reviewItems);
      setSelectedId((current) =>
        reviewItems.some((item) => item.id === current)
          ? current
          : (reviewItems[0]?.id ?? null),
      );
      markConnected();
    } catch (requestError) {
      setItems([]);
      setSelectedId(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "병리 판독 작업을 불러오지 못했습니다.",
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
            병리 판독
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            전문의 판독 대기열과 연결된 검체 및 WSI 정보를 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadReviewItems}
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <PathologyAuthPanel loading={loading} onConnect={loadReviewItems} />

      {error && (
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["전체", items.length, "text-slate-900"],
          ["판독 대기", items.filter((item) => item.status === "PENDING").length, "text-amber-700"],
          ["판독 중", items.filter((item) => item.status === "IN_PROGRESS").length, "text-blue-700"],
          ["완료", items.filter((item) => item.status === "COMPLETED").length, "text-emerald-700"],
          ["처리 필요", items.filter((item) => ["BLOCKED", "FAILED"].includes(item.status)).length, "text-red-700"],
        ].map(([label, count, color]) => (
          <div key={label} className="border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <section className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-900">판독 대기열</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="환자명·Case·WSI 검색"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="ALL">전체 상태</option>
              <option value="PENDING">판독 대기</option>
              <option value="IN_PROGRESS">판독 중</option>
              <option value="BLOCKED">차단</option>
              <option value="COMPLETED">완료</option>
              <option value="CANCELLED">취소</option>
            </select>
          </div>
          <div className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`block w-full px-4 py-4 text-left hover:bg-blue-50/60 ${selectedItem?.id === item.id ? "border-l-4 border-blue-600 bg-blue-50 pl-3" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.patient_name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{item.case_code}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-500">
                    {priorityLabel[item.priority] ?? item.priority}
                  </span>
                </div>
                <p className="mt-2 truncate text-xs text-slate-600">{item.slide_code ?? "WSI 미등록"}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>
                    {statusLabel[item.status] ?? item.status}
                  </span>
                  <span className="text-xs text-slate-500">{item.assigned_to_name ?? "미배정"}</span>
                </div>
              </button>
            ))}
            {!loading && filteredItems.length === 0 && (
              <p className="px-4 py-14 text-center text-sm text-slate-500">병리 판독 작업이 없습니다.</p>
            )}
          </div>
        </section>

        <section className="min-w-0 border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">WSI 판독 영역</h2>
          </div>
          {selectedItem ? (
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-5 md:grid-cols-4">
                {[
                  ["환자", `${selectedItem.patient_name} · ${selectedItem.patient_code}`],
                  ["Case", selectedItem.case_code],
                  ["검체", selectedItem.specimen_code ?? "-"],
                  ["WSI", selectedItem.slide_code ?? "-"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex min-h-80 items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
                <div>
                  <p className="text-sm font-semibold text-slate-700">WSI 뷰어가 연결되지 않았습니다.</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    뷰어 연동 API와 이미지 접근 방식이 확정되면 실제 슬라이드 영상을 표시합니다.
                  </p>
                </div>
              </div>

              <div className="mt-5 border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-700">판독 기록</p>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  저장된 판독문 데이터가 없습니다. 판독 입력과 임시 저장은 쓰기 API가 준비된 후 활성화합니다.
                </p>
              </div>
            </div>
          ) : (
            <p className="px-5 py-20 text-center text-sm text-slate-500">판독 작업을 선택해 주세요.</p>
          )}
        </section>

        <aside className="space-y-5">
          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">판독 작업 정보</h2>
            </div>
            {selectedItem ? (
              <div className="p-5">
                <dl className="space-y-4 text-sm">
                  {[
                    ["상태", statusLabel[selectedItem.status] ?? selectedItem.status],
                    ["담당자", selectedItem.assigned_to_name ?? "미배정"],
                    ["생성일", formatDateTime(selectedItem.created_at)],
                    ["마감일", formatDateTime(selectedItem.due_at)],
                    ["완료일", formatDateTime(selectedItem.completed_at)],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[64px_1fr] gap-3">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="break-words font-medium text-slate-900">{value}</dd>
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
              <p className="px-5 py-12 text-center text-sm text-slate-500">작업 정보가 없습니다.</p>
            )}
          </section>

          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">연결된 AI 참고 결과</h2>
            </div>
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-700">연결된 결과가 없습니다.</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">모델 결과 API 연결 후 참고 정보만 표시합니다.</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
