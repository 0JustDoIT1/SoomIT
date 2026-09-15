import { getStageLabel } from "./case-workflow-header";
import { getCaseStatusLabel, getDecisionTypeLabel } from "./clinical-display-labels";

type OverviewCase = {
  case_code: string;
  patient_name: string;
  patient_code: string;
  current_stage: string;
  case_status: string;
  primary_doctor_name?: string | null;
  updated_at?: string | null;
  latest_clinician_decision?: {
    source_stage: string;
    decision_type: string;
    target_stage: string | null;
    reason: string | null;
    decided_by: string;
    decided_at: string;
  } | null;
};

type OverviewClinicalResult = {
  id?: string;
  workflow_stage: string;
  exam_name?: string;
  result_status?: string;
  result_status_label?: string;
  result_date?: string | null;
  result_detail?: unknown;
};

type OverviewAiResult = {
  id?: string;
  analysis_type: string;
  analysis_type_label?: string;
  status?: string;
  status_label?: string;
  completed_at?: string | null;
};

type CaseOverviewPanelProps = {
  caseData: OverviewCase;
  clinicalResults: OverviewClinicalResult[];
  aiResults: OverviewAiResult[];
  prescriptions?: { id: string; prescription_status?: string }[];
};

export function CaseOverviewPanel({ caseData, clinicalResults, aiResults, prescriptions = [] }: CaseOverviewPanelProps) {
  const decision = caseData.latest_clinician_decision;
  const confirmedClinicalResults = clinicalResults.filter((result) => result.result_status === "CONFIRMED");
  const flowItems = buildFlowItems(caseData.current_stage, clinicalResults, aiResults, prescriptions);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-blue-600">진료 현황</p>
          <h1 className="mt-0.5 text-base font-bold text-slate-900">전체 요약</h1>
          <p className="mt-1 text-xs text-slate-600">현재 Case의 확정 결과, AI 후보, 미확정 사항과 다음 행동을 확인합니다.</p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700">
          {getStageLabel(caseData.current_stage)}
        </span>
      </header>

      <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50/70">
        <Metric label="현재 단계" value={getStageLabel(caseData.current_stage)} accent />
        <Metric label="전문과 확정 결과" value={`${confirmedClinicalResults.length}건`} />
        <Metric label="AI 분석 후보" value={`${aiResults.length}건`} />
        <Metric label="최근 업데이트" value={formatDate(caseData.updated_at)} />
      </div>

      <div className="border-b border-slate-200 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold text-slate-800">검사·진료 흐름 요약</h2>
          <p className="text-[10px] text-slate-400">완료 여부를 추측하지 않고 현재 단계와 조회된 결과만 표시합니다.</p>
        </div>
        <div className="grid min-w-[760px] grid-cols-7 gap-2 overflow-x-auto">
          {flowItems.map((item) => <FlowItem key={item.label} {...item} />)}
        </div>
      </div>

      <div className="grid min-h-[260px] grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(260px,0.9fr)] divide-x divide-slate-200">
        <ResultColumn
          eyebrow="전문과 결과"
          title="전문과 확정 결과"
          tone="emerald"
          empty="확인 가능한 전문과 확정 결과가 없습니다."
          items={confirmedClinicalResults.map((result) => ({
            id: result.id ?? `${result.workflow_stage}-${result.result_date ?? "none"}`,
            title: result.exam_name || getClinicalResultLabel(result.workflow_stage),
            status: result.result_status_label || result.result_status || "-",
            date: formatDate(result.result_date),
          }))}
        />

        <ResultColumn
          eyebrow="AI 분석"
          title="AI 분석 후보"
          tone="blue"
          empty="현재 Case에 연결된 AI 분석 후보가 없습니다."
          items={aiResults.map((result) => ({
            id: result.id ?? `${result.analysis_type}-${result.completed_at ?? "none"}`,
            title: getAiResultLabel(result.analysis_type, result.analysis_type_label),
            status: result.status_label || result.status || "-",
            date: formatDate(result.completed_at),
          }))}
        />

        <section className="min-w-0 p-4">
          <p className="text-[10px] font-semibold text-violet-600">호흡기내과 판단</p>
          <h2 className="mt-1 text-sm font-bold text-slate-900">다음 행동</h2>
          {decision ? (
            <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/40 p-3">
              <Detail label="결정" value={getDecisionTypeLabel(decision.decision_type)} />
              <Detail label="검토 단계" value={getStageLabel(decision.source_stage)} />
              <Detail label="다음 단계" value={decision.target_stage ? getStageLabel(decision.target_stage) : "-"} />
              <Detail label="결정자" value={decision.decided_by} />
              <Detail label="결정 시각" value={formatDate(decision.decided_at)} />
              {decision.reason && <p className="mt-3 border-t border-violet-100 pt-3 text-[11px] leading-5 text-slate-600">{decision.reason}</p>}
            </div>
          ) : (
            <EmptyState message="현재 기록된 다음 행동이 없습니다." />
          )}
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] text-slate-400">Case 상태</p>
            <p className="mt-1 text-xs font-bold text-slate-700">{getCaseStatusLabel(caseData.case_status)}</p>
            <p className="mt-2 text-[10px] leading-4 text-slate-400">검사별 진행 상태는 검사 오더 기능이 연결되면 표시됩니다.</p>
          </div>
        </section>
      </div>
    </section>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="min-w-0 border-r border-slate-200 px-4 py-3 last:border-r-0"><p className="whitespace-nowrap text-[10px] text-slate-400">{label}</p><p className={`mt-1 truncate text-sm font-bold ${accent ? "text-blue-700" : "text-slate-800"}`}>{value}</p></div>;
}

function ResultColumn({ eyebrow, title, tone, empty, items }: { eyebrow: string; title: string; tone: "emerald" | "blue"; empty: string; items: { id: string; title: string; status: string; date: string }[] }) {
  const colors = tone === "emerald" ? "text-emerald-700 bg-emerald-50 border-emerald-100" : "text-blue-700 bg-blue-50 border-blue-100";
  return <section className="min-w-0 p-4"><p className={`text-[10px] font-semibold ${tone === "emerald" ? "text-emerald-600" : "text-blue-600"}`}>{eyebrow}</p><h2 className="mt-1 text-sm font-bold text-slate-900">{title}</h2>{items.length > 0 ? <div className="mt-3 space-y-2">{items.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 px-3 py-2.5"><div className="flex items-center justify-between gap-2"><p className="min-w-0 truncate text-xs font-bold text-slate-700">{item.title}</p><span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-semibold ${colors}`}>{item.status}</span></div><p className="mt-1.5 text-[10px] text-slate-400">{item.date}</p></article>)}</div> : <EmptyState message={empty} />}</section>;
}

function EmptyState({ message }: { message: string }) {
  return <div className="mt-3 flex min-h-28 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center text-[11px] leading-5 text-slate-400">{message}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 border-b border-violet-100 py-1.5 last:border-0"><span className="shrink-0 text-[10px] text-slate-400">{label}</span><span className="min-w-0 text-right text-[11px] font-semibold text-slate-700">{value || "-"}</span></div>;
}

type FlowState = "current" | "available" | "empty";

function FlowItem({ label, state }: { label: string; state: FlowState }) {
  const style = state === "current" ? "border-blue-200 bg-blue-50 text-blue-700" : state === "available" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400";
  const status = state === "current" ? "현재 단계" : state === "available" ? "결과 조회됨" : "정보 없음";
  return <div className={`min-w-0 rounded-md border px-2 py-2 text-center ${style}`}><p className="truncate text-[10px] font-bold">{label}</p><p className="mt-1 whitespace-nowrap text-[9px]">{status}</p></div>;
}

function buildFlowItems(currentStage: string, clinicalResults: OverviewClinicalResult[], aiResults: OverviewAiResult[], prescriptions: { id: string; prescription_status?: string }[]) {
  const hasClinical = (types: string[]) => clinicalResults.some((result) => types.includes(result.workflow_stage) && Boolean(result.result_status));
  const hasAi = (types: string[]) => aiResults.some((result) => types.includes(result.analysis_type) && Boolean(result.status));
  const hasPdl1Clinical = clinicalResults.some((result) => hasPdl1Detail(result.result_detail) && Boolean(result.result_status));
  const configs = [
    { label: "흉부 X선", stages: ["XRAY"], available: hasClinical(["XRAY"]) || hasAi(["XRAY_ANALYSIS"]) },
    { label: "흉부 CT", stages: ["CT"], available: hasClinical(["CT"]) || hasAi(["CT_ANALYSIS"]) },
    { label: "PET-CT", stages: ["PET_CT_TNM"], available: hasClinical(["PET_CT_TNM"]) || hasAi(["PET_CT_TNM_ANALYSIS"]) },
    { label: "조직/유전자", stages: ["PATHOLOGY_GENE"], available: hasClinical(["PATHOLOGY_GENE"]) || hasAi(["PATHOLOGY_GENE_ANALYSIS"]) },
    { label: "PD-L1", stages: ["PDL1"], available: hasPdl1Clinical || hasAi(["PDL1_ANALYSIS"]) },
    { label: "치료 결정", stages: ["TREATMENT"], available: hasAi(["TREATMENT_RECOMMENDATION"]) },
    { label: "처방", stages: ["PRESCRIPTION"], available: prescriptions.some((item) => Boolean(item.prescription_status)) },
  ];
  return configs.map(({ label, stages, available }) => ({ label, state: (stages.includes(currentStage) ? "current" : available ? "available" : "empty") as FlowState }));
}

function hasPdl1Detail(detail: unknown) {
  return Boolean(detail && typeof detail === "object" && !Array.isArray(detail) && "pdl1" in detail && (detail as { pdl1?: unknown }).pdl1);
}

function getClinicalResultLabel(examType: string) {
  const labels: Record<string, string> = { XRAY: "흉부 X선", CT: "흉부 CT", PET_CT_TNM: "TNM 병기 확정 결과", PATHOLOGY_GENE: "조직·유전자 검사", PDL1: "PD-L1 검사" };
  return labels[examType] ?? getStageLabel(examType);
}

function getAiResultLabel(analysisType: string, apiLabel?: string) {
  const labels: Record<string, string> = { XRAY_ANALYSIS: "흉부 X선 AI 후보", CT_ANALYSIS: "흉부 CT AI 후보", PET_CT_TNM_ANALYSIS: "PET-CT 기반 TNM AI 후보", PATHOLOGY_GENE_ANALYSIS: "조직·유전자 AI 후보", PDL1_ANALYSIS: "PD-L1 AI 후보", TREATMENT_RECOMMENDATION: "치료 AI 후보" };
  return labels[analysisType] ?? apiLabel ?? analysisType;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}
