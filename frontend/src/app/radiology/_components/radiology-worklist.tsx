import { StateMessage } from "@/components/workspace/state-message";

import type {
  RadiologyWorklistFilters,
  RadiologyWorklistItem,
  RadiologyWorkflowStatus,
} from "../_lib/radiology-api";

const workflowLabels: Record<RadiologyWorkflowStatus, string> = {
  CANCELLED: "취소됨",
  EXAM_PENDING: "예약됨",
  IMAGE_PENDING: "영상 연결 대기",
  AI_READY: "분석 대기 중",
  AI_RUNNING: "AI 분석 중",
  AI_FAILED: "AI 실패",
  REVIEW_PENDING: "의사 판독 중",
  REVIEW_COMPLETED: "판독 완료",
};

export type WorklistViewStatus =
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "unauthorized";

type RadiologyWorklistProps = {
  items: RadiologyWorklistItem[];
  selectedId: string | null;
  onSelect: (item: RadiologyWorklistItem) => void;
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
    <section aria-labelledby="worklist-heading" className="flex min-h-0 min-w-0 flex-col">
      <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-2">
        <h2
          id="worklist-heading"
          className="mr-auto text-sm font-bold text-slate-800"
        >
          영상 검사 Worklist
        </h2>

        <label className="flex items-center gap-2 text-xs text-slate-500">
          검사
          <select
            value={filters.exam_type ?? ""}
            onChange={(event) =>
              updateFilter(
                "exam_type",
                event.target.value as
                  | RadiologyWorklistFilters["exam_type"]
                  | "",
              )
            }
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
          >
            <option value="">전체</option>
            <option value="XRAY">X-ray</option>
            <option value="CT">CT</option>
            <option value="STAGING">PET-CT / TNM</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-500">
          오더 상태
          <select
            value={filters.status ?? ""}
            onChange={(event) =>
              updateFilter(
                "status",
                event.target.value as
                  | RadiologyWorklistFilters["status"]
                  | "",
              )
            }
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
          >
            <option value="">전체</option>
            <option value="ORDERED">요청됨</option>
            <option value="SCHEDULED">예약됨</option>
            <option value="COMPLETED">완료</option>
            <option value="CANCELLED">취소</option>
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="w-[26%] px-5 py-3">환자명</th>
              <th className="w-[24%] px-5 py-3">환자코드</th>
              <th className="w-[25%] px-5 py-3">검사</th>
              <th className="w-[25%] px-5 py-3">상태</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => {
              const orderId = item.examination_order.id;

              return (
                <tr
                  key={orderId}
                  tabIndex={0}
                  aria-selected={selectedId === orderId}
                  className={`cursor-pointer border-b border-slate-100 outline-none transition-colors hover:bg-blue-50/50 focus:bg-blue-50 ${
                    selectedId === orderId ? "bg-blue-50" : "bg-white"
                  }`}
                  onClick={() => onSelect(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(item);
                    }
                  }}
                >
                  <td className="px-5 py-3 font-semibold text-slate-800">
                    {item.patient.name}
                  </td>

                  <td className="px-5 py-3 text-slate-600">
                    {item.patient.patient_code}
                  </td>

                  <td className="px-5 py-3 text-slate-700">
                    {item.examination_order.exam_type_label}
                  </td>

                  <td className="px-5 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {workflowLabels[item.workflow_status]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewStatus === "loading" ? (
        <StateMessage
          variant="loading"
          title="Worklist를 불러오는 중입니다."
          className="m-5"
        />
      ) : null}

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

      {viewStatus === "ready" && totalItems > 0 ? (
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
                    ? "bg-blue-700 text-white"
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
