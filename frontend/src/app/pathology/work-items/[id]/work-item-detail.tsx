"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PathologyAuthPanel } from "../../_components/pathology-auth-panel";
import { usePathologyAuth } from "../../_components/pathology-auth-provider";
import {
  readWorkItem,
  statusLabel,
  statusStyle,
  taskLabel,
  type WorkItem,
  workItemDetailApiUrl,
} from "../../_lib/pathology-api";

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function WorkItemDetail({ itemId }: { itemId: string }) {
  const { authorizedFetch, isConnected, markConnected } = usePathologyAuth();
  const [item, setItem] = useState<WorkItem | null>(null);
  const [loading, setLoading] = useState(isConnected);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isConnected) return;

    let cancelled = false;

    void authorizedFetch(workItemDetailApiUrl(itemId))
      .then(readWorkItem)
      .then((selectedItem) => {
        if (cancelled) return;

        setItem(selectedItem);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "작업 상세를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected, itemId]);

  async function connectAndLoad() {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(workItemDetailApiUrl(itemId));
      const selectedItem = await readWorkItem(response);

      setItem(selectedItem);
      markConnected();
    } catch (requestError) {
      setItem(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "작업 상세를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  const fields = item
    ? [
        ["환자", item.patient_name, item.patient_code],
        ["Case", item.case_code],
        ["검체", item.specimen_code ?? "미등록"],
        ["WSI", item.slide_code ?? "미등록"],
        ["작업 유형", taskLabel[item.task_type] ?? item.task_type],
        ["담당자", item.assigned_to_name ?? "미배정"],
        ["생성일", formatDate(item.created_at)],
      ]
    : [];

  return (
    <div>
      <Link
        href="/pathology/work-items"
        className="text-sm font-medium text-blue-700 hover:text-blue-900"
      >
        ← 병리 작업목록
      </Link>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">병리 작업 상세</h2>
          <p className="mt-2 text-sm text-slate-500">
            작업목록 API에서 조회한 병리 작업 정보를 표시합니다.
          </p>
        </div>

        {item && (
          <span
            className={`inline-flex shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${statusStyle(item.status)}`}
          >
            {statusLabel[item.status] ?? item.status}
          </span>
        )}
      </div>

      {!isConnected && (
        <PathologyAuthPanel loading={loading} onConnect={connectAndLoad} />
      )}

      {error && (
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-6 border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
          작업 상세를 불러오는 중입니다.
        </div>
      )}

      {!loading && item && (
        <section className="mt-6 border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <p className="text-sm font-semibold text-slate-800">기본 정보</p>
          </div>

          <dl className="grid grid-cols-1 md:grid-cols-2">
            {fields.map(([label, value, secondary]) => (
              <div
                key={label}
                className="border-b border-slate-100 px-6 py-5 md:odd:border-r"
              >
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </dt>
                <dd className="mt-2 text-sm font-medium text-slate-900">
                  {value}
                </dd>
                {secondary && (
                  <dd className="mt-1 text-xs text-slate-500">{secondary}</dd>
                )}
              </div>
            ))}

            <div className="border-b border-slate-100 px-6 py-5 md:odd:border-r">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                상태
              </dt>
              <dd className="mt-2 text-sm font-medium text-slate-900">
                {statusLabel[item.status] ?? item.status}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
