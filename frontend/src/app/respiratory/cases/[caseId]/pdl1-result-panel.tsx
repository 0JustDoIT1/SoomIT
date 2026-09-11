import { BiomarkerSourceHeader } from "./biomarker-source-header";

type Pdl1AiResult = {
  status_label: string;
  model_name: string;
  model_version_name: string;
  completed_at: string | null;
  result_detail: {
    pdl1?: {
      predicted_tps_range_label: string;
      confidence: string | number;
      probabilities: { class_0: number; class_1: number; class_2: number };
    };
  };
};

type Pdl1ClinicalResult = {
  result_date: string | null;
  result_detail: {
    pdl1?: {
      tps_percent: number | string | null;
      interpretation: string | null;
      note: string | null;
    };
  };
};

export function Pdl1ResultPanel({ aiResult, clinicalResult }: { aiResult: Pdl1AiResult | null; clinicalResult?: Pdl1ClinicalResult }) {
  const ai = aiResult?.result_detail.pdl1;
  const clinical = clinicalResult?.result_detail.pdl1;
  const confidence = ai ? Number(ai.confidence) * 100 : null;
  const probabilities = ai
    ? [ai.probabilities.class_0, ai.probabilities.class_1, ai.probabilities.class_2].map((value) => value * 100)
    : null;

  return (
    <div className="space-y-4">
      <BiomarkerSourceHeader />
      <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold text-slate-500">PD-L1 검사</p>
            <h2 className="mt-0.5 text-base font-bold text-slate-800">PD-L1 결과 비교</h2>
            <p className="mt-1 text-xs text-slate-400">전문과 확정 TPS와 AI 예측 구간을 서로 다른 출처로 표시합니다.</p>
          </div>
          {aiResult && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{aiResult.status_label}</span>}
        </header>

        {!aiResult && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            PD-L1 AI 결과는 인증 연결 전까지 조회할 수 없습니다. 전문과 확정 TPS는 임상 결과에서 계속 표시됩니다.
          </p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3">
          <ResultCard source="PD-L1 AI 분석 후보" label="예측 TPS 구간" value={ai?.predicted_tps_range_label ?? "인증 연동 대기"} tone="blue" />
          <ResultCard source="PD-L1 AI 분석 후보" label="분석 신뢰도" value={confidence !== null ? `${confidence.toFixed(2)}%` : "-"} tone="blue" />
          <ResultCard source="전문과 확정 결과" label="확정 TPS" value={clinical?.tps_percent !== null && clinical?.tps_percent !== undefined ? `${clinical.tps_percent}%` : "확정 결과 없음"} tone="emerald" />
        </div>

        {probabilities && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-slate-100 p-3">
            {["<1%", "1–49%", "≥50%"].map((label, index) => <ProbabilityCard key={label} label={label} value={probabilities[index]} />)}
          </div>
        )}

        <dl className="mt-3 space-y-2 rounded-xl bg-slate-50 px-4 py-3 text-xs">
          <Detail label="전문과 확정 해석" value={clinical?.interpretation ?? "확정 결과 없음"} />
          <Detail label="전문과 판독 소견" value={clinical?.note ?? "-"} />
          <Detail label="결과일" value={clinicalResult?.result_date ?? "-"} />
          <Detail label="AI 모델" value={aiResult ? `${aiResult.model_name} ${aiResult.model_version_name}` : "-"} />
          <Detail label="AI 분석 완료일" value={aiResult?.completed_at ?? "-"} />
        </dl>

        <p className="mt-3 text-[11px] leading-5 text-amber-700">
          AI 결과는 TPS 예측 구간이며 전문과 확정 결과는 실제 TPS 값입니다. 두 결과는 서로 대체되지 않습니다.
        </p>
      </section>
    </div>
  );
}

function ResultCard({ source, label, value, tone }: { source: string; label: string; value: string; tone: "blue" | "emerald" }) {
  const colors = tone === "blue" ? "border-blue-100 bg-blue-50/60 text-blue-700" : "border-emerald-100 bg-emerald-50/60 text-emerald-700";
  return <div className={`rounded-xl border p-4 ${colors}`}><p className="text-[10px] font-semibold">{source}</p><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>;
}

function ProbabilityCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-base font-bold text-slate-800">{value.toFixed(2)}%</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-slate-400">{label}</dt><dd className="min-w-0 break-words text-right font-medium text-slate-600">{value}</dd></div>;
}
