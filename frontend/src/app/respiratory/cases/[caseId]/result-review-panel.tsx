import { resultStatusLabel } from "./decision-status-labels";
import { EvidenceViewerPanel } from "./evidence-viewer-panel";
import type { ReactNode } from "react";
import { CaseImageEvidence } from "./case-image-evidence";
import { CaseDicomEvidence } from "./case-dicom-evidence";
import { CaseCtSegmentationEvidence } from "./case-ct-segmentation-evidence";

type ResultRecord = Record<string, unknown>;
type ClinicalResult = { workflow_stage: string; exam_name?: string; result_status?: string; result_status_label?: string; result_date?: string | null; result_detail?: unknown };
type AiInputContext = { schema_version?: string | null; examination_order?: { id?: string; order_type?: string; order_type_label?: string } | null; source_asset?: { id?: string; workflow_stage?: string; image_type?: string; storage_type?: string; file_format?: string; study_instance_uid?: string | null; series_instance_uid?: string | null; acquired_at?: string | null } | null; metadata?: { wsi_id?: string; roi_layer?: string } };
type AiResult = { id?: string; analysis_type: string; analysis_type_label?: string; status?: string; status_label?: string; model_name?: string; model_version_name?: string; model_components?: unknown; started_at?: string | null; completed_at?: string | null; error_message?: string | null; input_context?: AiInputContext; result_detail?: unknown };

const STAGE_CONFIG: Record<string, { title: string; description: string; department: string }> = {
  XRAY: { title: "흉부 X선", description: "영상의학과 판독 결과를 먼저 확인하고 AI 후보를 보조 근거로 검토합니다.", department: "영상의학과" },
  CT: { title: "흉부 CT 검사·결과", description: "영상의학과 CT 판독 결과와 AI 분석 후보 및 원본 영상 근거를 확인합니다.", department: "영상의학과" },
  PATHOLOGY_GENE: { title: "병리 검사·결과", description: "병리과 확정 결과와 병리 AI 후보 및 원본 병리 근거를 확인합니다.", department: "병리과" },
  PDL1: { title: "PD-L1 검사·결과", description: "병리과 확정 PD-L1 결과와 AI 분석 후보를 서로 다른 출처로 확인합니다.", department: "병리과" },
};

export function ResultReviewPanel({ stage, clinicalResult, aiResult, clinicalError, aiError, clinicalRetrying = false, aiRetrying = false, onRetryClinical, onRetryAi, showEvidence = true, showWorkspaceHeader = true, compactRail = false, lastSyncedAt, syncingResults = false, onRefreshResults, syncNotice = "", caseId, apiBaseUrl, authorizedFetch, specialistAction }: { stage: string; clinicalResult?: ClinicalResult; aiResult?: AiResult; clinicalError?: string; aiError?: string; clinicalRetrying?: boolean; aiRetrying?: boolean; onRetryClinical?: () => void; onRetryAi?: () => void; showEvidence?: boolean; showWorkspaceHeader?: boolean; compactRail?: boolean; lastSyncedAt?: Date | null; syncingResults?: boolean; onRefreshResults?: () => void; syncNotice?: string; caseId?: string; apiBaseUrl?: string; authorizedFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>; specialistAction?: ReactNode }) {
  const specialistValues = getSpecialistValues(stage, clinicalResult?.result_detail);
  const aiValues = getAiValues(stage, aiResult?.result_detail);
  const ctDetail = stage === "CT" ? asRecord(asRecord(aiResult?.result_detail)?.ct) : null;
  const hasCtAiData = ctDetail?.overall_malignancy_risk != null || (Array.isArray(ctDetail?.nodules) && ctDetail.nodules.length > 0);
  const config = STAGE_CONFIG[stage] ?? { title: "검사·결과", description: "의료진 판독 결과와 AI 분석 후보를 구분해 확인합니다.", department: "담당 진료과" };
  const imaging = stage === "XRAY" || stage === "CT";
  const clinicalRole = imaging || stage === "PET_CT_TNM" ? "호흡기내과 최종 판단" : "병리과 판독";
  const isImageWorkspace = showEvidence && (stage === "XRAY" || stage === "CT");
  return (
    <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${isImageWorkspace ? "flex min-h-[min(720px,calc(100dvh-240px))] flex-col" : ""}`}>
      {showWorkspaceHeader && <header className={`flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 ${isImageWorkspace ? "py-2" : "py-2.5"}`}>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-blue-600">검사 결과 · 영상 작업공간</p>
          <h1 className="mt-0.5 text-base font-bold text-slate-900">{config.title}</h1>
          {!isImageWorkspace && <p className="mt-1 text-xs text-slate-600">{config.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge label={clinicalRole} value={clinicalResult?.result_status_label ?? clinicalResult?.result_status} status={clinicalResult?.result_status} tone="specialist" />
          <StatusBadge label="AI" value={aiResult?.status_label ?? aiResult?.status} status={aiResult?.status} tone="ai" />
        </div>
      </header>}

      <div className={isImageWorkspace ? "grid min-h-0 flex-1 gap-px bg-slate-200 xl:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]" : ""}>
      {showEvidence && <div className={isImageWorkspace ? "flex min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 p-2" : "border-b border-slate-200 bg-slate-50/50 px-4 py-3"}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div><p className="text-[10px] font-semibold text-blue-600">원본 근거</p><h2 className="mt-0.5 text-sm font-bold text-slate-800">원본 영상</h2></div>
          <p className="whitespace-nowrap text-[10px] text-slate-400">영상 조작은 뷰어 안에서 바로 수행합니다.</p>
        </div>
        <div className={isImageWorkspace ? "min-h-0 flex-1" : "overflow-x-auto"}>{caseId && apiBaseUrl && authorizedFetch ? (stage === "CT" ? <CaseCtSegmentationEvidence key={caseId} caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} analysisId={aiResult?.id} /> : stage === "PET_CT_TNM" ? <CaseDicomEvidence key={caseId} caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} stage={stage} /> : <CaseImageEvidence key={caseId} caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} stage={stage} />) : <EvidenceViewerPanel />}</div>
      </div>}

      <aside className={isImageWorkspace ? "flex min-h-0 min-w-0 flex-col overflow-y-auto border border-slate-200 bg-white p-2 [scrollbar-gutter:stable] [&>section:nth-of-type(1)]:order-2 [&>section:nth-of-type(2)]:order-1 [&>section:nth-of-type(3)]:order-3" : compactRail ? "flex min-h-0 flex-col gap-2" : "grid grid-cols-2 divide-x divide-slate-200"} aria-label="Imaging result rail">
        <SourcePanel compact={isImageWorkspace} eyebrow={imaging ? "호흡기내과" : config.department} title={clinicalRole} meta={formatDateTime(clinicalResult?.result_date)} tone="specialist">
          {clinicalError ? <PanelError message={clinicalError} retrying={clinicalRetrying} onRetry={onRetryClinical} /> : specialistValues.length > 0 ? <ResultValues values={specialistValues} accent="specialist" /> : <EmptyResult title="확정 결과 없음" text="확인 가능한 확정 결과가 없습니다. 결과가 확정되면 핵심 소견이 표시됩니다." nextAction={clinicalRole + " 결과 대기 · 결과가 확정되면 검토합니다."} />}
          {specialistAction && !clinicalError && clinicalResult?.result_status !== "CONFIRMED" && <div className="flex justify-center px-3 pb-3">{specialistAction}</div>}
        </SourcePanel>
        <SourcePanel compact={isImageWorkspace} eyebrow="AI 분석" title="AI 분석 후보" meta={[aiResult?.model_name, aiResult?.model_version_name].filter(Boolean).join(" · ") || "모델 정보 없음"} tone="ai">
          {aiError ? <PanelError message={aiError} retrying={aiRetrying} onRetry={onRetryAi} /> : aiValues.length > 0 || hasCtAiData ? stage === "CT" ? <CtAiSummary detail={aiResult?.result_detail} /> : <ResultValues values={aiValues} accent="ai" /> : <EmptyResult title="AI 후보 없음" text="현재 검사에 연결된 AI 분석 후보가 없습니다." nextAction="다음 행동: 원본 영상을 확인한 뒤 AI 분석 완료 상태를 다시 확인하세요." />}
        </SourcePanel>
        <AiTraceabilityCard aiResult={aiResult} />
        {!isImageWorkspace && <AiInputTraceabilityCard aiResult={aiResult} />}
        <ReviewWorkflowRail imaging={imaging} aiStatus={aiResult?.status} clinicalStatus={clinicalResult?.result_status} />
        {!isImageWorkspace && (onRefreshResults || lastSyncedAt) && <ResultSyncStatus lastSyncedAt={lastSyncedAt} syncing={syncingResults} onRefresh={onRefreshResults} notice={syncNotice} />}
        {isImageWorkspace && <ResultStatusCard clinicalRole={clinicalRole} clinicalStatus={clinicalResult?.result_status_label ?? clinicalResult?.result_status} aiStatus={aiResult?.status_label ?? aiResult?.status} />}
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
  return <section className={compact ? "shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white" : "min-w-0"}><header className={`flex shrink-0 items-start justify-between gap-3 border-b px-3 py-2.5 ${compact ? "min-h-[54px]" : "min-h-[74px]"} ${tone === "specialist" ? "border-emerald-100 bg-emerald-50/30" : "border-blue-100 bg-blue-50/30"}`}><div><p className={`text-[10px] font-semibold ${tone === "specialist" ? "text-emerald-700" : "text-blue-700"}`}>{eyebrow}</p><h2 className="mt-1 text-sm font-bold text-slate-900">{title}</h2>{tone === "ai" && !compact && <p className="mt-1 text-[10px] text-slate-400">의료진 확정 결과가 아닌 참고 자료입니다.</p>}</div><p className="max-w-32 truncate text-right text-[10px] text-slate-400">{meta}</p></header><div className={compact ? "max-h-[280px] overflow-y-auto" : "min-h-[190px]"}>{children}</div></section>;
}

function ResultStatusCard({ clinicalStatus, aiStatus, clinicalRole }: { clinicalStatus?: string; aiStatus?: string; clinicalRole: string }) {
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold text-slate-700">검토 상태</p><div className="mt-2 grid grid-cols-2 gap-2"><div className="rounded-lg bg-emerald-50 px-2.5 py-2"><p className="text-[9px] font-semibold text-emerald-700">{clinicalRole}</p><p className="mt-1 truncate text-[11px] font-bold text-slate-800">{resultStatusLabel(clinicalStatus)}</p></div><div className="rounded-lg bg-blue-50 px-2.5 py-2"><p className="text-[9px] font-semibold text-blue-700">AI 분석</p><p className="mt-1 truncate text-[11px] font-bold text-slate-800">{resultStatusLabel(aiStatus)}</p></div></div><p className="mt-2 text-[10px] leading-4 text-slate-500">AI 결과는 의료진 확정 결과와 함께 검토합니다.</p></section>;
}

function AiTraceabilityCard({ aiResult }: { aiResult?: AiResult }) {
  const succeeded = aiResult?.status === "SUCCEEDED";
  const asset = aiResult?.input_context?.source_asset;
  const inputSeries = asset?.series_instance_uid ? `Series ${asset.series_instance_uid}` : asset?.image_type ? `${asset.image_type} · Series 정보 없음` : "정보 없음";
  const components = formatModelComponents(aiResult?.model_components);
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold text-slate-700">AI 분석 정보</p><span className={`rounded px-2 py-1 text-[9px] font-semibold ${succeeded ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{resultStatusLabel(aiResult?.status ?? aiResult?.status_label)}</span></div><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]"><div><dt className="text-slate-400">모델</dt><dd className="truncate font-medium text-slate-700">{aiResult?.model_name ?? "정보 없음"}</dd></div><div><dt className="text-slate-400">버전</dt><dd className="truncate font-medium text-slate-700">{aiResult?.model_version_name ?? "정보 없음"}</dd></div><div><dt className="text-slate-400">분석 시각</dt><dd className="truncate font-medium text-slate-700">{formatDateTime(aiResult?.completed_at)}</dd></div><div><dt className="text-slate-400">입력 Series</dt><dd className="truncate font-medium text-slate-700">{inputSeries}</dd></div>{components && <div className="col-span-2"><dt className="text-slate-400">모델 구성</dt><dd className="truncate font-medium text-slate-700">{components}</dd></div>}</dl><p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-800">AI 결과는 확정 진단이 아닌 참고 자료입니다. 의료진 검토가 필요합니다.</p></section>;
}

function formatModelComponents(value: unknown) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" || typeof item === "number").map(String).join(" · ");
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item) : "configured"}`).join(" · ");
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function AiInputTraceabilityCard({ aiResult }: { aiResult?: AiResult }) {
  const context = aiResult?.input_context;
  const order = context?.examination_order;
  const asset = context?.source_asset;
  const metadata = context?.metadata;
  const orderLabel = [order?.order_type_label ?? order?.order_type, order?.id && `#${order.id.slice(0, 8)}`].filter(Boolean).join(" · ");
  const assetLabel = [asset?.image_type, asset?.workflow_stage, asset?.series_instance_uid && `Series ${asset.series_instance_uid}`].filter(Boolean).join(" · ");
  const metadataLabel = [metadata?.wsi_id && `WSI ${metadata.wsi_id}`, metadata?.roi_layer && `ROI ${metadata.roi_layer}`].filter(Boolean).join(" · ");
  const hasContext = Boolean(orderLabel || assetLabel || metadataLabel || context?.schema_version);

  return <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold text-slate-700">분석 입력 추적</p>{hasContext ? <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]"><TraceItem label="검사 오더" value={orderLabel} /><TraceItem label="입력 영상" value={assetLabel} /><TraceItem label="Study UID" value={asset?.study_instance_uid} /><TraceItem label="입력 메타데이터" value={metadataLabel} /><TraceItem label="Schema" value={context?.schema_version} /><TraceItem label="획득 시각" value={formatDateTime(asset?.acquired_at)} /></dl> : <p className="mt-2 text-[10px] leading-4 text-slate-500">현재 분석에 연결된 입력 추적 정보가 없습니다.</p>}</section>;
}

function TraceItem({ label, value }: { label: string; value?: string | null }) { return <div><dt className="text-slate-400">{label}</dt><dd className="truncate font-medium text-slate-700">{value || "정보 없음"}</dd></div>; }

function ReviewWorkflowRail({ imaging, aiStatus, clinicalStatus }: { imaging: boolean; aiStatus?: string; clinicalStatus?: string }) {
  const aiCompleted = aiStatus === "SUCCEEDED";
  const aiFailed = aiStatus === "FAILED" || aiStatus === "ERROR";
  const clinicalCompleted = clinicalStatus === "CONFIRMED";
  // Imaging clinical results are the pulmonologist's decision, not a radiology sign-off.
  // No radiology review status is supplied by this API; do not infer one.
  const steps = [
    { label: "AI 분석", status: resultStatusLabel(aiStatus), completed: aiCompleted, failed: aiFailed },
    { label: imaging ? "영상의학과 판독" : "병리과 판독", status: imaging ? "판독 상태 정보 없음" : resultStatusLabel(clinicalStatus), completed: !imaging && clinicalCompleted, failed: false },
    { label: imaging ? "호흡기내과 최종 판단" : "호흡기내과 치료 판단", status: imaging ? resultStatusLabel(clinicalStatus) : clinicalCompleted ? "검토 필요" : "병리 결과 대기", completed: imaging && clinicalCompleted, failed: false },
  ];
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold text-slate-700">판독 상태 흐름</p><ol className="mt-2 space-y-2">{steps.map((step, index) => <li key={step.label} className="flex items-center gap-2 text-[10px]"><span data-workflow-state={step.completed ? "completed" : step.failed ? "failed" : "pending"} className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold ${step.completed ? "bg-emerald-500 text-white" : step.failed ? "bg-rose-500 text-white" : "border border-slate-300 bg-white text-slate-400"}`}>{index + 1}</span><span className="font-medium text-slate-700">{step.label}</span><span className="ml-auto text-slate-500">{step.status}</span></li>)}</ol></section>;
}

export function ResultSyncStatus({ lastSyncedAt, syncing, onRefresh, notice = "" }: { lastSyncedAt?: Date | null; syncing: boolean; onRefresh?: () => void; notice?: string }) {
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold text-slate-700">결과 동기화</p><p className="mt-1 text-[10px] text-slate-500">{syncing ? "결과를 갱신하는 중입니다." : lastSyncedAt ? `마지막 갱신 ${lastSyncedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "자동 갱신: 30초"}</p></div>{onRefresh && <button type="button" onClick={onRefresh} disabled={syncing} className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{syncing ? "갱신 중" : "지금 새로고침"}</button>}</div>{notice && <p role="status" className="mt-2 rounded bg-emerald-50 px-2 py-1.5 text-[10px] font-semibold text-emerald-700">{notice}</p>}</section>;
}

function StatusBadge({ label, value, status, tone }: { label: string; value?: string; status?: string; tone: "specialist" | "ai" }) {
  const failed = status === "FAILED" || status === "ERROR";
  const inProgress = status === "PENDING" || status === "QUEUED" || status === "RUNNING" || status === "REQUESTED";
  const colors = failed ? "border-rose-200 bg-rose-50 text-rose-700" : inProgress ? "border-amber-200 bg-amber-50 text-amber-700" : value ? (tone === "specialist" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700") : "border-slate-200 bg-slate-50 text-slate-400";
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${colors}`}>{label} · {resultStatusLabel(status ?? value)}</span>;
}

function ResultValues({ values, accent }: { values: [string, string][]; accent: "specialist" | "ai" }) {
  return <dl className="grid grid-cols-2 gap-2 p-4">{values.map(([label, value], index) => <div key={`${label}-${value}-${index}`} className={`min-w-0 rounded-lg border px-3 py-2.5 ${accent === "specialist" ? "border-emerald-100 bg-emerald-50/50" : "border-blue-100 bg-blue-50/50"}`}><dt className="whitespace-nowrap text-[10px] text-slate-500">{label}</dt><dd className="mt-1 break-words text-xs font-semibold text-slate-800">{value}</dd></div>)}</dl>;
}
function EmptyResult({ title, text, nextAction }: { title: string; text: string; nextAction?: string }) { return <div className="px-4 py-4 text-center"><div><p className="text-xs font-semibold text-slate-700">{title}</p><p className="mt-1 max-w-md text-[11px] leading-4 text-slate-500">{text}</p>{nextAction && <p className="mt-2 max-w-md rounded-md bg-slate-50 px-2 py-1.5 text-[10px] leading-4 text-slate-600">{nextAction}</p>}</div></div>; }
function PanelError({ message, retrying, onRetry }: { message: string; retrying: boolean; onRetry?: () => void }) { return <div role="alert" className="flex min-h-[190px] items-center justify-center bg-rose-50/50 px-5"><div className="text-center"><p className="text-xs text-rose-700">{message}</p>{onRetry && <button type="button" disabled={retrying} onClick={onRetry} className="mt-3 whitespace-nowrap rounded-md border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 disabled:opacity-50">{retrying ? "재시도 중" : "이 결과 다시 시도"}</button>}</div></div>; }

function getSpecialistValues(stage: string, detail: unknown): [string, string][] {
  const root = asRecord(detail); if (!root) return [];
  if (stage === "PATHOLOGY_GENE") {
    const pathology = asRecord(root.pathology);
    const gene = asRecord(root.gene);
    const pathologyValues = pathology ? pickValues(pathology, [["악성 여부", "malignancy_status_label"], ["조직형", "histologic_type"], ["아형", "subtype"], ["진단 요약", "diagnosis_summary"]]) : [];
    return [...pathologyValues, ...getClinicalGeneFindings(gene?.findings)];
  }
  if (stage === "PDL1") {
    const pdl1 = asRecord(root.pdl1);
    return pdl1 ? pickValues(pdl1, [["확정 PD-L1 TPS", "tps_percent"], ["PD-L1 판정", "interpretation"], ["PD-L1 소견", "note"]]) : [];
  }
  const sectionKey = stage === "XRAY" ? "xray" : stage === "CT" ? "ct" : stage === "PET_CT_TNM" ? "tnm" : "";
  const section = asRecord(root[sectionKey]); if (!section) return [];
  const fields: Record<string, [string, string][]> = {
    XRAY: [["판정", "assessment_label"], ["의사 소견", "finding_summary"], ["권고", "recommended_action"]],
    CT: [["종합 판정", "overall_assessment_label"], ["악성 위험도", "overall_malignancy_risk"], ["의사 소견", "finding_summary"]],
    PET_CT_TNM: [["확정 T", "t_category"], ["확정 N", "n_category"], ["확정 M", "m_category"], ["확정 Stage Group", "stage_group"], ["의사 소견", "note"]],
  };
  return pickValues(section, fields[stage] ?? []);
}

function getAiValues(stage: string, detail: unknown): [string, string][] {
  const root = asRecord(detail); if (!root) return [];
  if (stage === "PATHOLOGY_GENE") {
    const pathology = asRecord(root.pathology);
    const pathologyValues = pathology ? pickValues(pathology, [["AI 악성 판정 후보", "malignancy_assessment_label"], ["악성 확률", "malignancy_probability"], ["조직형 후보", "predicted_histologic_type"], ["아형 후보", "predicted_subtype"], ["아형 신뢰도", "subtype_confidence"]]) : [];
    return [...pathologyValues, ...getAiGeneFindings(root.genes)];
  }
  if (stage === "PDL1") {
    const pdl1 = asRecord(root.pdl1);
    return pdl1 ? pickValues(pdl1, [["PD-L1 예측 범위", "predicted_tps_range_label"], ["confidence", "confidence"]]) : [];
  }
  const sectionKey = stage === "XRAY" ? "xray" : stage === "CT" ? "ct" : stage === "PET_CT_TNM" ? "tnm" : "";
  const section = asRecord(root[sectionKey]); if (!section) return [];
  const fields: Record<string, [string, string][]> = {
    XRAY: [["AI 판정 후보", "assessment_label"], ["의심 점수", "suspicion_score"]],
    CT: [["AI 악성 위험도", "overall_malignancy_risk"]],
    PET_CT_TNM: [["T 후보", "predicted_t"], ["N 후보", "predicted_n"], ["M 후보", "predicted_m"], ["Stage Group 후보", "predicted_stage_group"], ["confidence", "confidence"]],
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
