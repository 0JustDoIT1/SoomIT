export const CASE_STAGES = [
  { code: "XRAY", label: "흉부 X선" },
  { code: "CT", label: "흉부 CT" },
  { code: "PATHOLOGY", label: "병리" },
  { code: "STAGING", label: "TNM 병기" },
  { code: "GENE", label: "바이오마커" },
  { code: "TREATMENT", label: "치료 결정" },
  { code: "PRESCRIPTION", label: "처방" },
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
        <Summary label="환자번호" value={caseData.patient_code} />
        <Summary label="Case" value={caseData.case_code} />
        <Summary label="담당의" value={caseData.primary_doctor_name} />
        <Summary label="현재 단계" value={getStageLabel(caseData.current_stage)} accent />
        <Summary label="Case 상태" value={caseData.case_status} />
      </div>
    </section>
  );
}

export function CaseWorkflowBar({ currentStage }: { currentStage: string }) {
  return (
    <section className="border-b border-slate-200 bg-white px-4 py-2">
      <div className="overflow-x-auto">
        <div className="flex min-w-[760px] items-start justify-between">
          {CASE_STAGES.map((stage, index) => {
            const current = stage.code === currentStage;
            return (
              <div key={stage.code} className="relative flex flex-1 items-start">
                <div className="flex flex-1 flex-col items-center">
                  <span data-current-stage={current ? "true" : "false"} className={`z-10 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${current ? "bg-blue-600 text-white ring-4 ring-blue-100" : "bg-slate-200 text-slate-500"}`}>{current ? "●" : "✓"}</span>
                  <span className={`mt-1.5 whitespace-nowrap text-[10px] font-semibold ${current ? "text-blue-700" : "text-slate-500"}`}>{stage.label}</span>
                </div>
                {index < CASE_STAGES.length - 1 && <span aria-hidden="true" className="absolute left-1/2 right-[-50%] top-2.5 h-px bg-slate-200" />}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-center text-[9px] text-slate-400">현재 단계만 실제 Case 값으로 강조합니다. 검사별 상태는 오더 API 연동 후 표시됩니다.</p>
    </section>
  );
}

function Summary({ label, value, accent = false }: { label: string; value?: string | null; accent?: boolean }) {
  return <div className="min-w-0"><p className="whitespace-nowrap text-[10px] text-slate-400">{label}</p><p className={`mt-1 truncate text-xs font-bold ${accent ? "text-blue-700" : "text-slate-700"}`}>{value || "-"}</p></div>;
}

export function getStageLabel(stage: string) {
  return CASE_STAGES.find((item) => item.code === stage)?.label ?? stage;
}
