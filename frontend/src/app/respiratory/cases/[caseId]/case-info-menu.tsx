export type CaseInfoKey = "OVERVIEW" | "XRAY" | "CT" | "PATHOLOGY_GENE" | "PET_CT_TNM" | "PDL1" | "TREATMENT" | "PRESCRIPTION" | "AI_SUMMARY";
export type CaseInfoAccessState = "LOCKED" | "WAITING" | "ACTIONABLE" | "COMPLETED" | "OPEN";
export type CaseInfoClinicalResult = {
  workflow_stage: string;
  result_status?: string;
  result_detail?: { ct?: { overall_assessment?: string | null } };
};
export type CaseInfoOrder = { order_type: string; status: string };
export type CaseInfoAiResult = { analysis_type: string; status?: string };

const ITEMS: { key: CaseInfoKey; label: string }[] = [
  { key: "OVERVIEW", label: "전체 요약" },
  { key: "XRAY", label: "흉부 X선" },
  { key: "CT", label: "흉부 CT" },
  { key: "PET_CT_TNM", label: "PET-CT / TNM 병기" },
  { key: "PATHOLOGY_GENE", label: "조직/유전자" },
  { key: "PDL1", label: "PD-L1" },
  { key: "AI_SUMMARY", label: "AI 종합 분석" },
  { key: "TREATMENT", label: "치료 결정" },
  { key: "PRESCRIPTION", label: "처방" },
];

const NAVIGATION_GROUPS: { label: string; keys: CaseInfoKey[] }[] = [
  { label: "CASE", keys: ["OVERVIEW"] },
  { label: "IMAGING", keys: ["XRAY", "CT", "PET_CT_TNM"] },
  { label: "PATHOLOGY", keys: ["PATHOLOGY_GENE", "PDL1"] },
  { label: "DECISION", keys: ["AI_SUMMARY", "TREATMENT", "PRESCRIPTION"] },
];

const WORKFLOW_STAGES: CaseInfoKey[] = ["XRAY", "CT", "PET_CT_TNM", "PATHOLOGY_GENE", "PDL1", "TREATMENT", "PRESCRIPTION"];

const WAITING_MESSAGES: Partial<Record<CaseInfoKey, string>> = {
  PET_CT_TNM: "PET-CT/TNM 검사 및 결과 확정이 필요합니다.",
  PATHOLOGY_GENE: "PET-CT/TNM 확정 결과가 필요합니다.",
  PDL1: "조직·유전자 결과의 호흡기내과 확인이 완료되어야 PD-L1을 진행할 수 있습니다.",
  TREATMENT: "PD-L1 호흡기내과 최종 확정 결과가 필요합니다.",
  PRESCRIPTION: "치료계획 최종 확정이 필요합니다.",
};

export function getCaseInfoAccessState({ key, currentStage, caseStatus = "ACTIVE", clinicalResults = [], orders = [], aiResults = [] }: { key: CaseInfoKey; currentStage?: string; caseStatus?: string; clinicalResults?: CaseInfoClinicalResult[]; orders?: CaseInfoOrder[]; aiResults?: CaseInfoAiResult[] }) {
  const itemIndex = WORKFLOW_STAGES.indexOf(key);
  if (itemIndex < 0) return { state: "OPEN" as const, message: "" };

  const currentIndex = WORKFLOW_STAGES.indexOf(currentStage as CaseInfoKey);
  const confirmed = clinicalResults.some((result) => result.workflow_stage === key && result.result_status === "CONFIRMED");
  const confirmedCt = clinicalResults.find((result) => result.workflow_stage === "CT" && result.result_status === "CONFIRMED");
  const pathologyConfirmed = clinicalResults.some((result) => result.workflow_stage === "PATHOLOGY_GENE" && result.result_status === "CONFIRMED");
  const pdl1Confirmed = clinicalResults.some((result) => result.workflow_stage === "PDL1" && result.result_status === "CONFIRMED");
  const activePdl1Order = orders.find((order) => order.order_type === "PDL1" && ["ORDERED", "SCHEDULED"].includes(order.status));
  const completedPdl1Order = orders.find((order) => order.order_type === "PDL1" && order.status === "COMPLETED");
  const pdl1AiCompleted = aiResults.some((result) => result.analysis_type === "PDL1_ANALYSIS" && result.status === "SUCCEEDED");
  const ctRequiresFurtherEvaluation = ["NODULE_DETECTED", "INDETERMINATE"].includes(
    confirmedCt?.result_detail?.ct?.overall_assessment ?? "",
  );

  if (currentIndex < 0 && caseStatus === "ACTIVE") return { state: "OPEN" as const, message: "" };

  if (caseStatus !== "ACTIVE") {
    if (itemIndex > WORKFLOW_STAGES.indexOf("CT")) {
      return { state: "LOCKED" as const, message: "Case가 종료되어 이후 진료 단계는 사용할 수 없습니다." };
    }
    return { state: confirmed ? "COMPLETED" as const : "LOCKED" as const, message: "Case가 종료되었습니다." };
  }

  if (key === "PDL1") {
    if (pdl1Confirmed) return { state: "COMPLETED" as const, message: "PD-L1 호흡기내과 최종 확정이 완료되었습니다." };
    if (activePdl1Order) {
      const message = activePdl1Order.status === "ORDERED"
        ? "PD-L1 오더 요청됨 · 병리과 접수를 기다리고 있습니다."
        : activePdl1Order.status === "SCHEDULED"
          ? "PD-L1 검사 예약됨 · 검사 진행을 기다리고 있습니다."
          : "PD-L1 검사/분석 진행 중입니다.";
      return { state: "WAITING" as const, message };
    }
    if (currentStage === "PDL1" && completedPdl1Order) {
      return { state: "WAITING" as const, message: pdl1AiCompleted ? "PD-L1 분석 완료 · 병리과 검토를 기다리고 있습니다." : "PD-L1 검사/분석 진행 중입니다." };
    }
    if (pathologyConfirmed) return { state: "ACTIONABLE" as const, message: "PD-L1 검사 오더를 요청할 수 있습니다." };
    if (currentIndex >= WORKFLOW_STAGES.indexOf("PATHOLOGY_GENE")) {
      return { state: "WAITING" as const, message: "조직·유전자 결과의 호흡기내과 확인이 완료되어야 PD-L1을 진행할 수 있습니다." };
    }
  }

  if (key === "TREATMENT" && pdl1Confirmed && currentIndex <= WORKFLOW_STAGES.indexOf("TREATMENT")) {
    return { state: "ACTIONABLE" as const, message: "PD-L1 확정 결과를 바탕으로 치료 판단을 진행할 수 있습니다." };
  }

  if (confirmed && itemIndex < currentIndex) return { state: "COMPLETED" as const, message: "" };
  if (itemIndex === currentIndex) return { state: "ACTIONABLE" as const, message: "현재 수행할 수 있는 진료 단계입니다." };
  if (itemIndex < currentIndex) return { state: "WAITING" as const, message: "이전 단계의 결과 확인이 필요합니다." };
  if (ctRequiresFurtherEvaluation && itemIndex > WORKFLOW_STAGES.indexOf("CT")) {
    return { state: "WAITING" as const, message: WAITING_MESSAGES[key] ?? "선행 결과를 기다리고 있습니다." };
  }
  return { state: "LOCKED" as const, message: "이전 단계의 확정 및 다음 단계 진행이 필요합니다." };
}

const STATUS_LABEL: Record<CaseInfoAccessState, string> = {
  LOCKED: "잠김",
  WAITING: "결과 대기",
  ACTIONABLE: "처리 가능",
  COMPLETED: "완료",
  OPEN: "",
};

export function CaseInfoMenu({ selected, currentStage, caseStatus, clinicalResults, orders, aiResults, onSelect }: { selected: CaseInfoKey; currentStage?: string; caseStatus?: string; clinicalResults?: CaseInfoClinicalResult[]; orders?: CaseInfoOrder[]; aiResults?: CaseInfoAiResult[]; onSelect: (key: CaseInfoKey) => void }) {

  return (
    <aside className="flex min-h-0 w-[108px] shrink-0 flex-col border-r border-slate-200 bg-[#f8fbff] py-3 xl:w-[116px]">
      <div className="mx-2.5 border-b border-slate-200 pb-3">
        <p className="text-[9px] font-bold tracking-[0.16em] text-blue-600">CASE WORKSPACE</p>
        <h2 className="mt-1 text-sm font-bold tracking-tight text-slate-900">진료 정보</h2>
      </div>
      <nav className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto px-1.5 [scrollbar-gutter:stable]" aria-label="Case 진료 정보 메뉴">
        {NAVIGATION_GROUPS.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <p className="px-2 pb-1 text-[8px] font-bold tracking-[0.1em] text-slate-400">{group.label}</p>
            <div className="space-y-0.5">
              {group.keys.map((key) => {
                const item = ITEMS.find((candidate) => candidate.key === key)!;
                const access = getCaseInfoAccessState({ key: item.key, currentStage, caseStatus, clinicalResults, orders, aiResults });
                const locked = access.state === "LOCKED";
                const isCurrent = item.key === currentStage;
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={locked}
                    data-access-state={access.state}
                    title={access.message || undefined}
                    onClick={() => onSelect(item.key)}
                    aria-current={selected === item.key ? "page" : undefined}
                    className={`group relative flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-[10px] font-semibold transition ${locked ? "cursor-not-allowed text-slate-300" : isCurrent ? "bg-blue-600 text-white shadow-sm shadow-blue-200" : selected === item.key ? "bg-blue-50 text-blue-700" : access.state === "COMPLETED" ? "text-emerald-700 hover:bg-emerald-50" : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}
                  >
                    <CaseInfoIcon value={item.key} />
                    <span className="min-w-0 leading-4">{item.label}</span>
                    {isCurrent && <span aria-hidden="true" className="absolute -left-2 h-5 w-0.5 rounded-r bg-blue-700" />}
                    {item.key !== "OVERVIEW" && item.key !== "AI_SUMMARY" && <span aria-hidden="true" className={`ml-auto text-[8px] font-bold ${isCurrent ? "text-blue-100" : access.state === "COMPLETED" ? "text-emerald-600" : access.state === "WAITING" ? "text-amber-600" : "text-slate-400"}`}>{STATUS_LABEL[access.state]}</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
      <div className="mt-auto mx-2.5 border-t border-slate-200 pt-2.5">
        <p className="text-[9px] leading-4 text-slate-400">현재 Case의 실제 결과와 업무 상태를 확인합니다.</p>
      </div>
    </aside>
  );
}

export function getCaseInfoLabel(key: CaseInfoKey) {
  return ITEMS.find((item) => item.key === key)?.label ?? key;
}

function CaseInfoIcon({ value }: { value: CaseInfoKey }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0">
    {value === "OVERVIEW" && <><rect {...common} x="4" y="4" width="16" height="16" rx="2" /><path {...common} d="M8 9h8M8 13h8M8 17h5" /></>}
    {value === "XRAY" && <><path {...common} d="M7 3v18M17 3v18M4 8c3 2 5 2 8 0s5-2 8 0M4 16c3-2 5-2 8 0s5 2 8 0" /></>}
    {value === "CT" && <><circle {...common} cx="12" cy="12" r="8" /><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M12 4v2M12 18v2M4 12h2M18 12h2" /></>}
    {value === "PET_CT_TNM" && <><circle {...common} cx="7" cy="7" r="2" /><circle {...common} cx="17" cy="7" r="2" /><circle {...common} cx="12" cy="17" r="2" /><path {...common} d="m8.5 8.5 2.2 6M15.5 8.5l-2.2 6M9 7h6" /></>}
    {value === "PATHOLOGY_GENE" && <><path {...common} d="M8 4h8M8 20h8M9 4c0 4 6 4 6 8s-6 4-6 8M15 4c0 4-6 4-6 8s6 4 6 8" /></>}
    {value === "PDL1" && <><path {...common} d="M7 4h10v5c0 5-5 8-5 8S7 14 7 9V4Z" /><path {...common} d="M9.5 10.5h5M12 8v5" /></>}
    {value === "TREATMENT" && <><path {...common} d="m7 7 10 10M17 7 7 17M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>}
    {value === "PRESCRIPTION" && <><rect {...common} x="5" y="4" width="14" height="16" rx="2" /><path {...common} d="M9 4v3h6V4M9 12h6M9 16h4" /></>}
    {value === "AI_SUMMARY" && <><path {...common} d="M12 3 13.5 8.2 19 10l-5.5 1.8L12 17l-1.5-5.2L5 10l5.5-1.8L12 3Z" /><path {...common} d="m18 16 .6 2.1L21 19l-2.4.9L18 22l-.6-2.1L15 19l2.4-.9L18 16Z" /></>}
  </svg>;
}
