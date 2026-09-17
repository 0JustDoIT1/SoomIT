"use client";

import { useState } from "react";
import { getStageLabel } from "./case-workflow-header";
import { getCaseStatusLabel } from "./clinical-display-labels";

type CaseListItem = {
  id: string;
  patient_name: string;
  patient_code: string;
  case_code: string;
  current_stage: string;
  case_status: string;
  updated_at: string;
};

type Props = {
  cases: CaseListItem[];
  selectedId: string;
  searchText: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
};

export function CasePatientSidebar({ cases, selectedId, searchText, onSearchChange, onSelect }: Props) {
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "CLOSED">("ALL");
  const visibleCases = cases.filter((item) => statusFilter === "ALL" || item.case_status === statusFilter);
  const counts = {
    ALL: cases.length,
    ACTIVE: cases.filter((item) => item.case_status === "ACTIVE").length,
    CLOSED: cases.filter((item) => item.case_status === "CLOSED").length,
  };
  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-r border-slate-200 bg-white shadow-[2px_0_12px_rgba(15,23,42,0.03)]">
      <div className="shrink-0 border-b border-slate-100 p-3">
        <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold tracking-[0.12em] text-blue-600">MY CASES</p><h2 className="mt-1 text-base font-bold text-slate-900">담당 환자</h2></div><span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{cases.length}</span></div>
        <input type="search" value={searchText} onChange={(event) => onSearchChange(event.target.value)} placeholder="환자명, 환자번호, Case 검색" aria-label="담당 환자 검색" className="mt-3 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />
        <div className="mt-3 grid grid-cols-3 gap-1">
          {([ ["ALL", "전체"], ["ACTIVE", "진행 중"], ["CLOSED", "종결"] ] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setStatusFilter(value)} aria-pressed={statusFilter === value} className={`whitespace-nowrap rounded-md px-1 py-2 text-[11px] font-semibold transition ${statusFilter === value ? "bg-blue-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50"}`}>{label} {counts[value]}</button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/60 p-2 [scrollbar-gutter:stable]">
        {visibleCases.map((item) => (
          <button key={item.id} type="button" onClick={() => onSelect(item.id)} aria-current={item.id === selectedId ? "true" : undefined} className={`w-full rounded-xl border px-3 py-3 text-left transition ${item.id === selectedId ? "border-blue-300 bg-blue-50 shadow-[inset_3px_0_0_#2563eb,0_4px_12px_rgba(37,99,235,0.08)]" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-white hover:shadow-sm"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-bold text-slate-900">{item.patient_name || "-"}</p>
              <span className={`whitespace-nowrap rounded-md px-1.5 py-1 text-[10px] font-semibold ${item.case_status === "ACTIVE" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{getCaseStatusLabel(item.case_status)}</span>
            </div>
            <p className="mt-2 truncate text-xs font-medium text-slate-600">{item.patient_code || "-"}</p>
            <p className="mt-1 truncate text-[11px] text-slate-500">{getStageLabel(item.current_stage)} <span className="mx-1 text-slate-300">│</span> {formatDate(item.updated_at)}</p>
            <p className="mt-1 truncate text-[10px] text-slate-400">{item.case_code || "-"}</p>
          </button>
        ))}
        {visibleCases.length === 0 && <p className="py-10 text-center text-xs text-slate-500">조건에 맞는 Case가 없습니다.</p>}
      </div>
      <div className="border-t border-slate-200 bg-white p-3 text-xs text-slate-600">현재 선택된 Case <span className="mt-1 block truncate font-bold text-blue-700">{cases.find((item) => item.id === selectedId)?.case_code || "-"}</span></div>
    </aside>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "-" : date.toLocaleDateString("ko-KR");
}
