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

export function CaseInfoMenu({ selected, onSelect }: { selected: CaseInfoKey; onSelect: (key: CaseInfoKey) => void }) {
  return (
    <aside className="flex min-h-0 w-[165px] shrink-0 flex-col border-r border-slate-200 bg-white p-2">
      <h2 className="px-2 py-2 text-sm font-bold text-slate-900">진료 정보</h2>
      <nav className="space-y-1" aria-label="Case 정보 메뉴">
        {ITEMS.map((item) => (
          <div key={item.key} className={item.separated ? "mt-2 border-t border-slate-200 pt-2" : undefined}>
            <button type="button" onClick={() => onSelect(item.key)} aria-current={selected === item.key ? "page" : undefined} className={`w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-xs font-semibold transition ${selected === item.key ? "bg-blue-50 text-blue-700 shadow-[inset_3px_0_0_#2563eb]" : "text-slate-600 hover:bg-slate-50"}`}>{item.label}</button>
          </div>
        ))}
      </nav>
      <div className="mt-auto rounded-lg border border-slate-200 p-3">
        <p className="text-xs font-bold text-slate-700">현재 Case</p>
        <p className="mt-2 text-[10px] leading-5 text-slate-400">선택한 Case의 실제 정보만 표시합니다.</p>
      </div>
    </aside>
  );
}

export function getCaseInfoLabel(key: CaseInfoKey) {
  return ITEMS.find((item) => item.key === key)?.label ?? key;
}
