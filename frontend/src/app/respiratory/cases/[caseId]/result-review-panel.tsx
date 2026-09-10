import { EvidenceViewerPanel } from "./evidence-viewer-panel";

type ResultRecord = Record<string, unknown>;
type ClinicalResult = { exam_type: string; exam_name?: string; result_status?: string; result_status_label?: string; result_date?: string | null; result_detail?: unknown };
type AiResult = { analysis_type: string; analysis_type_label?: string; status?: string; status_label?: string; model_name?: string; model_version_name?: string; completed_at?: string | null; result_detail?: unknown };

const STAGE_LABELS: Record<string, string> = { XRAY: "흉부 X선", CT: "흉부 CT", PATHOLOGY: "병리", STAGING: "TNM 병기", GENE: "바이오마커" };

export function ResultReviewPanel({ stage, clinicalResult, aiResult, clinicalError, aiError, onRetry }: { stage: string; clinicalResult?: ClinicalResult; aiResult?: AiResult; clinicalError?: string; aiError?: string; onRetry?: () => void }) {
  const specialistValues = getSpecialistValues(stage, clinicalResult?.result_detail);
  const aiValues = getAiValues(stage, aiResult?.result_detail);
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-emerald-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-100 px-5 py-4">
          <div><p className="text-xs font-semibold text-emerald-700">1순위 · 전문과 의료진 확정 결과</p><h2 className="mt-1 text-lg font-bold text-slate-900">{STAGE_LABELS[stage] ?? "선택 단계"} 결과</h2></div>
          <div className="text-right text-xs"><p className="font-semibold text-emerald-700">{clinicalResult?.result_status_label ?? clinicalResult?.result_status ?? "결과 없음"}</p><p className="mt-1 text-slate-400">{formatDateTime(clinicalResult?.result_date)}</p></div>
        </header>
        {clinicalError ? <PanelError message={clinicalError} onRetry={onRetry} /> : specialistValues.length > 0 ? <ResultValues values={specialistValues} accent="specialist" /> : <EmptyResult text="확인 가능한 전문과 확정 결과가 없습니다." />}
      </section>
      <section className="rounded-2xl border border-sky-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-sky-100 px-5 py-4">
          <div><p className="text-xs font-semibold text-sky-700">2순위 · AI 보조 근거</p><h2 className="mt-1 text-base font-bold text-slate-900">AI 분석 후보</h2><p className="mt-1 text-xs text-slate-400">의료진 확정 결과가 아니며 최종 판단의 참고 자료입니다.</p></div>
          <div className="text-right text-xs"><p className="font-semibold text-sky-700">{aiResult?.status_label ?? aiResult?.status ?? "결과 없음"}</p><p className="mt-1 text-slate-400">{[aiResult?.model_name, aiResult?.model_version_name].filter(Boolean).join(" · ") || "모델 정보 없음"}</p></div>
        </header>
        {aiError ? <PanelError message={aiError} onRetry={onRetry} /> : aiValues.length > 0 ? <ResultValues values={aiValues} accent="ai" /> : <EmptyResult text="현재 단계에 연결된 AI 후보 결과가 없습니다." />}
      </section>
      <div className="overflow-x-auto"><EvidenceViewerPanel /></div>
    </div>
  );
}

function ResultValues({ values, accent }: { values: [string, string][]; accent: "specialist" | "ai" }) {
  return <dl className="grid grid-cols-2 gap-3 p-5">{values.map(([label, value]) => <div key={label} className={`rounded-xl px-4 py-3 ${accent === "specialist" ? "bg-emerald-50/60" : "bg-sky-50/60"}`}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</dd></div>)}</dl>;
}
function EmptyResult({ text }: { text: string }) { return <div className="px-5 py-12 text-center text-sm text-slate-400">{text}</div>; }
function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div role="alert" className="flex items-center justify-between gap-4 bg-rose-50 px-5 py-4 text-sm text-rose-700"><span>{message}</span><button type="button" onClick={onRetry} className="whitespace-nowrap rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold">이 패널 다시 시도</button></div>; }

function getSpecialistValues(stage: string, detail: unknown): [string, string][] {
  const root = asRecord(detail); if (!root) return [];
  const sectionKey = stage === "XRAY" ? "xray" : stage === "CT" ? "ct" : stage === "PATHOLOGY" ? "pathology" : stage === "STAGING" ? "tnm" : stage === "GENE" ? "gene" : "";
  const section = asRecord(root[sectionKey]); if (!section) return [];
  const fields: Record<string, [string, string][]> = {
    XRAY: [["판정", "assessment_label"], ["주요 소견", "finding_summary"], ["권고", "recommended_action"]],
    CT: [["종합 판정", "overall_assessment_label"], ["악성 위험도", "overall_malignancy_risk"], ["주요 소견", "finding_summary"]],
    PATHOLOGY: [["악성 여부", "malignancy_status_label"], ["조직형", "histologic_type"], ["아형", "subtype"], ["진단 요약", "diagnosis_summary"]],
    STAGING: [["확정 T", "t_category"], ["확정 N", "n_category"], ["확정 M", "m_category"], ["확정 Stage Group", "stage_group"], ["의료진 소견", "note"]],
    GENE: [["종합 해석", "interpretation"], ["추가 검사 권고", "additional_test_recommended"]],
  };
  const values = pickValues(section, fields[stage] ?? []);
  if (stage === "GENE") { const pdl1 = asRecord(root.pdl1); if (pdl1) values.push(...pickValues(pdl1, [["확정 PD-L1 TPS", "tps_percent"], ["PD-L1 해석", "interpretation"], ["PD-L1 소견", "note"]])); }
  return values;
}

function getAiValues(stage: string, detail: unknown): [string, string][] {
  const root = asRecord(detail); if (!root) return [];
  const sectionKey = stage === "XRAY" ? "xray" : stage === "CT" ? "ct" : stage === "PATHOLOGY" ? "pathology" : stage === "STAGING" ? "tnm" : "";
  const section = asRecord(root[sectionKey]); if (!section) return [];
  const fields: Record<string, [string, string][]> = {
    XRAY: [["AI 판정 후보", "assessment_label"], ["의심 점수", "suspicion_score"]], CT: [["AI 악성 위험도", "overall_malignancy_risk"]],
    PATHOLOGY: [["AI 악성 판정 후보", "malignancy_assessment_label"], ["악성 확률", "malignancy_probability"], ["조직형 후보", "predicted_histologic_type"], ["아형 후보", "predicted_subtype"], ["아형 confidence", "subtype_confidence"]],
    STAGING: [["T 후보", "predicted_t"], ["N 후보", "predicted_n"], ["M 후보", "predicted_m"], ["Stage Group 후보", "predicted_stage_group"], ["confidence", "confidence"]],
  };
  return pickValues(section, fields[stage] ?? []);
}
function pickValues(source: ResultRecord, fields: [string, string][]): [string, string][] { return fields.flatMap(([label, key]) => { const value = source[key]; if (value === null || value === undefined || value === "") return []; return [[label, typeof value === "boolean" ? (value ? "예" : "아니요") : String(value)]]; }); }
function asRecord(value: unknown): ResultRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as ResultRecord : null; }
function formatDateTime(value?: string | null) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR"); }
