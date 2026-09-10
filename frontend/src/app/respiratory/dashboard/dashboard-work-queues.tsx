const STAGES = ["XRAY", "CT", "PATHOLOGY", "STAGING", "GENE", "TREATMENT", "PRESCRIPTION"] as const;

type DashboardCase = {
  current_stage: string;
  case_status: string;
};

export function DashboardWorkQueues({ cases, error }: { cases: DashboardCase[]; error?: string }) {
  const stageCounts = Object.fromEntries(STAGES.map((stage) => [stage, cases.filter((item) => item.current_stage === stage).length]));

  return (
    <div className="mb-6 space-y-4">
      {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">실제 Case 데이터를 불러오지 못했습니다. 백엔드 연결과 공통 인증을 확인해 주세요.</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="font-bold text-slate-900">단계별 진행 Case</h2><p className="mt-1 text-xs text-slate-400">Case의 실제 current_stage 기준</p></div>
          <span className="text-xs text-slate-400">조회 {cases.length}건</span>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {STAGES.map((stage) => <div key={stage} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"><p className="text-[11px] font-semibold text-slate-500">{stage}</p><p className="mt-2 text-xl font-bold text-slate-800">{stageCounts[stage]}</p></div>)}
        </div>
      </section>

      <section className="grid grid-cols-4 gap-3">
        <UnavailableMetric label="의료진 검토 대기" source="clinical result 상태 필요" />
        <UnavailableMetric label="신규 결과 도착" source="결과 확인 시각 필요" />
        <UnavailableMetric label="재검 필요" source="clinician decisions 목록 필요" />
        <UnavailableMetric label="지연·실패" source="오더·분석 상태 필요" />
        <UnavailableMetric label="REFERRED_OUT" source="전체 Case 상태 조회 필요" />
        <UnavailableMetric label="치료 결정 대기" source="treatment decisions 상태 필요" />
        <UnavailableMetric label="처방 확정 대기" source="prescriptions 상태 필요" />
        <UnavailableMetric label="검사 오더 대기" source="examination orders API 필요" />
      </section>
    </div>
  );
}

function UnavailableMetric({ label, source }: { label: string; source: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-semibold text-slate-700">{label}</p><p className="mt-3 text-2xl font-bold text-slate-300">—</p><p className="mt-2 text-[11px] text-amber-700">{source}</p></div>;
}
