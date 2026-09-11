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
  return (
    <aside className="flex h-full min-h-0 w-[235px] shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
      <div className="shrink-0 border-b border-slate-100 p-3">
        <h2 className="text-sm font-bold text-slate-900">담당 환자</h2>
        <input type="search" value={searchText} onChange={(event) => onSearchChange(event.target.value)} placeholder="환자명, 환자번호, Case 검색" className="mt-2 h-8 w-full rounded-md border border-slate-200 px-2.5 text-[11px] outline-none focus:border-blue-400" />
        <div className="mt-2 grid grid-cols-3 gap-1">
          {["전체", "검토 필요", "진행 중"].map((label, index) => (
            <button key={label} type="button" disabled={index > 0} className={`whitespace-nowrap rounded px-1.5 py-1.5 text-[10px] font-semibold ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-300"}`}>{label}</button>
          ))}
        </div>
        <p className="mt-1.5 truncate text-[9px] text-slate-400">상태 필터는 규칙 API 연동 후 활성화됩니다.</p>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-scroll p-2 [scrollbar-gutter:stable]">
        {cases.map((item) => (
          <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={`w-full rounded-md border px-3 py-2.5 text-left ${item.id === selectedId ? "border-blue-400 bg-blue-50 shadow-[inset_3px_0_0_#2563eb]" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[11px] font-bold text-slate-800">{item.patient_name || "-"}</p>
              <span className="whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">{getCaseStatusLabel(item.case_status)}</span>
            </div>
            <p className="mt-1 truncate text-[10px] text-slate-500">{item.patient_code || "-"} · {item.case_code || "-"}</p>
            <p className="mt-0.5 truncate text-[9px] text-slate-400">{getStageLabel(item.current_stage)} · {formatDate(item.updated_at)}</p>
          </button>
        ))}
        {cases.length === 0 && <p className="py-10 text-center text-xs text-slate-400">검색 결과가 없습니다.</p>}
      </div>
    </aside>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "-" : date.toLocaleDateString("ko-KR");
}
