import { BiomarkerSourceHeader } from "./biomarker-source-header";
import { CaseWsiEvidence } from "./case-wsi-evidence";

type Pdl1AiResult = {
  status_label?: string;
  model_name?: string;
  model_version_name?: string;
  model_components?: unknown;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  input_context?: {
    schema_version?: string | null;
    examination_order?: { id?: string; order_type?: string; order_type_label?: string } | null;
    source_asset?: { image_type?: string; workflow_stage?: string; study_instance_uid?: string | null; series_instance_uid?: string | null; acquired_at?: string | null } | null;
    metadata?: { wsi_id?: string; roi_layer?: string };
  };
  result_detail: {
    pdl1: {
      predicted_tps_range_label?: string;
      confidence?: string | number;
      probabilities?: { class_0?: number | string; class_1?: number | string; class_2?: number | string };
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

export function Pdl1ResultPanel({
  aiResult,
  clinicalResult,
  aiError = "",
  retrying = false,
  onRetry,
  caseId,
  apiBaseUrl,
  authorizedFetch,
  showSourceHeader = true,
}: {
  aiResult: Pdl1AiResult | null;
  clinicalResult?: Pdl1ClinicalResult;
  aiError?: string;
  retrying?: boolean;
  onRetry?: () => void;
  caseId?: string;
  apiBaseUrl?: string;
  authorizedFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  showSourceHeader?: boolean;
}) {
  const ai = aiResult?.result_detail.pdl1;
  const clinical = clinicalResult?.result_detail.pdl1;
  const confidenceValue = ai?.confidence === undefined ? null : Number(ai.confidence);
  const confidence = confidenceValue !== null && Number.isFinite(confidenceValue) ? confidenceValue * 100 : null;
  const probabilities = ai?.probabilities
    ? [ai.probabilities.class_0, ai.probabilities.class_1, ai.probabilities.class_2].map(toPercentage)
    : null;

  return (
    <div className="space-y-4">
      {showSourceHeader && <BiomarkerSourceHeader />}
      {caseId && apiBaseUrl && authorizedFetch && <CaseWsiEvidence caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} stain="PDL1" />}
      <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold text-slate-500">PD-L1 검사</p>
            <h2 className="mt-0.5 text-base font-bold text-slate-800">PD-L1 결과 비교</h2>
            <p className="mt-1 text-xs text-slate-400">전문과 확정 TPS와 AI 예측 구간을 서로 다른 출처로 표시합니다.</p>
          </div>
          {aiResult?.status_label && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{aiResult.status_label}</span>}
        </header>

        {aiError && (
          <div role="alert" className="mx-5 mt-4 flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            <span>{aiError}</span>
            {onRetry && (
              <button type="button" disabled={retrying} onClick={onRetry} className="whitespace-nowrap rounded-md border border-rose-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-50">
                {retrying ? "재시도 중" : "PD-L1 결과 다시 시도"}
              </button>
            )}
          </div>
        )}

        {!aiResult && !aiError && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            현재 Case에서 조회된 PD-L1 AI 분석 결과가 없습니다. 전문과 확정 TPS가 있으면 임상 결과에서 별도로 표시됩니다.
          </p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-3">
          <ResultCard source="PD-L1 AI 분석 후보" label="예측 TPS 구간" value={ai?.predicted_tps_range_label ?? "AI 결과 없음"} tone="blue" />
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
          <Detail label="AI 모델" value={[aiResult?.model_name, aiResult?.model_version_name].filter(Boolean).join(" ") || "-"} />
          <Detail label="모델 구성" value={formatModelComponents(aiResult?.model_components) || "-"} />
          <Detail label="AI 분석 완료일" value={aiResult?.completed_at ?? "-"} />
        </dl>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
          <p className="font-semibold text-slate-700">분석 입력 추적</p>
          <dl className="mt-2 space-y-2"><Detail label="입력 검사" value={formatPdl1Input(aiResult?.input_context).order} /><Detail label="입력 영상" value={formatPdl1Input(aiResult?.input_context).asset} /><Detail label="Study UID" value={aiResult?.input_context?.source_asset?.study_instance_uid ?? "-"} /><Detail label="WSI / ROI" value={formatPdl1Input(aiResult?.input_context).metadata} /><Detail label="Schema" value={aiResult?.input_context?.schema_version ?? "-"} /></dl>
        </div>

        {aiResult?.error_message && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{aiResult.error_message}</p>}

        <p className="mt-3 text-[11px] leading-5 text-amber-700">
          AI 결과는 TPS 예측 구간이며 전문과 확정 결과는 실제 TPS 값입니다. 두 결과는 서로 대체되지 않습니다.
        </p>
      </section>
    </div>
  );
}

function toPercentage(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number * 100 : null;
}

function ResultCard({ source, label, value, tone }: { source: string; label: string; value: string; tone: "blue" | "emerald" }) {
  const colors = tone === "blue" ? "border-blue-100 bg-blue-50/60 text-blue-700" : "border-emerald-100 bg-emerald-50/60 text-emerald-700";
  return <div className={`rounded-xl border p-4 ${colors}`}><p className="text-[10px] font-semibold">{source}</p><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>;
}

function ProbabilityCard({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-base font-bold text-slate-800">{value === null ? "-" : `${value.toFixed(2)}%`}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-slate-400">{label}</dt><dd className="min-w-0 break-words text-right font-medium text-slate-600">{value}</dd></div>;
}

function formatPdl1Input(context: Pdl1AiResult["input_context"]) {
  const order = context?.examination_order;
  const asset = context?.source_asset;
  const metadata = context?.metadata;
  return {
    order: [order?.order_type_label ?? order?.order_type, order?.id && `#${order.id.slice(0, 8)}`].filter(Boolean).join(" · ") || "-",
    asset: [asset?.image_type, asset?.workflow_stage, asset?.series_instance_uid && `Series ${asset.series_instance_uid}`].filter(Boolean).join(" · ") || "-",
    metadata: [metadata?.wsi_id && `WSI ${metadata.wsi_id}`, metadata?.roi_layer && `ROI ${metadata.roi_layer}`].filter(Boolean).join(" · ") || "-",
  };
}

function formatModelComponents(value: unknown) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" || typeof item === "number").map(String).join(" · ");
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item) : "configured"}`).join(" · ");
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
