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
  orders?: { id: string; order_type: string; order_type_label: string; status: string; priority: string; purpose?: string; created_at: string; scheduled_at?: string | null; appointment_status?: string | null }[];
  ordersLoaded?: boolean;
};

export function CaseOverviewPanel({ caseData, clinicalResults, aiResults, prescriptions = [], orders = [], ordersLoaded = false }: CaseOverviewPanelProps) {
  const decision = caseData.latest_clinician_decision;
  const confirmedClinicalResults = clinicalResults
    .filter((result) => result.result_status === "CONFIRMED")
    .sort((left, right) => toTimestamp(right.result_date) - toTimestamp(left.result_date));
  const flowItems = buildFlowItems(caseData.current_stage, clinicalResults, aiResults, prescriptions, orders);
  const activeOrderCount = orders.filter((order) => ["ORDERED", "SCHEDULED"].includes(order.status)).length;
  const activeOrders = orders.filter((order) => ["ORDERED", "SCHEDULED"].includes(order.status)).slice(0, 3);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-blue-600">Case 진료 현황</p>
          <h1 className="mt-0.5 text-base font-bold text-slate-900">진료 요약</h1>
          <p className="mt-1 text-xs text-slate-600">현재 단계와 전문과 확정 결과를 확인한 뒤 다음 진료 판단을 이어갑니다.</p>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700">
          {getStageLabel(caseData.current_stage)}
        </span>
      </header>

      {decision && ["REPEAT_EXAMINATION", "REFERRED_OUT", "CLOSE_CASE"].includes(decision.decision_type) && <section className={`mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-xs ${decision.decision_type === "REPEAT_EXAMINATION" ? "border-amber-200 bg-amber-50 text-amber-800" : decision.decision_type === "REFERRED_OUT" ? "border-violet-200 bg-violet-50 text-violet-800" : "border-slate-300 bg-slate-50 text-slate-700"}`}><div><p className="font-bold">{decision.decision_type === "REPEAT_EXAMINATION" ? "재생검 요청" : decision.decision_type === "REFERRED_OUT" ? "의뢰·전원 처리" : "Case 종료"}</p><p className="mt-0.5 text-[10px] opacity-80">{decision.reason || "결정 사유가 기록되었습니다."}</p></div><span className="shrink-0 rounded-full bg-white/70 px-2 py-1 text-[10px] font-semibold">{formatDate(decision.decided_at)}</span></section>}

      <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/70 md:grid-cols-4">
        <Metric label="현재 단계" value={getStageLabel(caseData.current_stage)} accent />
        <Metric label="Case 상태" value={getCaseStatusLabel(caseData.case_status)} />
        <Metric label="전문과 확정 결과" value={`${confirmedClinicalResults.length}건`} />
        <Metric label="진행 중 오더" value={ordersLoaded ? `${activeOrderCount}건` : "조회 불가"} />
      </div>

      <div className="border-b border-slate-200 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold text-slate-800">검사·진료 흐름 요약</h2>
          <p className="text-[10px] text-slate-400">초록은 전문과 확정, 파랑은 현재 단계·AI 후보, 주황은 진행 중 오더입니다.</p>
        </div>
        <div className="grid min-w-[760px] grid-cols-7 gap-2 overflow-x-auto">
          {flowItems.map((item) => <FlowItem key={item.label} {...item} />)}
        </div>
      </div>

      <div className="grid min-h-[260px] grid-cols-1 divide-y divide-slate-200 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.8fr)] lg:divide-x lg:divide-y-0">
        <ResultColumn
          eyebrow="전문과 결과"
          title="최근 전문과 확정 결과"
          tone="emerald"
          empty="확인 가능한 전문과 확정 결과가 없습니다."
          items={confirmedClinicalResults.slice(0, 4).map((result) => ({
            id: result.id ?? `${result.workflow_stage}-${result.result_date ?? "none"}`,
            title: result.exam_name || getClinicalResultLabel(result.workflow_stage),
            status: result.result_status_label || result.result_status || "-",
            date: formatDate(result.result_date),
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
            <EmptyState message="현재 기록된 호흡기내과 판단이 없습니다." />
          )}
          <section className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2.5">
            <p className="text-[10px] font-semibold text-blue-700">진행 중 검사 예약</p>
            {activeOrders.length ? <div className="mt-2 space-y-1.5">{activeOrders.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 text-[11px]"><span className="min-w-0 truncate font-semibold text-slate-700">{order.order_type_label}</span>{order.scheduled_at && <span className="shrink-0 text-slate-500">{`${appointmentStatusLabel(order.appointment_status)} · ${formatDate(order.scheduled_at)}`}</span>}</div>)}</div> : <p className="mt-2 text-[11px] text-slate-400">진행 중인 검사 오더가 없습니다.</p>}
          </section>
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] text-slate-400">Case 상태</p>
            <p className="mt-1 text-xs font-bold text-slate-700">{getCaseStatusLabel(caseData.case_status)}</p>
            <p className="mt-2 text-[10px] leading-4 text-slate-400">검사 오더는 요청·예약 상태만 표시합니다. 완료 판단은 전문과 확정 결과를 기준으로 합니다.</p>
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

type FlowState = "current" | "confirmed" | "ai" | "ordered" | "recorded" | "empty";

function FlowItem({ label, state }: { label: string; state: FlowState }) {
  const style = state === "current" ? "border-blue-200 bg-blue-50 text-blue-700" : state === "confirmed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : state === "ai" ? "border-sky-200 bg-sky-50 text-sky-700" : state === "ordered" ? "border-amber-200 bg-amber-50 text-amber-700" : state === "recorded" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-slate-200 bg-slate-50 text-slate-400";
  const status = state === "current" ? "현재 단계" : state === "confirmed" ? "전문과 확정" : state === "ai" ? "AI 후보 있음" : state === "ordered" ? "오더 진행 중" : state === "recorded" ? "처방 있음" : "정보 없음";
  return <div className={`min-w-0 rounded-md border px-2 py-2 text-center ${style}`}><p className="truncate text-[10px] font-bold">{label}</p><p className="mt-1 whitespace-nowrap text-[9px]">{status}</p></div>;
}

function buildFlowItems(currentStage: string, clinicalResults: OverviewClinicalResult[], aiResults: OverviewAiResult[], prescriptions: { id: string; prescription_status?: string }[], orders: { order_type: string; status: string }[]) {
  const hasClinical = (types: string[]) => clinicalResults.some((result) => types.includes(result.workflow_stage) && result.result_status === "CONFIRMED");
  const hasAi = (types: string[]) => aiResults.some((result) => types.includes(result.analysis_type) && result.status === "SUCCEEDED");
  const hasActiveOrder = (type: string) => orders.some((order) => order.order_type === type && ["ORDERED", "SCHEDULED"].includes(order.status));
  const configs = [
    { label: "흉부 X선", stages: ["XRAY"], aiTypes: ["XRAY_ANALYSIS"] },
    { label: "흉부 CT", stages: ["CT"], aiTypes: ["CT_ANALYSIS"] },
    { label: "PET-CT", stages: ["PET_CT_TNM"], aiTypes: ["PET_CT_TNM_ANALYSIS"] },
    { label: "조직/유전자", stages: ["PATHOLOGY_GENE"], aiTypes: ["PATHOLOGY_GENE_ANALYSIS"] },
    { label: "PD-L1", stages: ["PDL1"], aiTypes: ["PDL1_ANALYSIS"] },
    { label: "치료 결정", stages: ["TREATMENT"], aiTypes: ["TREATMENT_RECOMMENDATION"] },
    { label: "처방", stages: ["PRESCRIPTION"], aiTypes: [] },
  ];
  return configs.map(({ label, stages, aiTypes }) => {
    const clinicalConfirmed = hasClinical(stages);
    const aiCompleted = hasAi(aiTypes);
    const prescriptionRecorded = stages[0] === "PRESCRIPTION" && prescriptions.some((item) => Boolean(item.prescription_status));
    const state = stages.includes(currentStage) ? "current" : clinicalConfirmed ? "confirmed" : aiCompleted ? "ai" : hasActiveOrder(stages[0]) ? "ordered" : prescriptionRecorded ? "recorded" : "empty";
    return { label, state: state as FlowState };
  });
}

function appointmentStatusLabel(status?: string | null) {
  if (status === "CONFIRMED") return "예약 확정";
  if (status === "REQUESTED") return "예약 요청";
  return "예약 배정";
}

function getClinicalResultLabel(examType: string) {
  const labels: Record<string, string> = { XRAY: "흉부 X선", CT: "흉부 CT", PET_CT_TNM: "TNM 병기 확정 결과", PATHOLOGY_GENE: "조직·유전자 검사", PDL1: "PD-L1 검사" };
  return labels[examType] ?? getStageLabel(examType);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}

function toTimestamp(value?: string | null) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
