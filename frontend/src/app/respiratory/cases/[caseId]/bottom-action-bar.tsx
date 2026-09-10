export function BottomActionBar() {
  const reasonId = "tnm-action-api-unavailable";
  return <footer className="z-20 -mx-2 flex h-[52px] items-center justify-between border-t border-slate-200 bg-white px-5"><div><p className="text-xs font-bold text-slate-700">현재 작업: T·N·M 개별 검토</p><p id={reasonId} className="text-[10px] text-slate-400">TNM 개별 소견 저장·확정 API가 연결된 후 사용할 수 있습니다.</p></div><div className="flex gap-2">{["임시 저장", "선택 항목 개별 확정", "최종 TNM 확정"].map((label) => <button key={label} type="button" disabled aria-describedby={reasonId} className="whitespace-nowrap rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-400">{label}</button>)}</div></footer>;
}
