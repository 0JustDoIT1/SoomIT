type CaseStage =
  | "XRAY"
  | "CT"
  | "PATHOLOGY"
  | "STAGING"
  | "GENE"
  | "TREATMENT"
  | "PRESCRIPTION";

type PatientJourneyProps = {
  currentStage: CaseStage | null;
};

const journeySteps: Array<{
  label: string;
  stage: CaseStage | null;
  description?: string;
}> = [
  { label: "접수", stage: null },
  { label: "X-ray", stage: "XRAY" },
  { label: "CT", stage: "CT" },
  { label: "병리", stage: "PATHOLOGY" },
  {
    label: "PET-CT",
    stage: null,
    description: "TNM 병기 판정 근거 영상",
  },
  { label: "TNM 병기", stage: "STAGING" },
  { label: "유전자", stage: "GENE" },
  { label: "치료 결정", stage: "TREATMENT" },
];

export function PatientJourney({ currentStage }: PatientJourneyProps) {
  const mappedStage = currentStage === "PRESCRIPTION" ? "TREATMENT" : currentStage;

  return (
    <ol className="flex min-w-max items-start" aria-label="환자 진료 여정">
      {journeySteps.map((step, index) => {
        const active = step.stage !== null && step.stage === mappedStage;
        const isEvidenceStep = step.label === "PET-CT";

        return (
          <li key={step.label} className="flex items-start">
            <div className="w-24 text-center">
              <div
                aria-current={active ? "step" : undefined}
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : isEvidenceStep
                      ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                      : "border-slate-300 bg-white text-slate-500"
                }`}
              >
                {index + 1}
              </div>
              <p className={`mt-2 text-xs font-semibold ${active ? "text-blue-700" : "text-slate-600"}`}>
                {step.label}
              </p>
              {step.description ? (
                <p className="mt-1 text-[10px] leading-4 text-cyan-700">{step.description}</p>
              ) : null}
            </div>
            {index < journeySteps.length - 1 ? (
              <div className={`mt-4 h-px w-5 ${isEvidenceStep ? "bg-cyan-300" : "bg-slate-300"}`} aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
