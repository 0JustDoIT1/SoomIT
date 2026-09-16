export function CaseWorkspaceEmpty({ errorMessage }: { errorMessage?: string }) {
  return <section className="mx-auto mt-10 max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <p className="text-xs font-semibold text-blue-600">Case 조회</p>
    <h1 className="mt-1 text-lg font-bold text-slate-900">Case 정보를 불러올 수 없습니다.</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">{errorMessage || "권한이 있는 실제 Case를 선택한 뒤 다시 시도해주세요."}</p>
  </section>;
}
