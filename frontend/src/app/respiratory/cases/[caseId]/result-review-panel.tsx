import { EvidenceViewerPanel } from "./evidence-viewer-panel";

type ResultRecord = Record<string, unknown>;
type ClinicalResult = { exam_type: string; exam_name?: string; result_status?: string; result_status_label?: string; result_date?: string | null; result_detail?: unknown };
type AiResult = { analysis_type: string; analysis_type_label?: string; status?: string; status_label?: string; model_name?: string; model_version_name?: string; completed_at?: string | null; result_detail?: unknown };

const STAGE_CONFIG: Record<string, { title: string; description: string; department: string }> = {
  XRAY: { title: "흉부 X선 검사·결과", description: "영상의학과 판독 결과를 먼저 확인하고 AI 후보를 보조 근거로 검토합니다.", department: "영상의학과" },
  CT: { title: "흉부 CT 검사·결과", description: "영상의학과 CT 판독 결과와 AI 분석 후보 및 원본 영상 근거를 확인합니다.", department: "영상의학과" },
  PATHOLOGY: { title: "병리 검사·결과", description: "병리과 확정 결과와 병리 AI 후보 및 원본 병리 근거를 확인합니다.", department: "병리과" },
};

export function ResultReviewPanel({ stage, clinicalResult, aiResult, clinicalError, aiError, onRetry }: { stage: string; clinicalResult?: ClinicalResult; aiResult?: AiResult; clinicalError?: string; aiError?: string; onRetry?: () => void }) {
  const specialistValues = getSpecialistValues(stage, clinicalResult?.result_detail);
  const aiValues = getAiValues(stage, aiResult?.result_detail);
  const config = STAGE_CONFIG[stage] ?? { title: "검사·결과", description: "전문과 확정 결과와 AI 분석 후보를 구분해 확인합니다.", department: "전문과" };
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-blue-600">검사 결과</p>
          <h1 className="mt-0.5 text-lg font-bold text-slate-900">{config.title}</h1>
          <p className="mt-1 text-xs text-slate-600">{config.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge label="전문과" value={clinicalResult?.result_status_label ?? clinicalResult?.result_status} tone="specialist" />
          <StatusBadge label="AI" value={aiResult?.status_label ?? aiResult?.status} tone="ai" />
        </div>
      </header>

      <div className="grid grid-cols-2 divide-x divide-slate-200">
        <SourcePanel eyebrow={config.department} title="전문과 확정 결과" meta={formatDateTime(clinicalResult?.result_date)} tone="specialist">
          {clinicalError ? <PanelError message={clinicalError} onRetry={onRetry} /> : specialistValues.length > 0 ? <ResultValues values={specialistValues} accent="specialist" /> : <EmptyResult title="확정 결과 없음" text="확인 가능한 전문과 확정 결과가 없습니다. 결과가 확정되면 판독과·판독자·확정 시각과 핵심 소견이 표시됩니다." />}
        </SourcePanel>
        <SourcePanel eyebrow="AI 분석" title="AI 분석 후보" meta={[aiResult?.model_name, aiResult?.model_version_name].filter(Boolean).join(" · ") || "모델 정보 없음"} tone="ai">
          {aiError ? <PanelError message={aiError} onRetry={onRetry} /> : aiValues.length > 0 ? <ResultValues values={aiValues} accent="ai" /> : <EmptyResult title="AI 후보 없음" text="현재 검사에 연결된 AI 분석 후보가 없습니다." />}
        </SourcePanel>
      </div>

      <div className="border-t border-slate-200 bg-slate-50/50 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-semibold text-slate-500">원본 근거</p><h2 className="mt-0.5 text-sm font-bold text-slate-800">원본 영상 및 근거</h2></div>
          <p className="whitespace-nowrap text-[10px] text-slate-400">원본 영상은 전체 화면 영상 보기에서 확인합니다.</p>
        </div>
        <div className="overflow-x-auto"><EvidenceViewerPanel /></div>
      </div>
    </section>
  );
}

function SourcePanel({ eyebrow, title, meta, tone, children }: { eyebrow: string; title: string; meta: string; tone: "specialist" | "ai"; children: React.ReactNode }) {
  return <section className="min-w-0"><header className={`flex min-h-[74px] items-start justify-between gap-3 border-b px-4 py-3 ${tone === "specialist" ? "border-emerald-100 bg-emerald-50/30" : "border-blue-100 bg-blue-50/30"}`}><div><p className={`text-[10px] font-semibold ${tone === "specialist" ? "text-emerald-700" : "text-blue-700"}`}>{eyebrow}</p><h2 className="mt-1 text-sm font-bold text-slate-900">{title}</h2>{tone === "ai" && <p className="mt-1 text-[10px] text-slate-400">의료진 확정 결과가 아닌 참고 자료입니다.</p>}</div><p className="max-w-40 truncate text-right text-[10px] text-slate-400">{meta}</p></header><div className="min-h-[190px]">{children}</div></section>;
}

function StatusBadge({ label, value, tone }: { label: string; value?: string; tone: "specialist" | "ai" }) {
  const available = Boolean(value);
  const colors = available ? (tone === "specialist" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700") : "border-slate-200 bg-slate-50 text-slate-400";
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${colors}`}>{label} · {value || "결과 없음"}</span>;
}

function ResultValues({ values, accent }: { values: [string, string][]; accent: "specialist" | "ai" }) {
  return <dl className="grid grid-cols-2 gap-2 p-4">{values.map(([label, value]) => <div key={label} className={`min-w-0 rounded-lg border px-3 py-2.5 ${accent === "specialist" ? "border-emerald-100 bg-emerald-50/50" : "border-blue-100 bg-blue-50/50"}`}><dt className="whitespace-nowrap text-[10px] text-slate-500">{label}</dt><dd className="mt-1 break-words text-xs font-semibold text-slate-800">{value}</dd></div>)}</dl>;
}
function EmptyResult({ title, text }: { title: string; text: string }) { return <div className="flex min-h-[130px] items-center justify-center px-5 text-center"><div><p className="text-sm font-semibold text-slate-700">{title}</p><p className="mt-1.5 max-w-md text-xs leading-5 text-slate-500">{text}</p></div></div>; }
function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div role="alert" className="flex min-h-[190px] items-center justify-center bg-rose-50/50 px-5"><div className="text-center"><p className="text-xs text-rose-700">{message}</p><button type="button" onClick={onRetry} className="mt-3 whitespace-nowrap rounded-md border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700">이 패널 다시 시도</button></div></div>; }

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
