import { getCaseStatusLabel } from "./clinical-display-labels";

export const CASE_STAGES = [
  { code: "XRAY", label: "흉부 X선", sourceStages: ["XRAY"] },
  { code: "CT", label: "흉부 CT", sourceStages: ["CT"] },
  { code: "PET_CT_TNM", label: "PET-CT", sourceStages: ["PET_CT_TNM"] },
  { code: "PATHOLOGY_GENE", label: "조직/유전자", sourceStages: ["PATHOLOGY_GENE"] },
  { code: "PDL1", label: "PD-L1", sourceStages: ["PDL1"] },
  { code: "TREATMENT", label: "치료 결정", sourceStages: ["TREATMENT"] },
  { code: "PRESCRIPTION", label: "처방", sourceStages: ["PRESCRIPTION"] },
] as const;

type CaseHeaderData = {
  patient_name: string;
  patient_code: string;
  case_code: string;
  primary_doctor_name: string | null;
  current_stage: string;
  case_status: string;
};

export function CaseSummaryHeader({ caseData }: { caseData: CaseHeaderData }) {
  return (
    <section className="flex h-[72px] shrink-0 items-center overflow-x-auto border-b border-slate-200 bg-white px-5">
      <div className="grid min-w-[900px] flex-1 grid-cols-6 gap-5">
        <Summary label="환자명" value={caseData.patient_name} />
        <Summary label="환자 ID" value={caseData.patient_code} />
        <Summary label="진료 Case ID" value={caseData.case_code} />
        <Summary label="담당의" value={caseData.primary_doctor_name} />
        <Summary label="현재 단계" value={getStageLabel(caseData.current_stage)} accent />
        <Summary label="Case 상태" value={getCaseStatusLabel(caseData.case_status)} />
      </div>
    </section>
  );
}

export function CaseWorkflowBar({ currentStage, hasPdl1Result = false }: { currentStage: string; hasPdl1Result?: boolean }) {
  const currentIndex = CASE_STAGES.findIndex((stage) => (stage.sourceStages as readonly string[]).includes(currentStage));

  return (
    <section className="border-b border-slate-200 bg-white px-4 py-2">
      <div className="overflow-x-auto">
        <div className="flex min-w-[760px] items-start justify-between">
          {CASE_STAGES.map((stage, index) => {
            const current = (stage.sourceStages as readonly string[]).includes(currentStage);
            const progressed = currentIndex >= 0 && index < currentIndex && stage.code !== "PDL1";
            const resultAvailable = stage.code === "PDL1" && hasPdl1Result;
            const state = current ? "current" : resultAvailable ? "result" : progressed ? "progressed" : "upcoming";
            const completed = progressed || resultAvailable;
            return (
              <div key={stage.code} className="relative flex flex-1 items-start">
                <div className="flex flex-1 flex-col items-center">
                  <span data-stage-state={state} className={`z-10 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${current ? "bg-blue-600 text-white ring-4 ring-blue-100" : completed ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-slate-300"}`}>{current ? "●" : completed ? "✓" : "○"}</span>
                  <span className={`mt-1.5 whitespace-nowrap text-[10px] font-semibold ${current ? "text-blue-700" : completed ? "text-emerald-700" : "text-slate-500"}`}>{stage.label}</span>
                </div>
                {index < CASE_STAGES.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 right-[-50%] top-2.5 h-px ${completed ? "bg-emerald-300" : "bg-slate-200"}`} />}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-center text-[10px] text-slate-500">초록색은 현재 단계 기준으로 지나온 과정 또는 실제 결과가 확인된 검사이며, 파란색은 현재 단계입니다. 검사별 상세 상태는 검사오더 API 기준으로 표시됩니다.</p>
    </section>
  );
}

function Summary({ label, value, accent = false }: { label: string; value?: string | null; accent?: boolean }) {
  return <div className="min-w-0"><p className="whitespace-nowrap text-[10px] text-slate-400">{label}</p><p className={`mt-1 truncate text-xs font-bold ${accent ? "text-blue-700" : "text-slate-700"}`}>{value || "-"}</p></div>;
}

export function getStageLabel(stage: string) {
  return CASE_STAGES.find((item) => (item.sourceStages as readonly string[]).includes(stage))?.label ?? stage;
}
