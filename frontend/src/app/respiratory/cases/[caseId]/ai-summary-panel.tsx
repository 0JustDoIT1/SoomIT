"use client";

import { type ReactNode, useMemo, useState } from "react";

type AiSummaryResult = {
  id?: string;
  analysis_type: string;
  analysis_type_label?: string;
  status?: string;
  status_label?: string;
  model_name?: string;
  model_version_name?: string;
  created_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  result_detail?: unknown;
};

type ClinicalSummaryResult = {
  id?: string;
  workflow_stage: string;
  result_status?: string;
  result_status_label?: string;
  result_date?: string | null;
  result_detail?: unknown;
};

const ANALYSIS_CONFIG = [
  { type: "XRAY_ANALYSIS", label: "흉부 X선", clinical: ["XRAY"] },
  { type: "CT_ANALYSIS", label: "흉부 CT", clinical: ["CT"] },
  { type: "PET_CT_TNM_ANALYSIS", label: "PET-CT / TNM 병기", clinical: ["PET_CT_TNM"] },
  { type: "PATHOLOGY_GENE_ANALYSIS", label: "조직·유전자 분석", clinical: ["PATHOLOGY_GENE"] },
  { type: "PDL1_ANALYSIS", label: "PD-L1", clinical: ["PDL1"] },
  { type: "TREATMENT_RECOMMENDATION", label: "치료 추천", clinical: [] },
  { type: "ALL_ANALYSES", label: "AI 종합 분석", clinical: [] },
] as const;

export function AiSummaryPanel({ aiResults, clinicalResults, evidenceByAnalysis, reviewRequest, error, retrying = false, onRetry }: { aiResults: AiSummaryResult[]; clinicalResults: ClinicalSummaryResult[]; evidenceByAnalysis?: Partial<Record<string, ReactNode>>; reviewRequest?: { analysisType: string } | null; error?: string; retrying?: boolean; onRetry?: () => void }) {
  const rows = useMemo(() => ANALYSIS_CONFIG.map((config) => ({
    ...config,
    ai: selectPreferredAiResult(aiResults, config.type),
    clinical: findClinicalResult(config.type, config.clinical, clinicalResults),
  })), [aiResults, clinicalResults]);
  const analysisRows = rows.filter((row) => row.type !== "ALL_ANALYSES");
  const [selectedType, setSelectedType] = useState<string>(() => reviewRequest?.analysisType ?? analysisRows.find((row) => row.ai || row.clinical)?.type ?? analysisRows[0].type);
  const [openEvidenceType, setOpenEvidenceType] = useState<string | null>(() => reviewRequest?.analysisType ?? null);
  const selected = analysisRows.find((row) => row.type === selectedType) ?? analysisRows[0];

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-2.5">
        <div>
          <p className="text-[10px] font-semibold text-blue-600">조회 전용 진료 지원</p>
          <h1 className="mt-0.5 text-base font-bold text-slate-900">AI 종합 분석</h1>
          <p className="mt-1 text-xs text-slate-600">검사별 AI 분석 후보와 의료진 확정 결과를 한 화면에서 비교합니다.</p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-semibold text-amber-700">AI 결과는 확정 진단이 아닙니다</span>
      </header>

      {error && (
        <div className="m-3 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700" role="alert">
          <span>{error}</span>
          {onRetry && <button type="button" onClick={onRetry} disabled={retrying} className="shrink-0 rounded-md border border-rose-200 bg-white px-3 py-1.5 font-semibold disabled:opacity-50">{retrying ? "재시도 중" : "다시 시도"}</button>}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 border-t border-slate-200 lg:grid-cols-[minmax(220px,35fr)_minmax(0,65fr)]">
        <AnalysisMasterList rows={analysisRows} selectedType={selected.type} onSelect={(analysisType) => { setSelectedType(analysisType); setOpenEvidenceType(null); }} />
        <article className="min-h-0 overflow-y-auto p-3 [scrollbar-gutter:stable]" role="tabpanel" aria-label={`${selected.label} 분석 결과`}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
            <div><p className="text-[10px] font-semibold text-blue-600">선택한 분석 항목</p><h2 className="mt-0.5 text-sm font-bold text-slate-900">{selected.label}</h2></div>
            <StatusBadge status={selected.ai?.status} label={selected.ai?.status_label} />
          </div>
          <div className="mt-3 grid min-h-0 grid-cols-1 overflow-hidden rounded-lg border border-slate-200 md:grid-cols-2 md:divide-x md:divide-slate-200"><SummaryColumn source="AI 소견" tone="blue" primary={getAiDisplaySummary(selected.type, selected.ai)} secondary={getModelLabel(selected.ai)} /><SummaryColumn source="전문과 의료진 확정 소견" tone="emerald" primary={getClinicalSummary(selected.type, selected.clinical)} secondary={formatDate(selected.clinical?.result_date)} /></div>
          {selected.type === "PATHOLOGY_GENE_ANALYSIS" && <GeneResultDetails aiDetail={selected.ai?.status === "SUCCEEDED" ? selected.ai.result_detail : null} clinicalDetail={selected.clinical?.result_detail} />}
          <ComparisonBadge comparison={compareResults(selected.type, selected.ai, selected.clinical)} />
          {selected.ai?.error_message && <p className="border-t border-rose-100 bg-rose-50 px-3 py-2 text-[10px] text-rose-700">{selected.ai.error_message}</p>}
          {evidenceByAnalysis?.[selected.type] && <details open={openEvidenceType === selected.type} onToggle={(event) => setOpenEvidenceType(event.currentTarget.open ? selected.type : null)} className="mt-3 overflow-hidden rounded-lg border border-blue-100 bg-blue-50/30"><summary className="cursor-pointer select-none border-b border-blue-100 px-3 py-1.5 text-[11px] font-semibold text-blue-700">영상·검체 근거 확인</summary>{openEvidenceType === selected.type && <EvidenceWorkspace evidence={evidenceByAnalysis[selected.type]} selected={selected} />}</details>}
          <button type="button" onClick={() => setOpenEvidenceType(selected.type)} className="mt-2 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-50">{selected.label} 상세 근거 보기</button>
        </article>
      </div>
      <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] leading-4 text-slate-500">이 화면에서는 AI 분석을 실행하거나 결과를 확정하지 않습니다. 최종 진단과 치료 결정은 의료진 확정 결과를 기준으로 합니다.</p>
    </section>
  );
}

function SummaryColumn({ source, tone, primary, secondary }: { source: string; tone: "blue" | "emerald"; primary: string; secondary: string }) {
  return <div className="min-w-0 p-3"><p className={`text-[9px] font-semibold ${tone === "blue" ? "text-blue-600" : "text-emerald-600"}`}>{source}</p><p className="mt-1.5 break-words text-xs font-bold text-slate-800">{primary}</p><p className="mt-1.5 truncate text-[9px] text-slate-400">{secondary}</p></div>;
}

function EvidenceWorkspace({ evidence, selected }: { evidence: ReactNode; selected: { type: string; label: string; ai?: AiSummaryResult; clinical?: ClinicalSummaryResult } }) {
  const model = [selected.ai?.model_name, selected.ai?.model_version_name && `v${selected.ai.model_version_name}`].filter(Boolean).join(" · ") || "모델 정보 없음";
  return <div className="grid h-[clamp(350px,42vh,420px)] min-h-0 grid-cols-1 border-t border-blue-100 bg-white lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <div className="min-h-0 overflow-auto border-b border-blue-100 bg-slate-950 [scrollbar-gutter:stable] lg:border-b-0 lg:border-r">{evidence}</div>
    <aside className="min-h-0 overflow-y-auto p-3 [scrollbar-gutter:stable]">
      <EvidenceInfoSection title="AI 분석 결과" tone="blue">
        <EvidenceItem label="AI 소견" value={getAiDisplaySummary(selected.type, selected.ai)} />
        <EvidenceItem label="모델" value={model} />
        <EvidenceItem label="분석 시각" value={formatDate(selected.ai?.completed_at ?? selected.ai?.created_at)} />
      </EvidenceInfoSection>
      <EvidenceInfoSection title="전문과 의료진 확정 결과" tone="emerald">
        <EvidenceItem label="확정 소견" value={getClinicalSummary(selected.type, selected.clinical)} />
        <EvidenceItem label="확정 시각" value={formatDate(selected.clinical?.result_date)} />
      </EvidenceInfoSection>
      <EvidenceInfoSection title="근거 및 검토 정보" tone="slate">
        <EvidenceItem label="연결된 검사" value={selected.label} />
        <EvidenceItem label="AI 상태" value={selected.ai?.status_label || getAnalysisStatusLabel(selected.ai?.status)} />
        <EvidenceItem label="검토 상태" value={selected.clinical?.result_status_label || selected.clinical?.result_status || "확정 결과 없음"} />
      </EvidenceInfoSection>
    </aside>
  </div>;
}

function EvidenceInfoSection({ title, tone, children }: { title: string; tone: "blue" | "emerald" | "slate"; children: ReactNode }) {
  const color = tone === "blue" ? "text-blue-700" : tone === "emerald" ? "text-emerald-700" : "text-slate-700";
  return <section className="border-b border-slate-100 py-2.5 first:pt-0 last:border-b-0 last:pb-0"><h3 className={`text-[10px] font-bold ${color}`}>{title}</h3><dl className="mt-1.5 space-y-1.5">{children}</dl></section>;
}

function EvidenceItem({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-[10px]"><dt className="text-slate-400">{label}</dt><dd className="min-w-0 break-words font-medium text-slate-700">{value}</dd></div>;
}

function AnalysisMasterList({ rows, selectedType, onSelect }: { rows: { type: string; label: string; ai?: AiSummaryResult; clinical?: ClinicalSummaryResult }[]; selectedType: string; onSelect: (analysisType: string) => void }) {
  return <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50/70 p-2 [scrollbar-gutter:stable] lg:border-b-0 lg:border-r" aria-label="검사별 AI 분석 목록">
    <p className="px-1 pb-2 text-[10px] font-bold text-slate-500">검사별 결과</p>
    <div className="space-y-1.5">
      {rows.map((row) => {
        const selected = row.type === selectedType;
        return <button key={row.type} type="button" aria-pressed={selected} onClick={() => onSelect(row.type)} className={`block w-full rounded-lg border p-2.5 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${selected ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-300"}`}>
          <div className="flex items-center justify-between gap-2"><span className="truncate text-[11px] font-bold text-slate-800">{row.label}</span><StatusBadge status={row.ai?.status} label={row.ai?.status_label} /></div>
          <p className="mt-1 truncate text-[10px] text-slate-700"><span className="mr-1 font-semibold text-blue-600">AI</span>{getAiDisplaySummary(row.type, row.ai)}</p>
          <p className="mt-1 truncate text-[10px] text-slate-500"><span className="mr-1 font-semibold text-emerald-600">확정</span>{getClinicalSummary(row.type, row.clinical)}</p>
        </button>;
      })}
    </div>
  </aside>;
}

function StatusBadge({ status, label }: { status?: string; label?: string }) {
  const color = status === "SUCCEEDED" ? "bg-blue-50 text-blue-700" : status === "FAILED" ? "bg-rose-50 text-rose-700" : status ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${color}`} title={label && label !== getAnalysisStatusLabel(status) ? label : undefined}>{getAnalysisStatusLabel(status)}</span>;
}

export function selectPreferredAiResult(results: AiSummaryResult[], analysisType: string) {
  const matching = results.filter((item) => item.analysis_type === analysisType);
  const succeeded = matching.filter((item) => item.status === "SUCCEEDED");
  return newestResult(succeeded.length ? succeeded : matching);
}

function newestResult(results: AiSummaryResult[]) {
  return results.reduce<AiSummaryResult | undefined>((latest, item) => {
    if (!latest) return item;
    const latestTime = resultTimestamp(latest);
    const itemTime = resultTimestamp(item);
    if (latestTime === null || itemTime === null) return latestTime === null && itemTime !== null ? item : latest;
    return itemTime > latestTime ? item : latest;
  }, undefined);
}

function resultTimestamp(result: AiSummaryResult) {
  const value = result.completed_at || result.created_at;
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function ComparisonBadge({ comparison }: { comparison: Comparison }) {
  const styles = comparison.state === "MATCH" ? "bg-emerald-50 text-emerald-700" : comparison.state === "DIFFERENT" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500";
  return <div className="border-t border-slate-200 px-3 py-2" aria-label="AI와 의료진 결과 비교"><div className="flex items-center justify-between gap-2"><span className="text-[9px] text-slate-400">결과 비교</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${styles}`}>{comparison.label}</span></div>{comparison.differences.length > 0 && <ul className="mt-2 space-y-1 border-t border-amber-100 pt-2" aria-label="결과 차이 항목">{comparison.differences.map((difference) => <li key={difference.label} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-[9px]"><span className="font-semibold text-slate-600">{difference.label}</span><span className="min-w-0 break-words text-right text-amber-700">AI {formatComparable(difference.ai)} / 의료진 {formatComparable(difference.clinical)}</span></li>)}</ul>}</div>;
}

function findClinicalResult(type: string, examTypes: readonly string[], results: ClinicalSummaryResult[]) {
  if (type === "PDL1_ANALYSIS") return results.find((item) => item.workflow_stage === "PDL1" && item.result_status === "CONFIRMED");
  return results.find((item) => examTypes.includes(item.workflow_stage) && item.result_status === "CONFIRMED");
}

function getAiDisplaySummary(type: string, result?: AiSummaryResult) {
  if (!result) return "분석 결과 없음";
  if (result.status === "PENDING") return "분석 대기";
  if (result.status === "RUNNING") return "분석 중";
  if (result.status === "FAILED") return "분석 실패";
  if (result.status === "SUCCEEDED" && !result.result_detail) return "결과 상세 없음";
  return getAiSummary(type, result.result_detail);
}

function getAnalysisStatusLabel(status?: string) {
  if (status === "PENDING") return "분석 대기";
  if (status === "RUNNING") return "분석 중";
  if (status === "SUCCEEDED") return "분석 완료";
  if (status === "FAILED") return "분석 실패";
  return "분석 결과 없음";
}

function getAiSummary(type: string, detail: unknown) {
  if (!detail) return "결과 없음";
  if (type === "XRAY_ANALYSIS") {
    const xray = getRecord(detail, "xray");
    return joinDisplayValues([xray?.assessment_label, formatRatio(xray?.suspicion_score, "의심도")]);
  }
  if (type === "CT_ANALYSIS") {
    const ct = getRecord(detail, "ct");
    return formatPercent(ct?.overall_malignancy_risk, "악성 위험도", false) || "결과 없음";
  }
  if (type === "PET_CT_TNM_ANALYSIS") return joinValues(getRecord(detail, "tnm"), ["predicted_t", "predicted_n", "predicted_m", "predicted_stage_group"]);
  if (type === "PATHOLOGY_GENE_ANALYSIS") {
    const pathology = getRecord(detail, "pathology");
    const pathologySummary = pathology ? joinValues(pathology, ["malignancy_assessment_label", "predicted_histologic_type", "predicted_subtype"]) : "";
    const genes = getArray(detail, "genes");
    const geneSummary = genes.length ? summarizeGeneItems(genes, "predicted_status_label") : "";
    return joinDisplayValues([pathologySummary, geneSummary]) || "?? ??";
  }
  if (type === "PDL1_ANALYSIS") {
    const pdl1 = getRecord(detail, "pdl1");
    return joinDisplayValues([pdl1?.predicted_tps_range_label, formatRatio(pdl1?.confidence, "신뢰도")]);
  }
  if (type === "TREATMENT_RECOMMENDATION") return joinValues(getRecord(detail, "treatment"), ["overall_opinion", "recommended_plan"]);
  return "결과 없음";
}

function getClinicalSummary(type: string, result?: ClinicalSummaryResult) {
  if (!result) return "확정 결과 없음";
  if (type === "XRAY_ANALYSIS") return joinValues(getRecord(result.result_detail, "xray"), ["assessment_label"]);
  if (type === "CT_ANALYSIS") {
    const ct = getRecord(result.result_detail, "ct");
    return joinDisplayValues([ct?.overall_assessment_label, formatPercent(ct?.overall_malignancy_risk, "악성 위험도", false)]);
  }
  if (type === "PET_CT_TNM_ANALYSIS") return joinValues(getRecord(result.result_detail, "tnm"), ["t_category", "n_category", "m_category", "stage_group"]);
  if (type === "PATHOLOGY_GENE_ANALYSIS") {
    const pathology = getRecord(result.result_detail, "pathology");
    const pathologySummary = pathology ? joinValues(pathology, ["malignancy_status_label", "histologic_type", "subtype"]) : "";
    const findings = getArray(getRecord(result.result_detail, "gene"), "findings");
    const geneSummary = findings.length ? summarizeGeneItems(findings, "assessment_label") : "";
    return joinDisplayValues([pathologySummary, geneSummary]) || "?? ?? ??";
  }
  if (type === "PDL1_ANALYSIS") {
    const pdl1 = getRecord(result.result_detail, "pdl1");
    return joinDisplayValues([formatPercent(pdl1?.tps_percent, "TPS", false), pdl1?.interpretation]);
  }
  return result.result_status_label || result.result_status || "확정 결과 없음";
}

function getModelLabel(result?: AiSummaryResult) {
  if (!result) return "연결된 AI 분석 없음";
  return [result.model_name, result.model_version_name && `v${result.model_version_name}`, formatDate(result.completed_at)].filter(Boolean).join(" · ") || "모델 정보 없음";
}

function joinValues(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return "결과 없음";
  const values = keys.map((key) => record[key]).filter((value) => value !== null && value !== undefined && value !== "").map(String);
  return values.length ? values.join(" · ") : "결과 없음";
}

function GeneResultDetails({ aiDetail, clinicalDetail }: { aiDetail: unknown; clinicalDetail: unknown }) {
  const aiGenes = getArray(aiDetail, "genes");
  const clinicalGenes = getArray(getRecord(clinicalDetail, "gene"), "findings");
  if (aiGenes.length <= 3 && clinicalGenes.length <= 3) return null;

  return (
    <details className="border-t border-slate-200 bg-slate-50/50 px-3 py-2">
      <summary className="cursor-pointer select-none text-[10px] font-semibold text-blue-700">유전자 전체 보기</summary>
      <div className="mt-2 grid grid-cols-2 gap-3" aria-label="전체 유전자 결과">
        <GeneResultList title="AI 분석 후보" items={aiGenes} statusKey="predicted_status_label" tone="blue" />
        <GeneResultList title="의료진 확정 결과" items={clinicalGenes} statusKey="assessment_label" tone="emerald" />
      </div>
    </details>
  );
}

function GeneResultList({ title, items, statusKey, tone }: { title: string; items: unknown[]; statusKey: string; tone: "blue" | "emerald" }) {
  return <section className="min-w-0"><h3 className={`text-[9px] font-semibold ${tone === "blue" ? "text-blue-600" : "text-emerald-600"}`}>{title}</h3>{items.length ? <ul className="mt-1.5 space-y-1">{items.map((item, index) => { const gene = asRecord(item); return <li key={`${String(gene?.gene_symbol ?? "gene")}-${index}`} className="flex items-start justify-between gap-2 rounded bg-white px-2 py-1.5 text-[9px]"><span className="font-semibold text-slate-700">{String(gene?.gene_symbol ?? "-")}</span><span className="min-w-0 break-words text-right text-slate-500">{String(gene?.[statusKey] ?? "-")}</span></li>; })}</ul> : <p className="mt-2 text-[9px] text-slate-400">결과 없음</p>}</section>;
}

function summarizeGeneItems(items: unknown[], statusKey: string) {
  if (!items.length) return "결과 없음";
  const visible = items.slice(0, 3).map((item) => joinValues(asRecord(item), ["gene_symbol", statusKey]));
  const remaining = items.length - visible.length;
  return `${visible.join(" · ")}${remaining > 0 ? ` · 외 ${remaining}개` : ""}`;
}

type ComparablePair = { label: string; ai: unknown; clinical: unknown };
type Comparison = { state: "MATCH" | "DIFFERENT" | "UNAVAILABLE"; label: string; differences: ComparablePair[] };

function compareResults(type: string, ai: AiSummaryResult | undefined, clinical?: ClinicalSummaryResult): Comparison {
  if (ai?.status !== "SUCCEEDED" || !ai.result_detail || clinical?.result_status !== "CONFIRMED") return { state: "UNAVAILABLE", label: "비교 불가", differences: [] };
  const pairs = getComparablePairs(type, ai.result_detail, clinical.result_detail);
  if (!pairs.length) return { state: "UNAVAILABLE", label: "직접 비교 항목 없음", differences: [] };
  const differences = pairs.filter(({ ai, clinical: confirmed }) => normalizeComparable(ai) !== normalizeComparable(confirmed));
  return differences.length === 0
    ? { state: "MATCH", label: "일치", differences: [] }
    : { state: "DIFFERENT", label: `차이 ${differences.length}건`, differences };
}

function getComparablePairs(type: string, aiDetail: unknown, clinicalDetail: unknown): ComparablePair[] {
  if (type === "XRAY_ANALYSIS") return presentPairs([{ label: "판정", ai: getRecord(aiDetail, "xray")?.assessment, clinical: getRecord(clinicalDetail, "xray")?.assessment }]);
  if (type === "PET_CT_TNM_ANALYSIS") {
    const ai = getRecord(aiDetail, "tnm");
    const clinical = getRecord(clinicalDetail, "tnm");
    return presentPairs([{ label: "T", ai: ai?.predicted_t, clinical: clinical?.t_category }, { label: "N", ai: ai?.predicted_n, clinical: clinical?.n_category }, { label: "M", ai: ai?.predicted_m, clinical: clinical?.m_category }, { label: "Stage", ai: ai?.predicted_stage_group, clinical: clinical?.stage_group }]);
  }
  if (type === "PATHOLOGY_GENE_ANALYSIS") {
    const aiPathology = getRecord(aiDetail, "pathology");
    const clinicalPathology = getRecord(clinicalDetail, "pathology");
    const pathologyPairs = [{ label: "???", ai: aiPathology?.predicted_histologic_type, clinical: clinicalPathology?.histologic_type }, { label: "??", ai: aiPathology?.predicted_subtype, clinical: clinicalPathology?.subtype }];
    const confirmedByGene = new Map(getArray(getRecord(clinicalDetail, "gene"), "findings").map((item) => {
      const finding = asRecord(item);
      return [String(finding?.gene_symbol ?? "").toUpperCase(), finding?.assessment] as const;
    }));
    const genePairs = getArray(aiDetail, "genes").map((item) => {
      const gene = asRecord(item);
      const symbol = String(gene?.gene_symbol ?? "").toUpperCase();
      return { label: symbol || "???", ai: gene?.predicted_status, clinical: confirmedByGene.get(symbol) };
    });
    return presentPairs([...pathologyPairs, ...genePairs]);
  }
  if (type === "PDL1_ANALYSIS") {
    const aiRange = getRecord(aiDetail, "pdl1")?.predicted_tps_range;
    const tps = toNumber(getRecord(clinicalDetail, "pdl1")?.tps_percent);
    return aiRange && tps !== null ? [{ label: "TPS 구간", ai: aiRange, clinical: tps < 1 ? "LT_1" : tps < 50 ? "FROM_1_TO_49" : "GE_50" }] : [];
  }
  return [];
}

function presentPairs(pairs: ComparablePair[]) { return pairs.filter(({ ai, clinical }) => ai !== null && ai !== undefined && ai !== "" && clinical !== null && clinical !== undefined && clinical !== ""); }
function normalizeComparable(value: unknown) { return String(value).replace(/^PREDICTED_/, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(); }
function formatComparable(value: unknown) { return String(value).replace(/^PREDICTED_/, "").replaceAll("_", " "); }
function joinDisplayValues(values: unknown[]) { const present = values.filter((value) => value !== null && value !== undefined && value !== "").map(String); return present.length ? present.join(" · ") : "결과 없음"; }
function formatRatio(value: unknown, label: string) { return formatPercent(value, label, true); }
function formatPercent(value: unknown, label: string, ratio: boolean) { const number = toNumber(value); return number === null ? "" : `${label} ${(ratio && number <= 1 ? number * 100 : number).toFixed(1)}%`; }
function toNumber(value: unknown) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) ? number : null; }

function getRecord(value: unknown, key: string) { const nested = asRecord(value)?.[key]; return asRecord(nested); }
function getArray(value: unknown, key: string): unknown[] { const nested = asRecord(value)?.[key]; return Array.isArray(nested) ? nested : []; }
function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function formatDate(value?: string | null) { if (!value) return "확정 시각 없음"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR"); }
