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

function selectPdL1Items(results: WorkItem[]) {
  return results.filter((item) => item.task_type === "PD_L1_REVIEW");
}

export default function PathologyPdL1Page() {
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
        const pdL1Items = selectPdL1Items(results);
        setItems(pdL1Items);
        setSelectedId((current) => current ?? pdL1Items[0]?.id ?? null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "PD-L1 검토 작업을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected]);

  async function loadPdL1Items() {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(WORK_ITEMS_API_URL);
      const pdL1Items = selectPdL1Items(await readWorkItems(response));
      setItems(pdL1Items);
      setSelectedId((current) =>
        pdL1Items.some((item) => item.id === current)
          ? current
          : (pdL1Items[0]?.id ?? null),
      );
      markConnected();
    } catch (requestError) {
      setItems([]);
      setSelectedId(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "PD-L1 검토 작업을 불러오지 못했습니다.",
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
            PD-L1·경로 분석
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            PD-L1 검토 작업과 연결된 분석 결과의 상태를 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadPdL1Items}
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <PathologyAuthPanel loading={loading} onConnect={loadPdL1Items} />

      {error && (
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["전체 검토", items.length, "text-slate-900"],
          ["대기", items.filter((item) => item.status === "PENDING").length, "text-amber-700"],
          ["진행 중", items.filter((item) => item.status === "IN_PROGRESS").length, "text-blue-700"],
          ["완료", items.filter((item) => item.status === "COMPLETED").length, "text-emerald-700"],
        ].map(([label, count, color]) => (
          <div key={label} className="border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.8fr)]">
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
              <option value="PENDING">대기</option>
              <option value="IN_PROGRESS">진행 중</option>
              <option value="BLOCKED">차단</option>
              <option value="COMPLETED">완료</option>
              <option value="CANCELLED">취소</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">환자</th>
                  <th className="whitespace-nowrap px-4 py-3">Case</th>
                  <th className="whitespace-nowrap px-4 py-3">검체</th>
                  <th className="whitespace-nowrap px-4 py-3">PD-L1 WSI</th>
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
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatDateTime(item.created_at)}</td>
                  </tr>
                ))}
                {!loading && filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-500">
                      현재 API에 등록된 PD-L1 검토 작업이 없습니다.
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
              <h2 className="text-sm font-semibold text-slate-900">선택 검토 작업</h2>
            </div>
            {selectedItem ? (
              <div className="p-5">
                <dl className="space-y-4 text-sm">
                  {[
                    ["환자", `${selectedItem.patient_name} · ${selectedItem.patient_code}`],
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
              <p className="px-5 py-14 text-center text-sm text-slate-500">검토 작업을 선택해 주세요.</p>
            )}
          </section>

          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">PD-L1 및 경로 분석 결과</h2>
            </div>
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-slate-700">연결된 분석 결과가 없습니다.</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                결과 API가 준비되면 TPS, 예측 구간 및 경로 분석 지표를 이 영역에 표시합니다.
              </p>
            </div>
          </section>

          <div className="border border-amber-200 bg-amber-50 px-5 py-4 text-xs leading-5 text-amber-800">
            현재 백엔드 작업 유형에는 PD-L1 전용 작업이 없습니다. 화면은 호환 작업 유형을 조회하는 준비 상태입니다.
          </div>
        </div>
      </div>
    </div>
  );
}
