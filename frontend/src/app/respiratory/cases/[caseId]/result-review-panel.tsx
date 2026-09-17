import { EvidenceViewerPanel } from "./evidence-viewer-panel";
import { CaseImageEvidence } from "./case-image-evidence";
import { CaseDicomEvidence } from "./case-dicom-evidence";
import { CaseCtSegmentationEvidence } from "./case-ct-segmentation-evidence";

type ResultRecord = Record<string, unknown>;
type ClinicalResult = { workflow_stage: string; exam_name?: string; result_status?: string; result_status_label?: string; result_date?: string | null; result_detail?: unknown };
type AiResult = { id?: string; analysis_type: string; analysis_type_label?: string; status?: string; status_label?: string; model_name?: string; model_version_name?: string; completed_at?: string | null; result_detail?: unknown };

const STAGE_CONFIG: Record<string, { title: string; description: string; department: string }> = {
  XRAY: { title: "흉부 X선 검사·결과", description: "영상의학과 판독 결과를 먼저 확인하고 AI 후보를 보조 근거로 검토합니다.", department: "영상의학과" },
  CT: { title: "흉부 CT 검사·결과", description: "영상의학과 CT 판독 결과와 AI 분석 후보 및 원본 영상 근거를 확인합니다.", department: "영상의학과" },
  PATHOLOGY_GENE: { title: "병리 검사·결과", description: "병리과 확정 결과와 병리 AI 후보 및 원본 병리 근거를 확인합니다.", department: "병리과" },
  PDL1: { title: "PD-L1 검사·결과", description: "전문과 확정 PD-L1 결과와 AI 분석 후보를 서로 다른 출처로 확인합니다.", department: "병리과" },
};

export function ResultReviewPanel({ stage, clinicalResult, aiResult, clinicalError, aiError, clinicalRetrying = false, aiRetrying = false, onRetryClinical, onRetryAi, showEvidence = true, showWorkspaceHeader = true, compactRail = false, lastSyncedAt, syncingResults = false, onRefreshResults, syncNotice = "", caseId, apiBaseUrl, authorizedFetch }: { stage: string; clinicalResult?: ClinicalResult; aiResult?: AiResult; clinicalError?: string; aiError?: string; clinicalRetrying?: boolean; aiRetrying?: boolean; onRetryClinical?: () => void; onRetryAi?: () => void; showEvidence?: boolean; showWorkspaceHeader?: boolean; compactRail?: boolean; lastSyncedAt?: Date | null; syncingResults?: boolean; onRefreshResults?: () => void; syncNotice?: string; caseId?: string; apiBaseUrl?: string; authorizedFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }) {
  const specialistValues = getSpecialistValues(stage, clinicalResult?.result_detail);
  const aiValues = getAiValues(stage, aiResult?.result_detail);
  const ctDetail = stage === "CT" ? asRecord(asRecord(aiResult?.result_detail)?.ct) : null;
  const hasCtAiData = ctDetail?.overall_malignancy_risk != null || (Array.isArray(ctDetail?.nodules) && ctDetail.nodules.length > 0);
  const config = STAGE_CONFIG[stage] ?? { title: "검사·결과", description: "전문과 확정 결과와 AI 분석 후보를 구분해 확인합니다.", department: "전문과" };
  const isImageWorkspace = showEvidence && (stage === "XRAY" || stage === "CT");
  return (
    <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${isImageWorkspace ? "flex h-full min-h-0 flex-col" : ""}`}>
      {showWorkspaceHeader && <header className={`flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 ${isImageWorkspace ? "py-2" : "py-2.5"}`}>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-blue-600">검사 결과 · 영상 작업공간</p>
          <h1 className="mt-0.5 text-base font-bold text-slate-900">{config.title}</h1>
          {!isImageWorkspace && <p className="mt-1 text-xs text-slate-600">{config.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge label="전문과" value={clinicalResult?.result_status_label ?? clinicalResult?.result_status} tone="specialist" />
          <StatusBadge label="AI" value={aiResult?.status_label ?? aiResult?.status} tone="ai" />
        </div>
      </header>}

      <div className={isImageWorkspace ? "grid min-h-0 flex-1 gap-2 bg-slate-100/70 p-2 xl:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]" : ""}>
      {showEvidence && <div className={isImageWorkspace ? "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 p-2" : "border-b border-slate-200 bg-slate-50/50 px-4 py-3"}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-semibold text-blue-600">원본 근거</p><h2 className="mt-0.5 text-sm font-bold text-slate-800">원본 영상</h2></div>
          <p className="whitespace-nowrap text-[10px] text-slate-400">영상 조작은 뷰어 안에서 바로 수행합니다.</p>
        </div>
        <div className={isImageWorkspace ? "min-h-0 flex-1" : "overflow-x-auto"}>{caseId && apiBaseUrl && authorizedFetch ? (stage === "CT" ? <CaseCtSegmentationEvidence key={caseId} caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} analysisId={aiResult?.id} /> : stage === "PET_CT_TNM" ? <CaseDicomEvidence key={caseId} caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} stage={stage} /> : <CaseImageEvidence key={caseId} caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} stage={stage} />) : <EvidenceViewerPanel />}</div>
      </div>}

      <aside className={isImageWorkspace ? "flex min-h-0 min-w-0 flex-col overflow-y-auto border border-slate-200 bg-white p-2 [scrollbar-gutter:stable] [&>section:nth-of-type(1)]:order-2 [&>section:nth-of-type(2)]:order-1 [&>section:nth-of-type(3)]:order-3" : compactRail ? "flex min-h-0 flex-col gap-2" : "grid grid-cols-2 divide-x divide-slate-200"} aria-label="Imaging result rail">
        <SourcePanel compact={isImageWorkspace} eyebrow={config.department} title="전문과 확정 결과" meta={formatDateTime(clinicalResult?.result_date)} tone="specialist">
          {clinicalError ? <PanelError message={clinicalError} retrying={clinicalRetrying} onRetry={onRetryClinical} /> : specialistValues.length > 0 ? <ResultValues values={specialistValues} accent="specialist" /> : <EmptyResult title="확정 결과 없음" text="확인 가능한 전문과 확정 결과가 없습니다. 결과가 확정되면 판독과·판독자·확정 시각과 핵심 소견이 표시됩니다." />}
        </SourcePanel>
        <SourcePanel compact={isImageWorkspace} eyebrow="AI 분석" title="AI 분석 후보" meta={[aiResult?.model_name, aiResult?.model_version_name].filter(Boolean).join(" · ") || "모델 정보 없음"} tone="ai">
          {aiError ? <PanelError message={aiError} retrying={aiRetrying} onRetry={onRetryAi} /> : aiValues.length > 0 || hasCtAiData ? stage === "CT" ? <CtAiSummary detail={aiResult?.result_detail} /> : <ResultValues values={aiValues} accent="ai" /> : <EmptyResult title="AI 후보 없음" text="현재 검사에 연결된 AI 분석 후보가 없습니다." />}
        </SourcePanel>
        <AiTraceabilityCard aiResult={aiResult} />
        <ReviewWorkflowRail aiStatus={aiResult?.status_label ?? aiResult?.status} clinicalStatus={clinicalResult?.result_status_label ?? clinicalResult?.result_status} />
        {(onRefreshResults || lastSyncedAt) && <ResultSyncStatus lastSyncedAt={lastSyncedAt} syncing={syncingResults} onRefresh={onRefreshResults} notice={syncNotice} />}
        {isImageWorkspace && <ResultStatusCard clinicalStatus={clinicalResult?.result_status_label ?? clinicalResult?.result_status} aiStatus={aiResult?.status_label ?? aiResult?.status} />}
      </aside>
      </div>

    </section>
  );
}

function CtAiSummary({ detail }: { detail: unknown }) {
  const root = asRecord(detail);
  const ct = asRecord(root?.ct);
  const risk = ct?.overall_malignancy_risk;
  const numericRisk = risk !== null && risk !== undefined && /^\d+(\.\d+)?$/.test(String(risk));
  const nodules = Array.isArray(ct?.nodules) ? ct.nodules : [];
  if (risk == null && nodules.length === 0) return null;
  return <div className="mx-4 mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
    <p className="text-xs font-semibold text-blue-800">CT AI 분석 요약</p>
    <div className="mt-2 flex items-end justify-between gap-3">
      <div><p className="text-[11px] text-slate-500">전체 악성 위험도</p><p className="mt-1 text-2xl font-bold text-rose-600">{numericRisk ? `${Number(risk).toFixed(2)}%` : risk == null ? "결과 없음" : String(risk)}</p></div>
      <span className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-700">검출 결절 {nodules.length}건</span>
    </div>
    {nodules.length > 0 && <div className="mt-3 space-y-1.5 border-t border-blue-100 pt-3">{nodules.slice(0, 4).map((value, index) => {
      const nodule = asRecord(value);
      return <div key={`${nodule?.nodule_no ?? index}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-[11px]"><span className="font-bold text-slate-800">결절 {String(nodule?.nodule_no ?? index + 1)}</span><span className="text-slate-600">악성 위험도 {nodule?.malignancy_risk == null ? "결과 없음" : `${nodule.malignancy_risk}%`}</span><span className="text-slate-500">검출 신뢰도 {nodule?.detection_confidence == null ? "결과 없음" : `${(Number(nodule.detection_confidence) * 100).toFixed(1)}%`}</span></div>;
    })}</div>}
    <p className="mt-3 text-[10px] leading-4 text-blue-800">AI 결과는 의료진 확정 판독과 함께 검토해야 합니다.</p>
  </div>;
}

function SourcePanel({ eyebrow, title, meta, tone, children, compact = false }: { eyebrow: string; title: string; meta: string; tone: "specialist" | "ai"; children: React.ReactNode; compact?: boolean }) {
  return <section className={compact ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white" : "min-w-0"}><header className={`flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 ${compact ? "min-h-[58px]" : "min-h-[74px]"} ${tone === "specialist" ? "border-emerald-100 bg-emerald-50/30" : "border-blue-100 bg-blue-50/30"}`}><div><p className={`text-[10px] font-semibold ${tone === "specialist" ? "text-emerald-700" : "text-blue-700"}`}>{eyebrow}</p><h2 className="mt-1 text-sm font-bold text-slate-900">{title}</h2>{tone === "ai" && !compact && <p className="mt-1 text-[10px] text-slate-400">의료진 확정 결과가 아닌 참고 자료입니다.</p>}</div><p className="max-w-32 truncate text-right text-[10px] text-slate-400">{meta}</p></header><div className={compact ? "min-h-0 flex-1 overflow-y-auto" : "min-h-[190px]"}>{children}</div></section>;
}

function ResultStatusCard({ clinicalStatus, aiStatus }: { clinicalStatus?: string; aiStatus?: string }) {
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold text-slate-700">검토 상태</p><div className="mt-2 grid grid-cols-2 gap-2"><div className="rounded-lg bg-emerald-50 px-2.5 py-2"><p className="text-[9px] font-semibold text-emerald-700">전문과</p><p className="mt-1 truncate text-[11px] font-bold text-slate-800">{clinicalStatus || "결과 없음"}</p></div><div className="rounded-lg bg-blue-50 px-2.5 py-2"><p className="text-[9px] font-semibold text-blue-700">AI 분석</p><p className="mt-1 truncate text-[11px] font-bold text-slate-800">{aiStatus || "결과 없음"}</p></div></div><p className="mt-2 text-[10px] leading-4 text-slate-500">AI 결과는 전문과 확정 결과와 함께 검토합니다.</p></section>;
}

function AiTraceabilityCard({ aiResult }: { aiResult?: AiResult }) {
  const succeeded = aiResult?.status === "SUCCEEDED";
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold text-slate-700">AI 분석 정보</p><span className={`rounded px-2 py-1 text-[9px] font-semibold ${succeeded ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{aiResult?.status_label ?? aiResult?.status ?? "결과 없음"}</span></div><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]"><div><dt className="text-slate-400">모델</dt><dd className="truncate font-medium text-slate-700">{aiResult?.model_name ?? "정보 없음"}</dd></div><div><dt className="text-slate-400">버전</dt><dd className="truncate font-medium text-slate-700">{aiResult?.model_version_name ?? "정보 없음"}</dd></div><div><dt className="text-slate-400">분석 시각</dt><dd className="truncate font-medium text-slate-700">{formatDateTime(aiResult?.completed_at)}</dd></div><div><dt className="text-slate-400">입력 Series</dt><dd className="truncate font-medium text-slate-700">현재 API 미제공</dd></div></dl><p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-800">AI 결과는 확정 진단이 아닌 참고 자료입니다. 의료진 검토가 필요합니다.</p></section>;
}

function ReviewWorkflowRail({ aiStatus, clinicalStatus }: { aiStatus?: string; clinicalStatus?: string }) {
  const steps = [
    { label: "AI 분석", status: aiStatus || "대기" },
    { label: "전문과 검토", status: clinicalStatus || "검토 대기" },
    { label: "호흡기내과 확정", status: clinicalStatus ? "다음 단계 확인" : "전문과 결과 대기" },
  ];
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold text-slate-700">판독 상태 흐름</p><ol className="mt-2 space-y-2">{steps.map((step, index) => <li key={step.label} className="flex items-center gap-2 text-[10px]"><span className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold ${index === 0 && aiStatus || index === 1 && clinicalStatus ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-slate-400"}`}>{index + 1}</span><span className="font-medium text-slate-700">{step.label}</span><span className="ml-auto text-slate-500">{step.status}</span></li>)}</ol></section>;
}

export function ResultSyncStatus({ lastSyncedAt, syncing, onRefresh, notice = "" }: { lastSyncedAt?: Date | null; syncing: boolean; onRefresh?: () => void; notice?: string }) {
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold text-slate-700">결과 동기화</p><p className="mt-1 text-[10px] text-slate-500">{syncing ? "결과를 갱신하는 중입니다." : lastSyncedAt ? `마지막 갱신 ${lastSyncedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "자동 갱신: 30초"}</p></div>{onRefresh && <button type="button" onClick={onRefresh} disabled={syncing} className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{syncing ? "갱신 중" : "지금 새로고침"}</button>}</div>{notice && <p role="status" className="mt-2 rounded bg-emerald-50 px-2 py-1.5 text-[10px] font-semibold text-emerald-700">{notice}</p>}</section>;
}

function StatusBadge({ label, value, tone }: { label: string; value?: string; tone: "specialist" | "ai" }) {
  const available = Boolean(value);
  const colors = available ? (tone === "specialist" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700") : "border-slate-200 bg-slate-50 text-slate-400";
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${colors}`}>{label} · {value || "결과 없음"}</span>;
}

function ResultValues({ values, accent }: { values: [string, string][]; accent: "specialist" | "ai" }) {
  return <dl className="grid grid-cols-2 gap-2 p-4">{values.map(([label, value], index) => <div key={`${label}-${value}-${index}`} className={`min-w-0 rounded-lg border px-3 py-2.5 ${accent === "specialist" ? "border-emerald-100 bg-emerald-50/50" : "border-blue-100 bg-blue-50/50"}`}><dt className="whitespace-nowrap text-[10px] text-slate-500">{label}</dt><dd className="mt-1 break-words text-xs font-semibold text-slate-800">{value}</dd></div>)}</dl>;
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
