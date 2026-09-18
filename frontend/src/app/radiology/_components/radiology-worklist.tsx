import { StateMessage } from "@/components/workspace/state-message";
import { useState } from "react";

import type {
  RadiologyWorklistFilters,
  RadiologyCaseWorklistItem,
  RadiologyWorkflowStatus,
} from "../_lib/radiology-api";

const workflowLabels: Record<RadiologyWorkflowStatus, string> = {
  CANCELLED: "AI 분석 전",
  EXAM_PENDING: "AI 분석 전",
  IMAGE_PENDING: "AI 분석 전",
  AI_READY: "AI 분석 전",
  AI_RUNNING: "AI 분석 전",
  AI_COMPLETED: "검토 대기 중",
  AI_FAILED: "AI 분석 전",
  REVIEW_PENDING: "검토 대기 중",
  REVIEW_COMPLETED: "진행 완료",
};

const workflowStatusGroups: Record<string, RadiologyWorkflowStatus[]> = {
  AI_BEFORE: ["EXAM_PENDING", "IMAGE_PENDING", "AI_READY", "AI_RUNNING", "AI_FAILED", "CANCELLED"],
  REVIEW_PENDING: ["AI_COMPLETED", "REVIEW_PENDING"],
  REVIEW_COMPLETED: ["REVIEW_COMPLETED"],
};

export type WorklistViewStatus =
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "unauthorized";

type RadiologyWorklistProps = {
  items: RadiologyCaseWorklistItem[];
  selectedId: string | null;
  onSelect: (item: RadiologyCaseWorklistItem) => void;
  viewStatus: WorklistViewStatus;
  errorMessage: string;
  filters: RadiologyWorklistFilters;
  onFiltersChange: (filters: RadiologyWorklistFilters) => void;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
};

export function RadiologyWorklist({
  items,
  selectedId,
  onSelect,
  viewStatus,
  errorMessage,
  filters,
  onFiltersChange,
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
}: RadiologyWorklistProps) {
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState("ALL");
  const visibleItems = items.filter((item) => workflowStatusFilter === "ALL" || workflowStatusGroups[workflowStatusFilter]?.includes(item.workflow_status));

  function updateFilter<Key extends keyof RadiologyWorklistFilters>(
    key: Key,
    value: RadiologyWorklistFilters[Key] | "",
  ) {
    const nextFilters = { ...filters };

    if (value) {
      nextFilters[key] = value;
    } else {
      delete nextFilters[key];
    }

    onFiltersChange(nextFilters);
  }

  return (
    <section aria-labelledby="worklist-heading" className="flex min-h-0 min-w-0 flex-col bg-white">
      <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-violet-100 bg-gradient-to-r from-white to-violet-50/50 px-5 py-2">
        <h2
          id="worklist-heading"
          className="mr-auto text-sm font-bold text-slate-800"
        >
          영상 검사 Worklist
        </h2>

        <label className="flex items-center gap-2 text-xs text-slate-500">
          검사
          <select
            value={filters.order_type ?? ""}
            onChange={(event) =>
              updateFilter(
                "order_type",
                event.target.value as
                  | RadiologyWorklistFilters["order_type"]
                  | "",
              )
            }
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-violet-300"
          >
            <option value="">전체</option>
            <option value="XRAY">X-ray</option>
            <option value="CT">CT</option>
            <option value="PET_CT_TNM">PET-CT</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-500">
          오더 상태
          <select
            value={workflowStatusFilter}
            onChange={(event) => setWorkflowStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-violet-300"
          >
            <option value="ALL">전체</option>
            <option value="AI_BEFORE">AI 분석 전</option>
            <option value="REVIEW_PENDING">검토 대기 중</option>
            <option value="REVIEW_COMPLETED">진행 완료</option>
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" aria-busy={viewStatus === "loading"}>
        {viewStatus === "loading" ? <span className="sr-only" role="status">Worklist 로딩 중</span> : null}
        <table className="w-full min-w-[420px] border-collapse text-left text-xs">
          <thead className="bg-violet-50/40 text-xs font-semibold text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="w-[26%] px-3 py-2.5">환자명</th>
              <th className="w-[24%] px-3 py-2.5">환자코드</th>
              <th className="w-[25%] px-3 py-2.5">검사</th>
              <th className="w-[25%] px-3 py-2.5">상태</th>
            </tr>
          </thead>

          <tbody>
            {viewStatus === "loading" && items.length === 0 ? Array.from({ length: 10 }, (_, index) => (
              <tr key={index} aria-hidden="true" className="border-b border-slate-100 border-l-4 border-l-transparent motion-safe:animate-pulse">
                {["w-14", "w-20", "w-12", "w-16"].map((width) => (
                  <td key={width} className="px-3 py-2.5">
                    <div className={`h-6 max-w-full rounded bg-violet-50 ${width}`} />
                  </td>
                ))}
              </tr>
            )) : visibleItems.map((item) => {
              const caseId = item.case.id;

              return (
                <tr
                  key={caseId}
                  tabIndex={0}
                  aria-selected={selectedId === caseId}
                  className={`cursor-pointer border-b border-slate-100 border-l-4 outline-none transition-colors hover:bg-blue-50/60 focus:bg-violet-50 ${
                    selectedId === caseId ? "border-l-violet-500 bg-violet-100/70" : "border-l-transparent bg-white"
                  }`}
                  onClick={() => onSelect(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(item);
                    }
                  }}
                >
                  <td className="px-3 py-2.5 font-semibold text-slate-800">
                    {item.patient.name}
                  </td>

                  <td className="px-3 py-2.5 text-slate-600">
                    {item.patient.patient_code}
                  </td>

                  <td className="px-3 py-2.5 text-slate-700">
                    {item.current_exam.examination_order.order_type_label}
                  </td>

                  <td className="px-3 py-2.5">
                    <span className={`inline rounded-sm px-0.5 py-0 text-xs font-semibold text-black ${
                      item.workflow_status === "REVIEW_COMPLETED"
                        ? "bg-emerald-100/80"
                        : item.workflow_status === "REVIEW_PENDING" || item.workflow_status === "AI_COMPLETED"
                          ? "bg-orange-100/80"
                          : "bg-yellow-100/80"
                    }`}>
                      {workflowLabels[item.workflow_status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewStatus === "empty" ? (
        <StateMessage
          variant="empty"
          title="표시할 영상 검사 항목이 없습니다."
          className="m-5"
        />
      ) : null}

      {viewStatus === "unauthorized" ? (
        <StateMessage
          variant="error"
          title="Worklist를 조회할 수 없습니다."
          description={errorMessage}
          className="m-5"
        />
      ) : null}

      {viewStatus === "error" ? (
        <StateMessage
          variant="error"
          title="Worklist 조회 중 오류가 발생했습니다."
          description={errorMessage}
          className="m-5"
        />
      ) : null}

      {(viewStatus === "ready" || (viewStatus === "loading" && totalItems > 0)) && totalItems > 0 ? (
        <nav
          aria-label="Worklist 페이지"
          className="flex items-center justify-center gap-1 border-t border-slate-200 px-4 py-3"
        >
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            이전
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map(
            (page) => (
              <button
                key={page}
                type="button"
                aria-current={currentPage === page ? "page" : undefined}
                onClick={() => onPageChange(page)}
                className={`h-8 min-w-8 rounded-md px-2 text-xs font-semibold ${
                  currentPage === page
                    ? "bg-violet-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600"
                }`}
              >
                {page}
              </button>
            ),
          )}

          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            다음
          </button>
        </nav>
      ) : null}
    </section>
  );
}
