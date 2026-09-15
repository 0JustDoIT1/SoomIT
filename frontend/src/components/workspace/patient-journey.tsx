type CaseStage =
  | "XRAY"
  | "CT"
  | "PET_CT_TNM"
  | "PATHOLOGY_GENE"
  | "PDL1"
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
  { label: "X-ray", stage: "XRAY" },
  { label: "CT", stage: "CT" },
  { label: "PET-CT / TNM", stage: "PET_CT_TNM" },
  { label: "조직·유전자", stage: "PATHOLOGY_GENE" },
  { label: "PD-L1", stage: "PDL1" },
  { label: "치료", stage: "TREATMENT" },
];

export function PatientJourney({ currentStage }: PatientJourneyProps) {
  const mappedStage = currentStage === "PRESCRIPTION" ? "TREATMENT" : currentStage;

  return (
    <ol className="flex min-w-max items-start" aria-label="환자 진료 여정">
      {journeySteps.map((step, index) => {
        const active = step.stage !== null && step.stage === mappedStage;

        return (
          <li key={step.label} className="flex items-start">
            <div className="w-24 text-center">
              <div
                aria-current={active ? "step" : undefined}
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-500"
                }`}
              >
                {index + 1}
              </div>
              <p className={`mt-2 text-xs font-semibold ${active ? "text-blue-700" : "text-slate-600"}`}>
                {step.label}
              </p>
              {step.description ? (
                <p className="mt-1 text-[10px] leading-4 text-slate-500">{step.description}</p>
              ) : null}
            </div>
            {index < journeySteps.length - 1 ? (
              <div className="mt-4 h-px w-5 bg-slate-300" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
