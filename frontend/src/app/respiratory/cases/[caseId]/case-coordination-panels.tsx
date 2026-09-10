type ClinicianDecision = {
  source_stage: string;
  decision_type: string;
  target_stage: string | null;
  reason: string | null;
  decided_by: string;
  decided_at: string;
};

export function CaseCoordinationPanels({ decision }: { decision?: ClinicianDecision | null }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-emerald-700">호흡기내과 최종 판단</p>
            <h2 className="mt-1 text-base font-bold text-slate-900">단계 진행 결정</h2>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">저장 API 연동 대기</span>
        </div>

        {decision ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs">
            <DecisionValue label="검토 단계" value={decision.source_stage} />
            <DecisionValue label="진행 결정" value={decision.decision_type} />
            <DecisionValue label="다음 단계" value={decision.target_stage || "-"} />
            <DecisionValue label="확정자" value={decision.decided_by || "-"} />
            <div className="col-span-2"><DecisionValue label="판단 근거" value={decision.reason || "-"} /></div>
            <div className="col-span-2"><DecisionValue label="확정 시각" value={formatDateTime(decision.decided_at)} /></div>
          </dl>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">저장된 clinician decision이 없습니다.</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">진행 결정<select disabled className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500"><option>API 연동 대기</option></select></label>
          <label className="text-xs text-slate-500">다음 단계<select disabled className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500"><option>API 연동 대기</option></select></label>
        </div>
        <textarea disabled rows={3} placeholder="판단 및 핵심 근거" className="mt-3 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm placeholder:text-slate-400" />
        <div className="mt-3 grid grid-cols-2 gap-2"><button disabled className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-400">결정 검토</button><button disabled className="rounded-lg bg-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-400">결정 저장</button></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-semibold text-sky-700">검사 요청</p><h2 className="mt-1 text-base font-bold text-slate-900">Examination order</h2></div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">API 연동 대기</span>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">검사 종류·목적·임상 소견·우선순위를 입력하고 기존 오더와 중복 여부를 확인한 뒤 확정하는 영역입니다.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">검사 종류<select disabled className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500"><option>조회·생성 API 필요</option></select></label>
          <label className="text-xs text-slate-500">우선순위<select disabled className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-500"><option>NORMAL / URGENT</option></select></label>
        </div>
        <input disabled placeholder="검사 목적" className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm placeholder:text-slate-400" />
        <textarea disabled rows={2} placeholder="임상 소견" className="mt-3 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm placeholder:text-slate-400" />
        <div className="mt-3 grid grid-cols-2 gap-2"><button disabled className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-400">중복 확인</button><button disabled className="rounded-lg bg-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-400">오더 확정</button></div>
      </section>
    </div>
  );
}

function DecisionValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-slate-700">{value}</dd></div>;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}
