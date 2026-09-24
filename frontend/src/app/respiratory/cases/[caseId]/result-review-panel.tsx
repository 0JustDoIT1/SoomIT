import { resultStatusLabel } from "./decision-status-labels";
import { EvidenceViewerPanel } from "./evidence-viewer-panel";
import { useCallback, useState, type ReactNode } from "react";
import { CaseImageEvidence } from "./case-image-evidence";
import { CaseDicomEvidence } from "./case-dicom-evidence";
import { CaseCtSegmentationEvidence, type CtEvidenceInfo } from "./case-ct-segmentation-evidence";

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
  const [ctEvidenceInfo, setCtEvidenceInfo] = useState<CtEvidenceInfo>({});
  const onCtEvidenceInfoChange = useCallback((info: CtEvidenceInfo) => setCtEvidenceInfo((current) => ({ ...current, ...info })), []);
  const specialistValues = getSpecialistValues(stage, clinicalResult?.result_detail);
  const aiValues = getAiValues(stage, aiResult?.result_detail);
  const ctDetail = stage === "CT" ? asRecord(asRecord(aiResult?.result_detail)?.ct) : null;
  const ctNodules = Array.isArray(ctDetail?.nodules) ? ctDetail.nodules : [];
  const hasCtAiData = ctDetail !== null;
  const config = STAGE_CONFIG[stage] ?? { title: "검사·결과", description: "의료진 판독 결과와 AI 분석 후보를 구분해 확인합니다.", department: "담당 진료과" };
  const imaging = stage === "XRAY" || stage === "CT";
  const clinicalRole = imaging || stage === "PET_CT_TNM" ? "호흡기내과 최종 판단" : "병리과 판독";
  const isImageWorkspace = showEvidence && (stage === "XRAY" || stage === "CT");
  return (
    <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${isImageWorkspace ? "flex h-full min-h-0 min-w-0 flex-1 flex-col" : ""}`}>
      {showWorkspaceHeader && !isImageWorkspace && <header className={`flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-4 ${isImageWorkspace ? "py-2" : "py-2.5"}`}>
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

      <div className={isImageWorkspace ? "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_286px] gap-px overflow-hidden bg-slate-200 2xl:grid-cols-[minmax(0,3.35fr)_minmax(286px,1fr)]" : ""}>
      {showEvidence && <div className={isImageWorkspace ? "flex min-h-0 min-w-0 flex-col overflow-hidden bg-slate-950 p-1.5" : "border-b border-slate-200 bg-slate-50/50 px-4 py-3"}>
        {!isImageWorkspace && (
          <div className="mb-2 flex items-center justify-between gap-3">
            <div><p className="text-[10px] font-semibold text-blue-600">원본 근거</p><h2 className="mt-0.5 text-sm font-bold text-slate-800">원본 영상</h2></div>
            <p className="whitespace-nowrap text-[10px] text-slate-400">영상 조작은 뷰어 안에서 바로 수행합니다.</p>
          </div>
        )}
        <div className={isImageWorkspace ? "min-h-0 flex-1" : "overflow-x-auto"}>{caseId && apiBaseUrl && authorizedFetch ? (stage === "CT" ? <CaseCtSegmentationEvidence key={caseId} caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} analysisId={aiResult?.id} nodules={ctNodules} onEvidenceInfoChange={onCtEvidenceInfoChange} /> : stage === "PET_CT_TNM" ? <CaseDicomEvidence key={caseId} caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} stage={stage} /> : <CaseImageEvidence key={caseId} caseId={caseId} apiBaseUrl={apiBaseUrl} authorizedFetch={authorizedFetch} stage={stage} />) : <EvidenceViewerPanel />}</div>
      </div>}

      <aside data-clinical-rail className={isImageWorkspace ? "flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto bg-[#f8fafc] p-2 [scrollbar-gutter:stable]" : compactRail ? "flex min-h-0 flex-col gap-2" : "grid grid-cols-2 divide-x divide-slate-200"} aria-label="Imaging result rail">
        <SourcePanel compact={isImageWorkspace || compactRail} eyebrow={imaging ? "호흡기내과" : config.department} title={clinicalRole} meta={formatDateTime(clinicalResult?.result_date)} tone="specialist">
          {clinicalError ? <PanelError message={clinicalError} retrying={clinicalRetrying} onRetry={onRetryClinical} /> : specialistValues.length > 0 ? <ResultValues values={specialistValues} accent="specialist" compact={isImageWorkspace || compactRail} /> : <EmptyResult title="확정 결과 없음" text="확인 가능한 확정 결과가 없습니다. 결과가 확정되면 핵심 소견이 표시됩니다." nextAction={clinicalRole + " 결과 대기 · 결과가 확정되면 검토합니다."} />}
          {specialistAction && !clinicalError && clinicalResult?.result_status !== "CONFIRMED" && <div className="flex justify-center px-3 pb-3">{specialistAction}</div>}
        </SourcePanel>

        <SourcePanel compact={isImageWorkspace || compactRail} eyebrow="AI 분석" title="AI 분석 후보" meta={isImageWorkspace ? formatDateTime(aiResult?.completed_at) : [aiResult?.model_name, aiResult?.model_version_name].filter(Boolean).join(" · ") || "모델 정보 없음"} tone="ai">
          {aiError ? <PanelError message={aiError} retrying={aiRetrying} onRetry={onRetryAi} /> : aiValues.length > 0 || hasCtAiData ? stage === "CT" ? <CtAiSummary detail={aiResult?.result_detail} /> : <ResultValues values={aiValues} accent="ai" compact={isImageWorkspace || compactRail} /> : <EmptyResult title="AI 후보 없음" text="현재 검사에 연결된 AI 분석 후보가 없습니다." nextAction="다음 행동: 원본 영상을 확인한 뒤 AI 분석 완료 상태를 다시 확인하세요." />}
        </SourcePanel>

        {isImageWorkspace ? (
          <>
            <ImagingWorkflowSummary
              stage={stage}
              aiStatus={aiResult?.status}
              clinicalStatus={clinicalResult?.result_status}
              clinicalRole={clinicalRole}
              hasSourceAsset={Boolean(aiResult?.input_context?.source_asset)}
            />
            {stage === "CT" ? (
              <details data-technical-metadata className="shrink-0 border-t border-slate-200 py-2 text-[10px]"><summary className="cursor-pointer font-semibold text-slate-500">분석 · 영상 정보</summary><AnalysisImageInfoCard aiResult={aiResult} evidenceInfo={ctEvidenceInfo} /></details>
            ) : (
              <AiTraceabilityCard aiResult={aiResult} collapsible />
            )}
          </>
        ) : (
          <>
            <WorkflowStatusFlow
              stage={stage}
              aiStatus={aiResult?.status}
              clinicalStatus={clinicalResult?.result_status}
              hasSourceAsset={Boolean(aiResult?.input_context?.source_asset)}
            />
            {stage === "CT" ? <AnalysisImageInfoCard aiResult={aiResult} evidenceInfo={ctEvidenceInfo} /> : <AiTraceabilityCard aiResult={aiResult} />}
          </>
        )}

        {stage === "CT" && (onRefreshResults || lastSyncedAt) && <CtResultSyncStatus lastSyncedAt={lastSyncedAt} syncing={syncingResults} onRefresh={onRefreshResults} notice={syncNotice} />}
        {stage !== "CT" && !isImageWorkspace && (onRefreshResults || lastSyncedAt) && <ResultSyncStatus lastSyncedAt={lastSyncedAt} syncing={syncingResults} onRefresh={onRefreshResults} notice={syncNotice} />}
        {!isImageWorkspace && <AiInputTraceabilityCard aiResult={aiResult} />}
      </aside>
      </div>

    </section>
  );
}

function CtAiSummary({ detail }: { detail: unknown }) {
  const root = asRecord(detail);
  const ct = asRecord(root?.ct);
  if (!ct) return null;
  const risk = ct?.overall_malignancy_risk;
  const nodules = Array.isArray(ct?.nodules) ? ct.nodules : [];
  return <div className="mx-3 my-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3">
    <p className="text-[11px] font-semibold text-blue-800">CT AI 분석 결과</p>
    <div className="mt-2 grid grid-cols-2 gap-2">
      <CtSummaryValue label="악성 위험도" value={formatPercent(risk)} emphasis />
      <CtSummaryValue label="결절 수" value={`${nodules.length}개`} />
    </div>
    {nodules.length > 0 ? <div className="mt-2 space-y-2">{nodules.map((value, index) => <CtNoduleDetail key={`${asRecord(value)?.nodule_no ?? index}-${index}`} value={value} index={index} />)}</div> : <div className="mt-2 rounded-md border border-dashed border-blue-200 bg-white/70 px-3 py-3 text-center text-[10px] text-slate-500">검출된 결절이 없습니다.</div>}
    <p className="mt-3 text-[10px] leading-4 text-blue-800">AI 결과는 의료진 확정 판독과 함께 검토해야 합니다.</p>
  </div>;
}

function CtSummaryValue({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="min-w-0 rounded-md border border-blue-100 bg-white px-2.5 py-2"><p className="text-[9px] text-slate-500">{label}</p><p className={`mt-0.5 truncate font-bold ${emphasis ? "text-base text-rose-600" : "text-sm text-blue-700"}`}>{value}</p></div>;
}

function CtNoduleDetail({ value, index }: { value: unknown; index: number }) {
  const nodule = asRecord(value);
  const payload = asRecord(nodule?.finding_payload);
  const quantification = asRecord(payload?.quantification);
  const morphology = asRecord(payload?.morphology);
  const texture = asRecord(payload?.texture);
  const malignancy = asRecord(payload?.malignancy);
  const malignancyPrediction = asRecord(malignancy?.prediction);
  const morphologyPrediction = asRecord(morphology?.prediction);
  const texturePrediction = asRecord(texture?.prediction);
  const number = nodule?.nodule_no ?? index + 1;
  const diameter = quantification?.maximum_3d_diameter_mm ?? quantification?.equivalent_diameter_mm;
  const malignancyRisk = nodule?.malignancy_risk ?? malignancyPrediction?.malignancy_score ?? probabilityToPercent(malignancyPrediction?.probability);
  const textureValue = texture?.prediction_label ?? texturePrediction?.pattern ?? (typeof texture?.prediction === "string" ? texture.prediction : null);
  const spiculation = asRecord(morphology?.spiculation)?.prediction ?? morphologyPrediction?.spiculation;
  const lobulation = asRecord(morphology?.lobulation)?.prediction ?? morphologyPrediction?.lobulation;
  const malignancyLabel = formatMalignancyPrediction(malignancyPrediction?.prediction);

  return <section data-testid={`ct-nodule-${number}`} className="rounded-md border border-slate-200 bg-white p-2.5">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-bold text-slate-800">결절 #{String(number)}</h3>
      {malignancyLabel && <span className={`rounded-full px-2 py-0.5 text-[8px] font-semibold ${malignancyLabel === "악성 의심" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{malignancyLabel}</span>}
    </div>
    <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-2">
      <CtNoduleField label="직경" value={formatMeasurement(diameter, "mm")} />
      <CtNoduleField label="부피" value={formatMeasurement(quantification?.volume_mm3, "mm³")} />
      <CtNoduleField label="악성도" value={formatPercent(malignancyRisk)} />
      <CtNoduleField label="질감(Texture)" value={formatTexture(textureValue)} />
      <CtNoduleField label="Spiculation" value={formatPresence(spiculation)} />
      <CtNoduleField label="Lobulation" value={formatPresence(lobulation)} />
    </dl>
  </section>;
}

function CtNoduleField({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="truncate text-[8px] text-slate-400" title={label}>{label}</dt><dd className="mt-0.5 break-words text-[9px] font-semibold leading-3.5 text-slate-700">{value}</dd></div>;
}

function formatMeasurement(value: unknown, unit: string) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number.toLocaleString("ko-KR", { maximumFractionDigits: 2 })} ${unit}`;
}

function formatPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) {
    const text = String(value).trim();
    return ["NAN", "UNDEFINED", "NULL", "INFINITY", "-INFINITY"].includes(text.toUpperCase()) ? "-" : text;
  }
  return `${number.toFixed(2)}%`;
}

function probabilityToPercent(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number * 100 : null;
}

function formatTexture(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  const labels: Record<string, string> = {
    SOLID: "고형(Solid)",
    PART_SOLID: "부분고형(Part-solid)",
    GGO: "간유리(GGO)",
    GROUND_GLASS: "간유리(GGO)",
  };
  const normalized = String(value).trim().toUpperCase();
  return labels[normalized] ?? String(value);
}

function formatPresence(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "있음" : "없음";
  const normalized = String(value).trim().toUpperCase();
  if (["POSITIVE", "PRESENT", "TRUE", "YES"].includes(normalized)) return "있음";
  if (["NEGATIVE", "ABSENT", "FALSE", "NO"].includes(normalized)) return "없음";
  if (["INDETERMINATE", "UNKNOWN"].includes(normalized)) return "판정불가";
  return String(value);
}

function formatMalignancyPrediction(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === "MALIGNANT") return "악성 의심";
  if (normalized === "BENIGN") return "양성 의심";
  return "";
}

function SourcePanel({ eyebrow, title, meta, tone, children, compact = false }: { eyebrow: string; title: string; meta: string; tone: "specialist" | "ai"; children: React.ReactNode; compact?: boolean }) {
  return <section className={compact ? "shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" : "min-w-0"}><header className={`flex shrink-0 items-start justify-between gap-3 border-b px-3 ${compact ? "min-h-[46px] py-2" : "min-h-[74px] py-2.5"} ${tone === "specialist" ? "border-emerald-100 bg-emerald-50/40" : "border-blue-100 bg-blue-50/40"}`}><div><p className={`text-[9px] font-semibold ${tone === "specialist" ? "text-emerald-700" : "text-blue-700"}`}>{eyebrow}</p><h2 className={`${compact ? "mt-0.5 text-[13px]" : "mt-1 text-sm"} font-bold text-slate-900`}>{title}</h2>{tone === "ai" && !compact && <p className="mt-1 text-[10px] text-slate-400">의료진 확정 결과가 아닌 참고 자료입니다.</p>}</div><p className="max-w-28 truncate text-right text-[9px] text-slate-400">{meta}</p></header><div className={compact ? "" : "min-h-[190px]"}>{children}</div></section>;
}

function AnalysisImageInfoCard({ aiResult, evidenceInfo }: { aiResult?: AiResult; evidenceInfo: CtEvidenceInfo }) {
  const items = [
    ["모델", aiResult?.model_name ?? ""],
    ["버전", aiResult?.model_version_name ?? ""],
    ["Series UID", evidenceInfo.seriesInstanceUid ?? aiResult?.input_context?.source_asset?.series_instance_uid ?? ""],
    ["이미지 수", evidenceInfo.imageCount !== undefined ? `${evidenceInfo.imageCount}장` : ""],
    ["분할 결과", evidenceInfo.segmentationAvailable ? "사용 가능" : ""],
    ["분석 시작", formatDateTime(aiResult?.started_at)],
    ["분석 완료", formatDateTime(aiResult?.completed_at)],
  ].flatMap(([label, value]) => value && value !== "-" ? [[label, value] as [string, string]] : []);
  if (!items.length) return null;
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3"><p className="text-[10px] font-bold text-slate-700">분석 · 영상 정보</p><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">{items.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-400">{label}</dt><dd className="mt-0.5 truncate font-medium text-slate-700" title={value}>{value}</dd></div>)}</dl></section>;
}

function AiTraceabilityCard({ aiResult, collapsible = false }: { aiResult?: AiResult; collapsible?: boolean }) {
  const succeeded = aiResult?.status === "SUCCEEDED";
  const asset = aiResult?.input_context?.source_asset;
  const inputSeries = asset?.series_instance_uid ? `Series ${asset.series_instance_uid}` : asset?.image_type ? `${asset.image_type} · Series 정보 없음` : "정보 없음";
  const components = formatModelComponents(aiResult?.model_components);

  const content = <><dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 pb-3 text-[9px]"><div><dt className="text-slate-400">모델</dt><dd className="truncate font-medium text-slate-700">{aiResult?.model_name ?? "정보 없음"}</dd></div><div><dt className="text-slate-400">버전</dt><dd className="truncate font-medium text-slate-700">{aiResult?.model_version_name ?? "정보 없음"}</dd></div><div><dt className="text-slate-400">분석 시각</dt><dd className="truncate font-medium text-slate-700">{formatDateTime(aiResult?.completed_at)}</dd></div><div><dt className="text-slate-400">입력 Series</dt><dd className="truncate font-medium text-slate-700">{inputSeries}</dd></div>{components && <div className="col-span-2"><dt className="text-slate-400">모델 구성</dt><dd className="truncate font-medium text-slate-700">{components}</dd></div>}</dl><p className="mx-3 mb-3 rounded-md bg-amber-50 px-2 py-1.5 text-[9px] leading-4 text-amber-800">AI 결과는 확정 진단이 아닌 참고 자료입니다. 의료진 검토가 필요합니다.</p></>;

  if (collapsible) {
    return <details className="group shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[10px] font-bold text-slate-700 marker:content-none"><span>모델 정보</span><span className="flex items-center gap-2"><span className={`rounded px-2 py-0.5 text-[8px] font-semibold ${succeeded ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{resultStatusLabel(aiResult?.status ?? aiResult?.status_label)}</span><span aria-hidden="true" className="text-slate-400 transition group-open:rotate-180">⌄</span></span></summary>{content}</details>;
  }

  return <section className="shrink-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-bold text-slate-700">AI 분석 정보</p><span className={`rounded px-2 py-1 text-[9px] font-semibold ${succeeded ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{resultStatusLabel(aiResult?.status ?? aiResult?.status_label)}</span></div><div className="-mx-3 mt-2">{content}</div></section>;
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

type WorkflowStatusFlowStage = "XRAY" | "CT" | "PET_CT_TNM" | "PATHOLOGY_GENE" | "PDL1" | "TREATMENT" | "PRESCRIPTION";
type WorkflowFlowState = "completed" | "active" | "pending" | "failed";
type WorkflowFlowStep = { label: string; status: string; state: WorkflowFlowState };

function aiFlowState(status?: string): WorkflowFlowState {
  if (status === "SUCCEEDED") return "completed";
  if (status === "FAILED" || status === "ERROR") return "failed";
  return status ? "active" : "pending";
}

function sourceStep(label: string, hasSourceAsset: boolean, hasAiStatus: boolean): WorkflowFlowStep {
  // An analysis record can only be created from registered input, but do not
  // claim registration when neither an input asset nor an analysis exists.
  return { label, status: hasSourceAsset || hasAiStatus ? "등록 완료" : "등록 상태 정보 없음", state: hasSourceAsset || hasAiStatus ? "completed" : "pending" };
}

function buildWorkflowSteps({ stage, aiStatus, clinicalStatus, hasSourceAsset, treatmentStatus, prescriptionStatus, caseStatus }: {
  stage: WorkflowStatusFlowStage;
  aiStatus?: string;
  clinicalStatus?: string;
  hasSourceAsset?: boolean;
  treatmentStatus?: string;
  prescriptionStatus?: string;
  caseStatus?: string;
}): WorkflowFlowStep[] {
  const ai = { label: "AI 분석", status: resultStatusLabel(aiStatus), state: aiFlowState(aiStatus) } as WorkflowFlowStep;
  const confirmed = clinicalStatus === "CONFIRMED";
  const submitted = clinicalStatus === "DRAFT" || confirmed;
  const hasAiStatus = Boolean(aiStatus);

  if (stage === "XRAY") return [
    sourceStep("영상 등록", Boolean(hasSourceAsset), hasAiStatus),
    ai,
    { label: "호흡기내과 최종 판단", status: confirmed ? "확정 완료" : ai.state === "completed" ? "판단 대기" : "결과 대기", state: confirmed ? "completed" : ai.state === "completed" ? "active" : "pending" },
  ];
  if (stage === "CT") return [
    sourceStep("CT 영상 등록", Boolean(hasSourceAsset), hasAiStatus),
    ai,
    { label: "호흡기내과 최종 판단", status: confirmed ? "확정 완료" : ai.state === "completed" ? "판단 대기" : "결과 대기", state: confirmed ? "completed" : ai.state === "completed" ? "active" : "pending" },
  ];
  if (stage === "PET_CT_TNM") return [
    sourceStep("CT·PET 영상 준비", Boolean(hasSourceAsset), hasAiStatus),
    { label: "T/N/M 분석", status: resultStatusLabel(aiStatus), state: aiFlowState(aiStatus) },
    { label: "TNM 검토", status: confirmed ? "검토 완료" : clinicalStatus === "DRAFT" ? "검토 중" : ai.state === "completed" ? "검토 대기" : "분석 대기", state: confirmed ? "completed" : clinicalStatus === "DRAFT" || ai.state === "completed" ? "active" : "pending" },
    { label: "호흡기내과 최종 확정", status: confirmed ? "확정 완료" : submitted ? "확정 대기" : "검토 대기", state: confirmed ? "completed" : submitted ? "active" : "pending" },
  ];
  if (stage === "PATHOLOGY_GENE" || stage === "PDL1") {
    const registrationLabel = stage === "PATHOLOGY_GENE" ? "검체·WSI 등록" : "WSI/데이터 등록";
    return [
      sourceStep(registrationLabel, Boolean(hasSourceAsset), hasAiStatus),
      ai,
      { label: stage === "PATHOLOGY_GENE" ? "호흡기내과 확인" : "호흡기내과 확정", status: confirmed ? "확정 완료" : submitted ? "확인 대기" : "제출 대기", state: confirmed ? "completed" : submitted ? "active" : "pending" },
    ];
  }
  if (stage === "TREATMENT") return [
    { label: "이전 결과 종합", status: treatmentStatus ? "종합 완료" : "상태 정보 없음", state: treatmentStatus ? "completed" : "pending" },
    { label: "치료계획 작성", status: treatmentStatus === "DRAFT" || treatmentStatus === "CONFIRMED" ? "작성 완료" : "작성 대기", state: treatmentStatus === "DRAFT" || treatmentStatus === "CONFIRMED" ? "completed" : "active" },
    { label: "치료계획 확정", status: treatmentStatus === "CONFIRMED" ? "확정 완료" : "확정 대기", state: treatmentStatus === "CONFIRMED" ? "completed" : "pending" },
  ];
  return [
    { label: "처방 작성", status: prescriptionStatus ? "작성 완료" : "작성 대기", state: prescriptionStatus ? "completed" : "active" },
    { label: "처방 확정", status: prescriptionStatus === "FINAL" ? "확정 완료" : "확정 대기", state: prescriptionStatus === "FINAL" ? "completed" : "pending" },
    { label: "Case 종료 또는 의뢰", status: caseStatus === "CLOSED" || caseStatus === "REFERRED_OUT" ? "처리 완료" : "처리 대기", state: caseStatus === "CLOSED" || caseStatus === "REFERRED_OUT" ? "completed" : "pending" },
  ];
}

function ImagingWorkflowSummary({ stage, aiStatus, clinicalStatus, clinicalRole, hasSourceAsset }: {
  stage: string;
  aiStatus?: string;
  clinicalStatus?: string;
  clinicalRole: string;
  hasSourceAsset: boolean;
}) {
  const steps = buildWorkflowSteps({
    stage: stage as WorkflowStatusFlowStage,
    aiStatus,
    clinicalStatus,
    hasSourceAsset,
  });

  return <section className="shrink-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <p className="text-[10px] font-bold text-slate-700">진행 상태</p>
      <div className="flex items-center gap-2 text-[8px] font-semibold">
        <span className="text-emerald-700">{clinicalRole} · {resultStatusLabel(clinicalStatus)}</span>
        <span className="text-blue-700">AI · {resultStatusLabel(aiStatus)}</span>
      </div>
    </div>
    <ol className="mt-2 grid grid-cols-3 gap-1.5">
      {steps.slice(0, 3).map((step, index) => (
        <li key={step.label} className="min-w-0 rounded-md bg-slate-50 px-2 py-2 text-center">
          <span data-workflow-state={step.state} className={`mx-auto flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold ${step.state === "completed" ? "bg-emerald-500 text-white" : step.state === "active" ? "border border-blue-300 bg-blue-50 text-blue-700" : step.state === "failed" ? "bg-rose-500 text-white" : "border border-slate-300 bg-white text-slate-400"}`}>{index + 1}</span>
          <p className="mt-1 truncate text-[8px] font-semibold text-slate-600" title={step.label}>{step.label}</p>
          <p className="mt-0.5 truncate text-[8px] text-slate-400" title={step.status}>{step.status}</p>
        </li>
      ))}
    </ol>
  </section>;
}

export function WorkflowStatusFlow({ stage, aiStatus, clinicalStatus, hasSourceAsset = false, treatmentStatus, prescriptionStatus, caseStatus }: {
  stage: string;
  aiStatus?: string;
  clinicalStatus?: string;
  hasSourceAsset?: boolean;
  treatmentStatus?: string;
  prescriptionStatus?: string;
  caseStatus?: string;
}) {
  const steps = buildWorkflowSteps({ stage: stage as WorkflowStatusFlowStage, aiStatus, clinicalStatus, hasSourceAsset, treatmentStatus, prescriptionStatus, caseStatus });
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] font-bold text-slate-700">판단 상태 흐름</p><ol className="mt-2 space-y-2">{steps.map((step, index) => <li key={step.label} className="flex items-center gap-2 text-[10px]"><span data-workflow-state={step.state} className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold ${step.state === "completed" ? "bg-emerald-500 text-white" : step.state === "active" ? "border border-blue-300 bg-blue-50 text-blue-700" : step.state === "failed" ? "bg-rose-500 text-white" : "border border-slate-300 bg-white text-slate-400"}`}>{index + 1}</span><span className="font-medium text-slate-700">{step.label}</span><span className="ml-auto text-slate-500">{step.status}</span></li>)}</ol></section>;
}

export function ResultSyncStatus({ lastSyncedAt, syncing, onRefresh, notice = "" }: { lastSyncedAt?: Date | null; syncing: boolean; onRefresh?: () => void; notice?: string }) {
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold text-slate-700">결과 동기화</p><p className="mt-1 text-[10px] text-slate-500">{syncing ? "결과를 갱신하는 중입니다." : lastSyncedAt ? `마지막 갱신 ${lastSyncedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "자동 갱신: 30초"}</p></div>{onRefresh && <button type="button" onClick={onRefresh} disabled={syncing} className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{syncing ? "갱신 중" : "지금 새로고침"}</button>}</div>{notice && <p role="status" className="mt-2 rounded bg-emerald-50 px-2 py-1.5 text-[10px] font-semibold text-emerald-700">{notice}</p>}</section>;
}

function CtResultSyncStatus({ lastSyncedAt, syncing, onRefresh, notice = "" }: { lastSyncedAt?: Date | null; syncing: boolean; onRefresh?: () => void; notice?: string }) {
  return <section className="shrink-0 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold text-slate-700">결과 동기화</p><p className="mt-1 text-[10px] text-slate-500">30초 자동 갱신 · {syncing ? "갱신 중" : "대기 중"}</p>{lastSyncedAt && <p className="mt-0.5 text-[10px] text-slate-500">마지막 갱신 {lastSyncedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</p>}</div>{onRefresh && <button type="button" onClick={onRefresh} disabled={syncing} className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-[10px] font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{syncing ? "갱신 중" : "지금 새로고침"}</button>}</div>{notice && <p role="status" className="mt-2 rounded bg-emerald-50 px-2 py-1.5 text-[10px] font-semibold text-emerald-700">{notice}</p>}</section>;
}

function StatusBadge({ label, value, status, tone }: { label: string; value?: string; status?: string; tone: "specialist" | "ai" }) {
  const failed = status === "FAILED" || status === "ERROR";
  const inProgress = status === "PENDING" || status === "QUEUED" || status === "RUNNING" || status === "REQUESTED";
  const colors = failed ? "border-rose-200 bg-rose-50 text-rose-700" : inProgress ? "border-amber-200 bg-amber-50 text-amber-700" : value ? (tone === "specialist" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700") : "border-slate-200 bg-slate-50 text-slate-400";
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${colors}`}>{label} · {resultStatusLabel(status ?? value)}</span>;
}

function ResultValues({ values, accent, compact = false }: { values: [string, string][]; accent: "specialist" | "ai"; compact?: boolean }) {
  return <dl className={`grid grid-cols-2 ${compact ? "gap-1.5 p-3" : "gap-2 p-4"}`}>{values.map(([label, value], index) => <div key={`${label}-${value}-${index}`} className={`min-w-0 rounded-lg border ${compact ? "px-2.5 py-2" : "px-3 py-2.5"} ${accent === "specialist" ? "border-emerald-100 bg-emerald-50/50" : "border-blue-100 bg-blue-50/50"}`}><dt className={`whitespace-nowrap ${compact ? "text-[9px]" : "text-[10px]"} text-slate-500`}>{label}</dt><dd className={`${compact ? "mt-0.5 text-[11px]" : "mt-1 text-xs"} break-words font-semibold text-slate-800`}>{value}</dd></div>)}</dl>;
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
