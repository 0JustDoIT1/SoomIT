import { EvidenceViewerPanel } from "./evidence-viewer-panel";

type ResultRecord = Record<string, unknown>;
type ClinicalResult = { workflow_stage: string; exam_name?: string; result_status?: string; result_status_label?: string; result_date?: string | null; result_detail?: unknown };
type AiResult = { analysis_type: string; analysis_type_label?: string; status?: string; status_label?: string; model_name?: string; model_version_name?: string; completed_at?: string | null; result_detail?: unknown };

const STAGE_CONFIG: Record<string, { title: string; description: string; department: string }> = {
  XRAY: { title: "흉부 X선 검사·결과", description: "영상의학과 판독 결과를 먼저 확인하고 AI 후보를 보조 근거로 검토합니다.", department: "영상의학과" },
  CT: { title: "흉부 CT 검사·결과", description: "영상의학과 CT 판독 결과와 AI 분석 후보 및 원본 영상 근거를 확인합니다.", department: "영상의학과" },
  PATHOLOGY_GENE: { title: "병리 검사·결과", description: "병리과 확정 결과와 병리 AI 후보 및 원본 병리 근거를 확인합니다.", department: "병리과" },
  PDL1: { title: "유전자 검사·결과", description: "전문과 확정 유전자 결과와 AI 분석 후보를 서로 다른 출처로 확인합니다.", department: "병리과" },
};

export function ResultReviewPanel({ stage, clinicalResult, aiResult, clinicalError, aiError, clinicalRetrying = false, aiRetrying = false, onRetryClinical, onRetryAi, showEvidence = true }: { stage: string; clinicalResult?: ClinicalResult; aiResult?: AiResult; clinicalError?: string; aiError?: string; clinicalRetrying?: boolean; aiRetrying?: boolean; onRetryClinical?: () => void; onRetryAi?: () => void; showEvidence?: boolean }) {
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

      {showEvidence && <div className="border-b border-slate-200 bg-slate-50/50 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-semibold text-blue-600">원본 근거</p><h2 className="mt-0.5 text-sm font-bold text-slate-800">원본 영상</h2></div>
          <p className="whitespace-nowrap text-[10px] text-slate-400">화면에서 바로 확인하고 필요할 때 크게 볼 수 있습니다.</p>
        </div>
        <div className="overflow-x-auto"><EvidenceViewerPanel /></div>
      </div>}

      <div className="grid grid-cols-2 divide-x divide-slate-200">
        <SourcePanel eyebrow={config.department} title="전문과 확정 결과" meta={formatDateTime(clinicalResult?.result_date)} tone="specialist">
          {clinicalError ? <PanelError message={clinicalError} retrying={clinicalRetrying} onRetry={onRetryClinical} /> : specialistValues.length > 0 ? <ResultValues values={specialistValues} accent="specialist" /> : <EmptyResult title="확정 결과 없음" text="확인 가능한 전문과 확정 결과가 없습니다. 결과가 확정되면 판독과·판독자·확정 시각과 핵심 소견이 표시됩니다." />}
        </SourcePanel>
        <SourcePanel eyebrow="AI 분석" title="AI 분석 후보" meta={[aiResult?.model_name, aiResult?.model_version_name].filter(Boolean).join(" · ") || "모델 정보 없음"} tone="ai">
          {aiError ? <PanelError message={aiError} retrying={aiRetrying} onRetry={onRetryAi} /> : aiValues.length > 0 ? <ResultValues values={aiValues} accent="ai" /> : <EmptyResult title="AI 후보 없음" text="현재 검사에 연결된 AI 분석 후보가 없습니다." />}
        </SourcePanel>
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
function PanelError({ message, retrying, onRetry }: { message: string; retrying: boolean; onRetry?: () => void }) { return <div role="alert" className="flex min-h-[190px] items-center justify-center bg-rose-50/50 px-5"><div className="text-center"><p className="text-xs text-rose-700">{message}</p>{onRetry && <button type="button" disabled={retrying} onClick={onRetry} className="mt-3 whitespace-nowrap rounded-md border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 disabled:opacity-50">{retrying ? "재시도 중" : "이 결과 다시 시도"}</button>}</div></div>; }

function getSpecialistValues(stage: string, detail: unknown): [string, string][] {
  const root = asRecord(detail); if (!root) return [];
  if (stage === "PATHOLOGY_GENE") {
    const pathology = asRecord(root.pathology);
    const gene = asRecord(root.gene);
    const pathologyValues = pathology ? pickValues(pathology, [["?? ??", "malignancy_status_label"], ["???", "histologic_type"], ["??", "subtype"], ["?? ??", "diagnosis_summary"]]) : [];
    return [...pathologyValues, ...getClinicalGeneFindings(gene?.findings)];
  }
  if (stage === "PDL1") {
    const pdl1 = asRecord(root.pdl1);
    return pdl1 ? pickValues(pdl1, [["?? PD-L1 TPS", "tps_percent"], ["PD-L1 ??", "interpretation"], ["PD-L1 ??", "note"]]) : [];
  }
  const sectionKey = stage === "XRAY" ? "xray" : stage === "CT" ? "ct" : stage === "PET_CT_TNM" ? "tnm" : "";
  const section = asRecord(root[sectionKey]); if (!section) return [];
  const fields: Record<string, [string, string][]> = {
    XRAY: [["??", "assessment_label"], ["?? ??", "finding_summary"], ["??", "recommended_action"]],
    CT: [["?? ??", "overall_assessment_label"], ["?? ???", "overall_malignancy_risk"], ["?? ??", "finding_summary"]],
    PET_CT_TNM: [["?? T", "t_category"], ["?? N", "n_category"], ["?? M", "m_category"], ["?? Stage Group", "stage_group"], ["??? ??", "note"]],
  };
  return pickValues(section, fields[stage] ?? []);
}

function getAiValues(stage: string, detail: unknown): [string, string][] {
  const root = asRecord(detail); if (!root) return [];
  if (stage === "PATHOLOGY_GENE") {
    const pathology = asRecord(root.pathology);
    const pathologyValues = pathology ? pickValues(pathology, [["AI ?? ?? ??", "malignancy_assessment_label"], ["?? ??", "malignancy_probability"], ["??? ??", "predicted_histologic_type"], ["?? ??", "predicted_subtype"], ["?? confidence", "subtype_confidence"]]) : [];
    return [...pathologyValues, ...getAiGeneFindings(root.genes)];
  }
  if (stage === "PDL1") {
    const pdl1 = asRecord(root.pdl1);
    return pdl1 ? pickValues(pdl1, [["PD-L1 ?? ??", "predicted_tps_range_label"], ["confidence", "confidence"]]) : [];
  }
  const sectionKey = stage === "XRAY" ? "xray" : stage === "CT" ? "ct" : stage === "PET_CT_TNM" ? "tnm" : "";
  const section = asRecord(root[sectionKey]); if (!section) return [];
  const fields: Record<string, [string, string][]> = {
    XRAY: [["AI ?? ??", "assessment_label"], ["?? ??", "suspicion_score"]],
    CT: [["AI ?? ???", "overall_malignancy_risk"]],
    PET_CT_TNM: [["T ??", "predicted_t"], ["N ??", "predicted_n"], ["M ??", "predicted_m"], ["Stage Group ??", "predicted_stage_group"], ["confidence", "confidence"]],
  };
  return pickValues(section, fields[stage] ?? []);
}

function getClinicalGeneFindings(value: unknown): [string, string][] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const finding = asRecord(item);
    const symbol = finding?.gene_symbol;
    if (!finding || !symbol) return [];
    const assessment = finding.assessment_label ?? finding.assessment;
    const alteration = finding.alteration_code;
    const summary = [assessment, alteration].filter((part) => part !== null && part !== undefined && part !== "").map(String).join(" · ");
    return summary ? [[String(symbol), summary] as [string, string]] : [];
  });
}

function getAiGeneFindings(value: unknown): [string, string][] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const finding = asRecord(item);
    const symbol = finding?.gene_symbol;
    if (!finding || !symbol) return [];
    const status = finding.predicted_status_label ?? finding.predicted_status;
    const probability = formatProbability(finding.predicted_probability);
    const summary = [status, probability].filter(Boolean).map(String).join(" · ");
    return summary ? [[String(symbol), summary] as [string, string]] : [];
  });
}

function formatProbability(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return `${(number <= 1 ? number * 100 : number).toFixed(2)}%`;
}
function pickValues(source: ResultRecord, fields: [string, string][]): [string, string][] { return fields.flatMap(([label, key]) => { const value = source[key]; if (value === null || value === undefined || value === "") return []; return [[label, typeof value === "boolean" ? (value ? "예" : "아니요") : String(value)]]; }); }
function asRecord(value: unknown): ResultRecord | null { return value && typeof value === "object" && !Array.isArray(value) ? value as ResultRecord : null; }
function formatDateTime(value?: string | null) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR"); }
