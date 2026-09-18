export type CaseInfoKey = "OVERVIEW" | "XRAY" | "CT" | "PATHOLOGY_GENE" | "PET_CT_TNM" | "PDL1" | "TREATMENT" | "PRESCRIPTION" | "AI_SUMMARY";

const ITEMS: { key: CaseInfoKey; label: string; separated?: boolean }[] = [
  { key: "OVERVIEW", label: "전체 요약" },
  { key: "XRAY", label: "흉부 X선" },
  { key: "CT", label: "흉부 CT" },
  { key: "PET_CT_TNM", label: "PET-CT / TNM 병기" },
  { key: "PATHOLOGY_GENE", label: "조직/유전자" },
  { key: "PDL1", label: "PD-L1" },
  { key: "TREATMENT", label: "치료 결정" },
  { key: "PRESCRIPTION", label: "처방" },
  { key: "AI_SUMMARY", label: "AI 종합 분석", separated: true },
];
const WORKFLOW_STAGES: CaseInfoKey[] = ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "PRESCRIPTION"];

export function CaseInfoMenu({ selected, currentStage, onSelect }: { selected: CaseInfoKey; currentStage?: string; onSelect: (key: CaseInfoKey) => void }) {
  const currentIndex = WORKFLOW_STAGES.indexOf(currentStage as CaseInfoKey);
  return (
    <aside className="flex min-h-0 w-[128px] shrink-0 flex-col border-r border-slate-200 bg-[#fbfdff] py-3">
      <div className="mx-2.5 border-b border-slate-200 pb-2.5">
        <p className="text-[10px] font-bold tracking-[0.12em] text-blue-600">CASE WORKSPACE</p>
        <h2 className="mt-1 text-[15px] font-bold tracking-tight text-slate-900">진료 정보</h2>
      </div>
      <nav className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto px-2 [scrollbar-gutter:stable]" aria-label="Case 정보 메뉴">
        {ITEMS.map((item) => (
          (() => {
            const itemIndex = WORKFLOW_STAGES.indexOf(item.key);
            const locked = itemIndex >= 0 && currentIndex >= 0 && itemIndex > currentIndex;
            const isCurrent = item.key === currentStage;
            return <button key={item.key} type="button" disabled={locked} title={locked ? "이전 단계의 확정 및 다음 단계 진행이 필요합니다." : undefined} onClick={() => onSelect(item.key)} aria-current={selected === item.key ? "page" : undefined} className={`group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left text-[11px] font-semibold transition ${locked ? "cursor-not-allowed text-slate-300" : isCurrent ? "bg-blue-600 text-white shadow-sm shadow-blue-200" : selected === item.key ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}>
            <CaseInfoIcon value={item.key} />
            <span className="min-w-0 leading-4">{item.label}</span>
            {isCurrent && <span aria-hidden="true" className="absolute -left-2 h-5 w-0.5 rounded-r bg-blue-700" />}
            {isCurrent && <span className="ml-auto text-[8px] font-bold">현재</span>}
          </button>;
          })()
        ))}
      </nav>
      <div className="mt-auto mx-2.5 border-t border-slate-200 pt-2.5">
        <p className="text-[10px] leading-4 text-slate-400">항목을 선택하면 현재 Case의 실제 결과를 확인합니다.</p>
      </div>
    </aside>
  );
}

function CaseInfoIcon({ value }: { value: CaseInfoKey }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
    {value === "OVERVIEW" && <><rect {...common} x="4" y="4" width="16" height="16" rx="2" /><path {...common} d="M8 9h8M8 13h8M8 17h5" /></>}
    {value === "XRAY" && <><path {...common} d="M7 3v18M17 3v18M4 8c3 2 5 2 8 0s5-2 8 0M4 16c3-2 5-2 8 0s5 2 8 0" /></>}
    {value === "CT" && <><circle {...common} cx="12" cy="12" r="8" /><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M12 4v2M12 18v2M4 12h2M18 12h2" /></>}
    {value === "PET_CT_TNM" && <><circle {...common} cx="7" cy="7" r="2" /><circle {...common} cx="17" cy="7" r="2" /><circle {...common} cx="12" cy="17" r="2" /><path {...common} d="m8.5 8.5 2.2 6M15.5 8.5l-2.2 6M9 7h6" /></>}
    {value === "PATHOLOGY_GENE" && <><path {...common} d="M8 4h8M8 20h8M9 4c0 4 6 4 6 8s-6 4-6 8M15 4c0 4-6 4-6 8s6 4 6 8" /></>}
    {value === "PDL1" && <><path {...common} d="M7 4h10v5c0 5-5 8-5 8S7 14 7 9V4Z" /><path {...common} d="M9.5 10.5h5M12 8v5" /></>}
    {value === "TREATMENT" && <><path {...common} d="m7 7 10 10M17 7 7 17M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>}
    {value === "PRESCRIPTION" && <><rect {...common} x="5" y="4" width="14" height="16" rx="2" /><path {...common} d="M9 4v3h6V4M9 12h6M9 16h4" /></>}
    {value === "AI_SUMMARY" && <><path {...common} d="m12 3 1.5 5.2L19 10l-5.5 1.8L12 17l-1.5-5.2L5 10l5.5-1.8L12 3Z" /><path {...common} d="m18 16 .6 2.1L21 19l-2.4.9L18 22l-.6-2.1L15 19l2.4-.9L18 16Z" /></>}
  </svg>;
}

export function getCaseInfoLabel(key: CaseInfoKey) {
  return ITEMS.find((item) => item.key === key)?.label ?? key;
}
