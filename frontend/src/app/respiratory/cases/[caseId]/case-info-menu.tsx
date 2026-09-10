export type CaseInfoKey = "OVERVIEW" | "XRAY" | "CT" | "PATHOLOGY" | "STAGING" | "GENE" | "TREATMENT" | "PRESCRIPTION";

const ITEMS: { key: CaseInfoKey; label: string }[] = [
  { key: "OVERVIEW", label: "전체 요약" },
  { key: "XRAY", label: "흉부 X선" },
  { key: "CT", label: "흉부 CT" },
  { key: "PATHOLOGY", label: "병리" },
  { key: "STAGING", label: "TNM 검토" },
  { key: "GENE", label: "바이오마커" },
  { key: "TREATMENT", label: "치료 결정" },
  { key: "PRESCRIPTION", label: "처방" },
];

export function CaseInfoMenu({ selected, onSelect }: { selected: CaseInfoKey; onSelect: (key: CaseInfoKey) => void }) {
  return (
    <aside className="flex min-h-0 w-[165px] shrink-0 flex-col border-r border-slate-200 bg-white p-2">
      <h2 className="px-2 py-2 text-sm font-bold text-slate-900">정보 메뉴</h2>
      <nav className="space-y-1" aria-label="Case 정보 메뉴">
        {ITEMS.map((item) => (
          <button key={item.key} type="button" onClick={() => onSelect(item.key)} aria-current={selected === item.key ? "page" : undefined} className={`w-full whitespace-nowrap rounded-md px-3 py-2 text-left text-xs font-semibold transition ${selected === item.key ? "bg-blue-50 text-blue-700 shadow-[inset_3px_0_0_#2563eb]" : "text-slate-600 hover:bg-slate-50"}`}>{item.label}</button>
        ))}
      </nav>
      <div className="mt-auto rounded-lg border border-slate-200 p-3">
        <p className="text-xs font-bold text-slate-700">현재 Case 요약</p>
        <p className="mt-2 text-[10px] leading-5 text-slate-400">선택된 Case의 실제 정보만 표시합니다.</p>
      </div>
    </aside>
  );
}

export function getCaseInfoLabel(key: CaseInfoKey) {
  return ITEMS.find((item) => item.key === key)?.label ?? key;
}
