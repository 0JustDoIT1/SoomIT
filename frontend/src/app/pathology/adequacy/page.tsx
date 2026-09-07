"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PathologyAuthPanel } from "../_components/pathology-auth-panel";
import { usePathologyAuth } from "../_components/pathology-auth-provider";
import { PathologyStateMessage } from "../_components/pathology-state-message";
import {
  caseAdequacyAiResultsApiUrl,
  type PathologyAiAnalysis,
  readPathologyAiAnalyses,
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

const priorityStyle: Record<string, string> = {
  NORMAL: "bg-slate-100 text-slate-600",
  REVIEW_REQUIRED: "bg-amber-50 text-amber-700",
  CRITICAL: "bg-red-50 text-red-700",
  URGENT: "bg-red-50 text-red-700",
  HIGH: "bg-orange-50 text-orange-700",
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

export default function PathologyAdequacyPage() {
  const { authorizedFetch, isConnected, markConnected } = usePathologyAuth();
  const [items, setItems] = useState<WorkItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(isConnected);
  const [error, setError] = useState("");
  const [analyses, setAnalyses] = useState<PathologyAiAnalysis[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [resultCaseId, setResultCaseId] = useState<string | null>(null);
  const [resultError, setResultError] = useState("");

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    void authorizedFetch(WORK_ITEMS_API_URL)
      .then(readWorkItems)
      .then((results) => {
        if (cancelled) return;
        const adequacyItems = results.filter((item) =>
          ["ADEQUACY_ANALYSIS", "ADEQUACY_REVIEW"].includes(item.task_type),
        );
        setItems(adequacyItems);
        setSelectedId((current) => current ?? adequacyItems[0]?.id ?? null);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "적정성 분석 작업을 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected]);

  async function loadAdequacyItems() {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(WORK_ITEMS_API_URL);
      const results = await readWorkItems(response);
      const adequacyItems = results.filter((item) =>
        ["ADEQUACY_ANALYSIS", "ADEQUACY_REVIEW"].includes(item.task_type),
      );

      setItems(adequacyItems);
      setSelectedId((current) =>
        adequacyItems.some((item) => item.id === current)
          ? current
          : (adequacyItems[0]?.id ?? null),
      );
      markConnected();
    } catch (requestError) {
      setItems([]);
      setSelectedId(null);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "적정성 분석 작업을 불러오지 못했습니다.",
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
  const selectedAnalysis =
    analyses.find((analysis) => analysis.id === selectedAnalysisId) ??
    analyses[0] ??
    null;
  const selectedCaseId = selectedItem?.case_id ?? null;
  const resultLoading = Boolean(
    isConnected && selectedCaseId && resultCaseId !== selectedCaseId,
  );

  useEffect(() => {
    if (!isConnected || !selectedCaseId) return;

    let cancelled = false;

    void authorizedFetch(caseAdequacyAiResultsApiUrl(selectedCaseId))
      .then(readPathologyAiAnalyses)
      .then((results) => {
        if (cancelled) return;
        setAnalyses(results);
        setSelectedAnalysisId(results[0]?.id ?? null);
        setResultCaseId(selectedCaseId);
        setResultError("");
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setAnalyses([]);
        setSelectedAnalysisId(null);
        setResultCaseId(selectedCaseId);
        setResultError(
          requestError instanceof Error
            ? requestError.message
            : "검체 적정성 결과를 불러오지 못했습니다.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [authorizedFetch, isConnected, selectedCaseId]);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            검체 적정성 분석
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            적정성 AI 분석과 전문의 판정 작업의 현재 상태를 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAdequacyItems}
          disabled={loading}
          className="shrink-0 rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "새로고침"}
        </button>
      </div>

      <PathologyAuthPanel loading={loading} onConnect={loadAdequacyItems} />

      {error && (
        <PathologyStateMessage variant="error" title={error} className="mt-6" />
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["전체", items.length, "text-slate-900"],
          ["대기", items.filter((item) => item.status === "PENDING").length, "text-amber-700"],
          ["진행 중", items.filter((item) => item.status === "IN_PROGRESS").length, "text-blue-700"],
          ["판정 대기", items.filter((item) => item.task_type === "ADEQUACY_REVIEW" && item.status === "PENDING").length, "text-violet-700"],
          ["완료", items.filter((item) => item.status === "COMPLETED").length, "text-emerald-700"],
        ].map(([label, count, color]) => (
          <div key={label} className="border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.75fr)]">
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
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3">우선순위</th>
                  <th className="whitespace-nowrap px-4 py-3">환자</th>
                  <th className="whitespace-nowrap px-4 py-3">Case</th>
                  <th className="whitespace-nowrap px-4 py-3">검체</th>
                  <th className="whitespace-nowrap px-4 py-3">WSI</th>
                  <th className="whitespace-nowrap px-4 py-3">작업</th>
                  <th className="whitespace-nowrap px-4 py-3">담당자</th>
                  <th className="whitespace-nowrap px-4 py-3">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.patient_name} 적정성 작업 선택`}
                    onClick={() => setSelectedId(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(item.id);
                      }
                    }}
                    className={`cursor-pointer hover:bg-blue-50/60 focus-visible:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${selectedItem?.id === item.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityStyle[item.priority] ?? "bg-slate-100 text-slate-600"}`}>
                        {priorityLabel[item.priority] ?? item.priority}
                      </span>
                    </td>
                    <td className="min-w-36 px-4 py-3">
                      <p className="font-semibold text-slate-900">{item.patient_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{item.patient_code}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{item.case_code}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.specimen_code ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.slide_code ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{taskLabel[item.task_type] ?? item.task_type}</td>
                    <td className="whitespace-nowrap px-4 py-3">{item.assigned_to_name ?? "미배정"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(item.status)}`}>
                        {statusLabel[item.status] ?? item.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!loading && filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-500">
                      적정성 분석 작업이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="min-w-0 space-y-5">
          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">선택 작업 정보</h2>
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
                    ["생성일", formatDateTime(selectedItem.created_at)],
                    ["완료일", formatDateTime(selectedItem.completed_at)],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[72px_1fr] gap-3">
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
              <h2 className="text-sm font-semibold text-slate-900">적정성 분석 결과</h2>
            </div>
            {resultError ? (
              <PathologyStateMessage variant="error" title={resultError} className="border-0" />
            ) : resultLoading ? (
              <PathologyStateMessage
                variant="loading"
                title="검체 적정성 결과를 불러오는 중입니다."
                className="border-0"
              />
            ) : !selectedItem ? (
              <PathologyStateMessage
                variant="empty"
                title="먼저 적정성 작업을 선택해 주세요."
                className="border-0"
              />
            ) : analyses.length === 0 ? (
              <PathologyStateMessage
                variant="empty"
                title="이 Case에 등록된 검체 적정성 결과가 없습니다."
                description="적정성 분석 데이터가 생성되면 실제 결과가 표시됩니다."
                className="border-0"
              />
            ) : selectedAnalysis ? (
              <div className="p-5">
                {analyses.length > 1 && (
                  <label className="mb-5 block text-xs font-semibold text-slate-600">
                    분석 실행 선택
                    <select
                      value={selectedAnalysis.id}
                      onChange={(event) => setSelectedAnalysisId(event.target.value)}
                      className="mt-2 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                    >
                      {analyses.map((analysis) => (
                        <option key={analysis.id} value={analysis.id}>
                          {analysis.analysis_type_label} · {analysis.status_label} · {formatDateTime(analysis.created_at)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <dl className="space-y-3 text-sm">
                  {[
                    ["상태", selectedAnalysis.status_label],
                    ["모델", selectedAnalysis.model_name],
                    ["모델 버전", selectedAnalysis.model_version_name],
                    ["원본 asset", selectedAnalysis.source_image_asset_id ?? "-"],
                    ["시작일", formatDateTime(selectedAnalysis.started_at)],
                    ["완료일", formatDateTime(selectedAnalysis.completed_at)],
                  ].map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[80px_minmax(0,1fr)] gap-3">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="break-all font-medium text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>

                {selectedAnalysis.error_message && (
                  <PathologyStateMessage
                    variant="error"
                    title="적정성 분석 처리 실패"
                    description={selectedAnalysis.error_message}
                    className="mt-5"
                  />
                )}

                {selectedAnalysis.result_detail?.specimen_adequacy ? (
                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <h3 className="text-sm font-semibold text-slate-900">검체 적정성 결과</h3>
                    <dl className="mt-4 space-y-3 text-sm">
                      {[
                        ["적정성 판정", selectedAnalysis.result_detail.specimen_adequacy.adequacy_status_label],
                        ["종양세포 비율", selectedAnalysis.result_detail.specimen_adequacy.tumor_cell_ratio ?? "-"],
                        ["신뢰도", selectedAnalysis.result_detail.specimen_adequacy.confidence ?? "-"],
                      ].map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[92px_minmax(0,1fr)] gap-3">
                          <dt className="text-slate-500">{label}</dt>
                          <dd className="break-words font-semibold text-slate-900">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : (
                  <PathologyStateMessage
                    variant="info"
                    title="저장된 적정성 상세 결과가 없습니다."
                    description="분석 실행 정보만 API에서 확인되었습니다."
                    className="mt-5"
                  />
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
