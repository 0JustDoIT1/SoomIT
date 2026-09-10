import { StateMessage } from "@/components/workspace/state-message";
import { StatusBadge } from "@/components/workspace/status-badge";

import type {
  RadiologyWorklistFilters,
  RadiologyWorklistItem,
} from "../_lib/radiology-api";

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
  }).format(date);
}

export function RadiologyWorklist({
  items,
  selectedId,
  onSelect,
  viewStatus,
  errorMessage,
  filters,
  onFiltersChange,
}: RadiologyWorklistProps) {
  function updateFilter<Key extends keyof RadiologyWorklistFilters>(
    key: Key,
    value: RadiologyWorklistFilters[Key] | "",
  ) {
    const nextFilters = { ...filters };
    if (value) nextFilters[key] = value;
    else delete nextFilters[key];
    onFiltersChange(nextFilters);
  }

  return (
    <section aria-labelledby="worklist-heading" className="min-w-0">
      <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-2">
        <h2 id="worklist-heading" className="mr-auto text-sm font-bold text-slate-800">
          영상 검사 Worklist
        </h2>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          검사
          <select
            value={filters.exam_type ?? ""}
            onChange={(event) => updateFilter("exam_type", event.target.value as RadiologyWorklistFilters["exam_type"] | "")}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
          >
            <option value="">전체</option>
            <option value="XRAY">X-ray</option>
            <option value="CT">CT</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          오더 상태
          <select
            value={filters.status ?? ""}
            onChange={(event) => updateFilter("status", event.target.value as RadiologyWorklistFilters["status"] | "")}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
          >
            <option value="">전체</option>
            <option value="ORDERED">요청됨</option>
            <option value="SCHEDULED">예약됨</option>
            <option value="COMPLETED">완료</option>
            <option value="CANCELLED">취소</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          우선순위
          <select
            value={filters.priority ?? ""}
            onChange={(event) => updateFilter("priority", event.target.value as RadiologyWorklistFilters["priority"] | "")}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
          >
            <option value="">전체</option>
            <option value="NORMAL">일반</option>
            <option value="URGENT">긴급</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3">환자명</th>
              <th className="px-4 py-3">환자코드</th>
              <th className="px-4 py-3">검사 종류</th>
              <th className="px-4 py-3">우선순위</th>
              <th className="px-4 py-3">현재 상태</th>
              <th className="px-4 py-3">검사 예정 시각</th>
              <th className="px-4 py-3">요청 의사</th>
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
                  className={`cursor-pointer border-b border-slate-100 outline-none hover:bg-cyan-50/50 focus:bg-cyan-50 ${selectedId === orderId ? "bg-cyan-50" : "bg-white"}`}
                  onClick={() => onSelect(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(item);
                    }
                  }}
                >
                  <td className="px-4 py-3 font-semibold text-slate-800">{item.patient.name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.patient.patient_code}</td>
                  <td className="px-4 py-3 text-slate-700">{item.examination_order.exam_type_label}</td>
                  <td className="px-4 py-3"><StatusBadge status={item.examination_order.priority} label={item.examination_order.priority_label} /></td>
                  <td className="px-4 py-3"><StatusBadge status={item.workflow_status} label={item.workflow_status_label} /></td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(item.scheduled_at)}</td>
                  <td className="px-4 py-3 text-slate-600">{item.requesting_doctor.name}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewStatus === "loading" ? (
        <StateMessage variant="loading" title="Worklist를 불러오는 중입니다." className="m-5" />
      ) : null}
      {viewStatus === "empty" ? (
        <StateMessage variant="empty" title="표시할 영상 검사 항목이 없습니다." className="m-5" />
      ) : null}
      {viewStatus === "unauthorized" ? (
        <StateMessage variant="error" title="Worklist를 조회할 수 없습니다." description={errorMessage} className="m-5" />
      ) : null}
      {viewStatus === "error" ? (
        <StateMessage variant="error" title="Worklist 조회 중 오류가 발생했습니다." description={errorMessage} className="m-5" />
      ) : null}
    </section>
  );
}
