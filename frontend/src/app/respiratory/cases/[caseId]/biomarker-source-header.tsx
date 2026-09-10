export function BiomarkerSourceHeader() {
  return (
    <header className="col-span-2 flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-5 py-3">
      <div>
        <p className="text-[10px] font-semibold text-blue-600">바이오마커 결과</p>
        <h2 className="mt-0.5 text-lg font-bold text-slate-900">바이오마커 검사·결과</h2>
        <p className="mt-1 text-xs text-slate-600">전문과 확정 결과와 AI 분석 후보를 출처별로 구분해 확인합니다.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[10px] font-semibold" aria-label="바이오마커 결과 출처">
        <span className="whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">전문과 확정</span>
        <span className="whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">AI 분석 후보</span>
        <span className="whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">인증 연동 대기</span>
      </div>
    </header>
  );
}
