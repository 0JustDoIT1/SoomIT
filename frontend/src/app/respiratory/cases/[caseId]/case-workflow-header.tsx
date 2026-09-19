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
  patient_sex?: string;
  patient_birth_date?: string;
  primary_doctor_name: string | null;
  current_stage: string;
  case_status: string;
};

export function CaseSummaryHeader({ caseData }: { caseData: CaseHeaderData }) {
  return (
    <section aria-label="현재 환자와 Case 식별 정보" className="flex h-11 shrink-0 animate-[pulse_1.4s_ease-out_1] items-center gap-3 overflow-hidden rounded-lg border border-teal-300 bg-white px-3 shadow-sm">
      <div className="flex min-w-0 shrink items-baseline gap-2">
        <h1 className="truncate text-sm font-bold text-slate-900">{caseData.patient_name || "환자명 없음"}</h1>
        <p className="hidden shrink-0 text-[10px] font-medium text-slate-500 lg:block">{caseData.patient_sex === "MALE" ? "남성" : caseData.patient_sex === "FEMALE" ? "여성" : "성별 미입력"} · {caseData.patient_birth_date || "생년월일 미입력"}</p>
      </div>
      <span className="h-5 w-px shrink-0 bg-slate-200" />
      <Summary label="환자번호" value={caseData.patient_code} />
      <Summary label="Case 번호" value={caseData.case_code} />
      <Summary label="현재 Case 단계" value={getStageLabel(caseData.current_stage)} accent />
      <div className="hidden xl:block"><Summary label="담당의" value={caseData.primary_doctor_name} /></div>
      <span className="ml-auto shrink-0 rounded-md bg-blue-50 px-2.5 py-1.5 text-[10px] font-bold text-blue-700">{getCaseStatusLabel(caseData.case_status)}</span>
    </section>
  );
}

export function CaseWorkflowBar({ currentStage, hasPdl1Result = false }: { currentStage: string; hasPdl1Result?: boolean }) {
  const currentIndex = CASE_STAGES.findIndex((stage) => (stage.sourceStages as readonly string[]).includes(currentStage));

  return (
    <section aria-label="Case 진행 단계" className="shrink-0 rounded-lg border border-blue-100 bg-white px-3 py-1 shadow-sm">
      <div className="overflow-x-auto">
        <div className="flex min-w-[680px] items-start justify-between">
          {CASE_STAGES.map((stage, index) => {
            const current = (stage.sourceStages as readonly string[]).includes(currentStage);
            const progressed = currentIndex >= 0 && index < currentIndex && stage.code !== "PDL1";
            const resultAvailable = stage.code === "PDL1" && hasPdl1Result;
            const state = current ? "current" : resultAvailable ? "result" : progressed ? "progressed" : "upcoming";
            const completed = progressed || resultAvailable;
            return (
              <div key={stage.code} className="relative flex flex-1 items-start">
                <div className="flex flex-1 flex-col items-center">
                  <span data-stage-state={state} className={`z-10 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold ${current ? "bg-blue-600 text-white ring-2 ring-blue-100" : completed ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-slate-300"}`}>{current ? "●" : completed ? "✓" : "○"}</span>
                  <span className={`mt-1 whitespace-nowrap text-[9px] font-semibold ${current ? "text-blue-700" : completed ? "text-emerald-700" : "text-slate-500"}`}>{stage.label}</span>
                </div>
                {index < CASE_STAGES.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 right-[-50%] top-2 h-px ${completed ? "bg-emerald-300" : "bg-slate-200"}`} />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value, accent = false }: { label: string; value?: string | null; accent?: boolean }) {
  return <div className="min-w-[76px] shrink-0"><p className="whitespace-nowrap text-[9px] text-slate-500">{label}</p><p className={`mt-0.5 max-w-32 truncate text-[11px] font-bold ${accent ? "text-blue-700" : "text-slate-800"}`}>{value || "-"}</p></div>;
}

export function getStageLabel(stage: string) {
  return CASE_STAGES.find((item) => (item.sourceStages as readonly string[]).includes(stage))?.label ?? stage;
}
