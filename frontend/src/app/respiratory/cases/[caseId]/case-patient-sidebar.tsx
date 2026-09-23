"use client";

import { useMemo, useState } from "react";

type CasePatientItem = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name?: string | null;
  current_stage?: string | null;
  case_status?: string | null;
  updated_at?: string | null;
};

type FilterKey = "ALL" | "ACTIVE" | "CLOSED";

const STAGE_LABELS: Record<string, string> = {
  XRAY: "흉부 X-ray",
  CT: "흉부 CT",
  PET_CT_TNM: "PET-CT / TNM",
  PATHOLOGY_GENE: "조직 / 유전자",
  PDL1: "PD-L1",
  TREATMENT: "치료 결정",
  PRESCRIPTION: "처방",
};

const CLOSED_STATUSES = new Set([
  "CLOSED",
  "REFERRED_OUT",
  "COMPLETED",
  "CANCELLED",
]);

function isClosedCase(status?: string | null) {
  return Boolean(status && CLOSED_STATUSES.has(status));
}

function statusLabel(status?: string | null) {
  if (status === "REFERRED_OUT") return "전원";
  if (isClosedCase(status)) return "종결";
  return "진행 중";
}

function stageLabel(stage?: string | null) {
  if (!stage) return "단계 미정";
  return STAGE_LABELS[stage] ?? stage;
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function CasePatientSidebar({
  cases,
  selectedId,
  searchText,
  onSearchChange,
  onSelect,
}: {
  cases: CasePatientItem[];
  selectedId: string;
  searchText: string;
  onSearchChange: (value: string) => void;
  onSelect: (caseId: string) => void;
}) {
  const [filter, setFilter] = useState<FilterKey>("ALL");

  const counts = useMemo(() => {
    const active = cases.filter(
      (item) => !isClosedCase(item.case_status),
    ).length;

    return {
      all: cases.length,
      active,
      closed: cases.length - active,
    };
  }, [cases]);

  const visibleCases = useMemo(() => {
    if (filter === "ACTIVE") {
      return cases.filter(
        (item) => !isClosedCase(item.case_status),
      );
    }

    if (filter === "CLOSED") {
      return cases.filter((item) =>
        isClosedCase(item.case_status),
      );
    }

    return cases;
  }, [cases, filter]);

  const selectedCase =
    cases.find((item) => item.id === selectedId) ?? null;

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
      {/* Header */}
      <header className="shrink-0 border-b border-slate-100 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-blue-600">
              My Cases
            </p>
            <h2 className="mt-0.5 text-[16px] font-bold tracking-[-0.02em] text-slate-900">
              담당 환자
            </h2>
          </div>

          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 px-2 text-[10px] font-bold text-slate-600">
            {counts.all}
          </span>
        </div>

        {/* Search */}
        <label className="relative mt-3 block">
          <span className="sr-only">담당 환자 검색</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          >
            <path
              d="m21 21-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>

          <input
            type="search"
            value={searchText}
            onChange={(event) =>
              onSearchChange(event.target.value)
            }
            placeholder="환자명, 환자번호, Case 검색"
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2.5 text-[10px] text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </label>

        {/* Filter */}
        <div
          className="mt-2 grid grid-cols-[0.9fr_1.28fr_0.9fr] gap-1.5"
          role="group"
          aria-label="Case 상태 필터"
        >
          <FilterButton
            active={filter === "ALL"}
            onClick={() => setFilter("ALL")}
            label="전체"
            count={counts.all}
          />
          <FilterButton
            active={filter === "ACTIVE"}
            onClick={() => setFilter("ACTIVE")}
            label="진행 중"
            count={counts.active}
          />
          <FilterButton
            active={filter === "CLOSED"}
            onClick={() => setFilter("CLOSED")}
            label="종결·전원"
            count={counts.closed}
          />
        </div>
      </header>

      {/* Case list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5 [scrollbar-gutter:stable]">
        {visibleCases.length ? (
          <div className="space-y-2">
            {visibleCases.map((item) => {
              const selected = item.id === selectedId;
              const closed = isClosedCase(item.case_status);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={selected ? "page" : undefined}
                  className={`relative w-full overflow-hidden rounded-xl border px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
                    selected
                      ? "border-blue-300 bg-blue-50/80 shadow-sm"
                      : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                  }`}
                >
                  {selected && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-blue-600"
                    />
                  )}

                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-[13px] font-bold text-slate-900">
                      {item.patient_name || item.patient_code}
                    </p>

                    <span
                      className={`shrink-0 rounded-md px-1.5 py-1 text-[8px] font-bold ${
                        closed
                          ? "bg-slate-100 text-slate-500"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {statusLabel(item.case_status)}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span className="truncate text-[10px] font-semibold text-slate-600">
                      {item.patient_code}
                    </span>
                    <time className="whitespace-nowrap text-[9px] text-slate-400">
                      {formatDate(item.updated_at)}
                    </time>
                  </div>

                  <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        closed ? "bg-slate-300" : "bg-emerald-500"
                      }`}
                    />
                    <span
                      className="min-w-0 truncate text-[9px] font-medium text-slate-500"
                      title={stageLabel(item.current_stage)}
                    >
                      {stageLabel(item.current_stage)}
                    </span>
                  </div>

                  <p className="mt-1 truncate text-[9px] font-medium text-blue-600/80">
                    {item.case_code}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-[180px] items-center justify-center px-4 text-center">
            <div>
              <p className="text-[11px] font-semibold text-slate-500">
                표시할 Case가 없습니다.
              </p>
              <p className="mt-1 text-[9px] leading-4 text-slate-400">
                검색어 또는 상태 필터를 확인하세요.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Selected case footer */}
      <footer className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-3 py-2.5">
        <p className="text-[8px] font-semibold text-slate-400">
          현재 선택된 Case
        </p>

        {selectedCase ? (
          <button
            type="button"
            onClick={() => onSelect(selectedCase.id)}
            className="mt-1 flex w-full min-w-0 items-center justify-between gap-2 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-bold text-slate-700">
                {selectedCase.patient_name ||
                  selectedCase.patient_code}
              </span>
              <span className="mt-0.5 block truncate text-[9px] font-semibold text-blue-600">
                {selectedCase.case_code}
              </span>
            </span>

            <span
              aria-hidden="true"
              className="shrink-0 text-xs text-slate-400"
            >
              ›
            </span>
          </button>
        ) : (
          <p className="mt-1 text-[9px] text-slate-400">
            선택된 Case 없음
          </p>
        )}
      </footer>
    </aside>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${
        active
          ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-100"
          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      }`}
    >
      <span className="shrink-0 whitespace-nowrap leading-none">{label}</span>

      <span
        className={`inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none tabular-nums ${
          active
            ? "bg-white/20 text-white"
            : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
