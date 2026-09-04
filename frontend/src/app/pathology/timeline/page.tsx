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

type TimelineEvent = {
  id: string;
  workItemId: string;
  occurredAt: string;
  title: string;
  description: string;
  status: string;
  kind: "created" | "completed";
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildTimeline(items: WorkItem[]): TimelineEvent[] {
  return items
    .flatMap((item) => {
      const task = taskLabel[item.task_type] ?? item.task_type;
      const createdEvent: TimelineEvent = {
        id: `${item.id}-created`,
        workItemId: item.id,
        occurredAt: item.created_at,
        title: `${task} 작업 생성`,
        description: `${item.specimen_code ?? "검체 미등록"} · ${item.slide_code ?? "WSI 미등록"}`,
        status: statusLabel[item.status] ?? item.status,
        kind: "created",
      };

      if (!item.completed_at) return [createdEvent];

      return [
        createdEvent,
        {
          id: `${item.id}-completed`,
          workItemId: item.id,
          occurredAt: item.completed_at,
          title: `${task} 작업 완료`,
          description: item.assigned_to_name ?? "담당자 정보 없음",
          status: statusLabel[item.status] ?? item.status,
          kind: "completed" as const,
        },
      ];
    })
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );
}

export default function PathologyTimelinePage() {
  const { authorizedFetch, isConnected, markConnected } = usePathologyAuth();
  const [cases, setCases] = useState<PathologyCase[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState("ALL");
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
            : "병리 업무 타임라인을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected]);

  async function loadTimeline() {
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
          : "병리 업무 타임라인을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  const selectedCase =
    cases.find((item) => item.id === selectedCaseId) ?? null;
  const selectedWorkItems = workItems.filter(
    (item) => item.case_id === selectedCaseId,
  );
  const timeline = useMemo(() => {
    const events = buildTimeline(selectedWorkItems);
    if (eventFilter === "ALL") return events;
    return events.filter((event) => event.kind === eventFilter);
  }, [eventFilter, selectedWorkItems]);

  const groupedTimeline = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();

    for (const event of timeline) {
      const key = formatDate(event.occurredAt);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }

    return Array.from(groups.entries());
  }, [timeline]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            임상 타임라인
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            선택한 Case에서 확인 가능한 병리 업무 이벤트를 시간순으로 표시합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadTimeline}
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <PathologyAuthPanel loading={loading} onConnect={loadTimeline} />

      {error && (
        <div className="mt-6 border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="mt-6 border border-slate-200 bg-white p-5">
        <label className="block text-xs font-semibold text-slate-600">
          Case 선택
          <select
            value={selectedCaseId ?? ""}
            onChange={(event) => setSelectedCaseId(event.target.value)}
            disabled={loading || cases.length === 0}
            className="mt-2 block w-full max-w-xl rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 disabled:bg-slate-50"
          >
            <option value="">Case 없음</option>
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.case_code} · {item.patient_name} ({item.patient_code})
              </option>
            ))}
          </select>
        </label>
      </section>

      {selectedCase && (
        <section className="mt-5 border border-slate-200 bg-white p-5">
          <dl className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {[
              ["환자", selectedCase.patient_name],
              ["환자번호", selectedCase.patient_code],
              ["Case", selectedCase.case_code],
              ["현재 단계", selectedCase.current_stage],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        <aside className="border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">이벤트 필터</h2>
          <div className="mt-4 space-y-1">
            {[
              ["ALL", "전체 이벤트"],
              ["created", "작업 생성"],
              ["completed", "작업 완료"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setEventFilter(value)}
                className={`block w-full rounded-md px-3 py-2.5 text-left text-sm ${
                  eventFilter === value
                    ? "bg-blue-50 font-semibold text-blue-800"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-500">표시 이벤트</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{timeline.length}</p>
          </div>
        </aside>

        <section className="min-w-0 border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">병리 업무 이벤트</h2>
          </div>
          <div className="p-5">
            {groupedTimeline.map(([date, events]) => (
              <div key={date} className="mb-7 last:mb-0">
                <p className="mb-4 text-xs font-semibold text-slate-500">{date}</p>
                <ol className="space-y-0">
                  {events.map((event, index) => (
                    <li key={event.id} className="relative flex gap-4 pb-6 last:pb-0">
                      {index < events.length - 1 && (
                        <span className="absolute left-[7px] top-4 h-full w-px bg-slate-200" />
                      )}
                      <span
                        className={`relative mt-1.5 h-4 w-4 shrink-0 rounded-full border-4 border-white ${
                          event.kind === "completed" ? "bg-emerald-500" : "bg-blue-600"
                        } ring-1 ring-slate-200`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                          <time className="text-xs text-slate-500">{formatTime(event.occurredAt)}</time>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{event.description}</p>
                        <div className="mt-2 flex items-center gap-3">
                          <span className="text-xs font-medium text-slate-600">현재 상태: {event.status}</span>
                          <Link href={`/pathology/work-items/${encodeURIComponent(event.workItemId)}`} className="text-xs font-semibold text-blue-700 hover:text-blue-900">
                            작업 보기
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {!loading && groupedTimeline.length === 0 && (
              <p className="py-16 text-center text-sm text-slate-500">표시할 병리 업무 이벤트가 없습니다.</p>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">현재 병리 업무</h2>
            <div className="mt-4 space-y-3">
              {selectedWorkItems.slice(0, 5).map((item) => (
                <Link key={item.id} href={`/pathology/work-items/${encodeURIComponent(item.id)}`} className="block border border-slate-200 p-3 hover:bg-slate-50">
                  <p className="text-sm font-semibold text-slate-800">{taskLabel[item.task_type] ?? item.task_type}</p>
                  <p className="mt-1 text-xs text-slate-500">{statusLabel[item.status] ?? item.status} · {item.assigned_to_name ?? "미배정"}</p>
                </Link>
              ))}
              {!loading && selectedWorkItems.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">연결된 병리 업무가 없습니다.</p>
              )}
            </div>
          </section>

          <div className="border border-blue-200 bg-blue-50 px-5 py-4 text-xs leading-5 text-blue-800">
            현재는 병리 작업 API의 생성·완료 기록만 표시합니다. 전체 임상 타임라인은 진료·검사·처방 이벤트 API가 준비된 후 확장합니다.
          </div>
        </aside>
      </div>
    </div>
  );
}
