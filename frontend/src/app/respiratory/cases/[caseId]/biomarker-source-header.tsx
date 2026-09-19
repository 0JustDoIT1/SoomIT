export function BiomarkerSourceHeader() {
  return (
    <header className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-3">
      <div>
        <p className="text-[10px] font-semibold text-blue-600">PD-L1 바이오마커</p>
        <h2 className="mt-0.5 text-lg font-bold text-slate-900">PD-L1 검사·결과</h2>
        <p className="mt-1 text-xs text-slate-600">병리과 검토 TPS와 PD-L1 AI 예측 구간을 구분해 확인하며, 호흡기내과 확정 후 최종 TPS를 표시합니다.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[10px] font-semibold" aria-label="PD-L1 결과 출처">
        <span className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">병리과 검토</span>
        <span className="whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">AI 분석 후보</span>
      </div>
    </header>
  );
}
