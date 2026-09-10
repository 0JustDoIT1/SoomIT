type OverviewCase = {
  case_code: string;
  patient_name: string;
  patient_code: string;
  current_stage: string;
  case_status: string;
  primary_doctor_name?: string | null;
  updated_at?: string | null;
};

export function CaseOverviewPanel({ caseData, clinicalResultCount, aiResultCount }: { caseData: OverviewCase; clinicalResultCount: number; aiResultCount: number }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="border-b border-slate-200 px-5 py-4"><h1 className="text-lg font-bold text-slate-900">전체 요약</h1><p className="mt-1 text-xs text-slate-400">선택된 Case와 현재 조회된 결과를 요약합니다.</p></header>
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
        <Summary label="환자" value={`${caseData.patient_name || "-"} · ${caseData.patient_code || "-"}`} />
        <Summary label="Case" value={caseData.case_code} />
        <Summary label="현재 단계" value={caseData.current_stage} />
        <Summary label="Case 상태" value={caseData.case_status} />
        <Summary label="담당의" value={caseData.primary_doctor_name} />
        <Summary label="전문과 결과" value={`${clinicalResultCount}건`} />
        <Summary label="AI 후보" value={`${aiResultCount}건`} />
        <Summary label="최근 업데이트" value={formatDate(caseData.updated_at)} />
      </div>
      {clinicalResultCount === 0 && aiResultCount === 0 && <p className="border-t border-slate-100 px-5 py-10 text-center text-sm text-slate-400">현재 조회된 전문과 결과와 AI 후보가 없습니다.</p>}
    </section>
  );
}

function Summary({ label, value }: { label: string; value?: string | null }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 truncate text-xs font-bold text-slate-700">{value || "-"}</p></div>;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}
