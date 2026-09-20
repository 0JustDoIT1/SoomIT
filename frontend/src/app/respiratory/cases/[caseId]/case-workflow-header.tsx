"use client";

export const CASE_STAGES = [
  { code: "XRAY", label: "흉부 X선" },
  { code: "CT", label: "흉부 CT" },
  { code: "PET_CT_TNM", label: "PET-CT" },
  { code: "PATHOLOGY_GENE", label: "조직/유전자" },
  { code: "PDL1", label: "PD-L1" },
  { code: "TREATMENT", label: "치료 결정" },
  { code: "PRESCRIPTION", label: "처방" },
] as const;

type CaseSummaryData = {
  patient_name?: string | null;
  patient_code?: string | null;
  patient_sex?: string | null;
  patient_birth_date?: string | null;
  case_code?: string | null;
  primary_doctor_name?: string | null;
  current_stage?: string | null;
  case_status?: string | null;
};

const STAGE_LABELS: Record<string, string> = {
  XRAY: "흉부 X선",
  CT: "흉부 CT",
  PET_CT_TNM: "PET-CT",
  PATHOLOGY_GENE: "조직/유전자",
  PDL1: "PD-L1",
  TREATMENT: "치료 결정",
  PRESCRIPTION: "처방",
};

export function getStageLabel(stage?: string | null) {
  if (!stage) return "-";
  return STAGE_LABELS[stage] ?? stage;
}

function caseStatusLabel(status?: string | null) {
  switch (status) {
    case "ACTIVE":
      return "진행 중";
    case "CLOSED":
      return "종결";
    case "REFERRED_OUT":
      return "의뢰/전원";
    default:
      return status || "상태 미정";
  }
}

function sexLabel(value?: string | null) {
  const normalized = String(value || "").toUpperCase();

  if (["F", "FEMALE", "여", "여성"].includes(normalized)) {
    return "여성";
  }

  if (["M", "MALE", "남", "남성"].includes(normalized)) {
    return "남성";
  }

  return value || "";
}

function formatBirthDate(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function CaseSummaryHeader({
  caseData,
  doctorDisplayName,
}: {
  caseData?: CaseSummaryData | null;
  doctorDisplayName?: string | null;
}) {
  const patientMeta = [
    sexLabel(caseData?.patient_sex),
    formatBirthDate(caseData?.patient_birth_date),
  ]
    .filter(Boolean)
    .join(" · ");

  const currentStageLabel = getStageLabel(
    caseData?.current_stage,
  );

  const status = caseStatusLabel(caseData?.case_status);

  return (
    <section
      className="grid min-h-[48px] w-full items-stretch gap-0 overflow-hidden rounded-lg border border-cyan-300 bg-white shadow-sm"
      style={{
        gridTemplateColumns:
          "minmax(220px, 1.35fr) minmax(120px, 1fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(160px, 1fr) minmax(90px, 0.65fr)",
      }}
    >
      {/* Patient */}
      <div className="flex min-w-0 w-full items-center border-r border-slate-100 px-5 py-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-[17px] font-bold tracking-[-0.02em] text-slate-900">
              {caseData?.patient_name || "-"}
            </h1>

            {patientMeta && (
              <span className="shrink-0 whitespace-nowrap text-[9px] font-medium text-slate-500">
                {patientMeta}
              </span>
            )}
          </div>
        </div>
      </div>

      <SummaryField
        label="환자번호"
        value={caseData?.patient_code || "-"}
      />

      <SummaryField
        label="Case 번호"
        value={caseData?.case_code || "-"}
      />

      <SummaryField
        label="현재 Case 단계"
        value={currentStageLabel}
        emphasis
      />

      <SummaryField
        label="담당의"
        value={
          doctorDisplayName?.trim() ||
          caseData?.primary_doctor_name ||
          "-"
        }
      />

      <div className="flex h-full min-w-0 w-full items-center justify-center bg-slate-50/50 px-4">
        <span
          className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[9px] font-bold ${
            caseData?.case_status === "ACTIVE"
              ? "bg-blue-50 text-blue-700"
              : caseData?.case_status === "CLOSED"
                ? "bg-slate-100 text-slate-600"
                : "bg-amber-50 text-amber-700"
          }`}
        >
          {status}
        </span>
      </div>
    </section>
  );
}

function SummaryField({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex min-w-0 w-full flex-col justify-center border-r border-slate-100 px-5 py-1.5">
      <p className="truncate text-[8px] font-medium text-slate-400">
        {label}
      </p>

      <p
        className={`mt-0.5 truncate text-[10px] font-bold ${
          emphasis ? "text-blue-700" : "text-slate-800"
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

export function CaseWorkflowBar({
  currentStage,
  hasPdl1Result = false,
}: {
  currentStage?: string | null;
  hasPdl1Result?: boolean;
}) {
  const currentIndex = CASE_STAGES.findIndex(
    (stage) => stage.code === currentStage,
  );

  return (
    <section
      className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm"
      aria-label="Case 진행 단계"
    >
      <div
        aria-hidden="true"
        className="absolute left-[7%] right-[7%] top-[15px] h-px bg-slate-200"
      />

      <ol className="relative z-10 grid grid-cols-7 gap-1">
        {CASE_STAGES.map((stage, index) => {
          let state:
            | "progressed"
            | "current"
            | "upcoming"
            | "result" = "upcoming";

          if (
            stage.code === "PDL1" &&
            hasPdl1Result &&
            currentStage !== "PDL1" &&
            index > currentIndex
          ) {
            state = "result";
          } else if (index < currentIndex) {
            state = "progressed";
          } else if (index === currentIndex) {
            state = "current";
          }

          const visual = {
            progressed: {
              symbol: "✓",
              dot: "bg-emerald-500 text-white",
              text: "text-emerald-700",
            },
            current: {
              symbol: "●",
              dot: "bg-blue-600 text-white ring-4 ring-blue-100",
              text: "text-blue-700",
            },
            upcoming: {
              symbol: "○",
              dot: "border border-slate-300 bg-white text-slate-400",
              text: "text-slate-400",
            },
            result: {
              symbol: "●",
              dot: "bg-violet-500 text-white",
              text: "text-violet-700",
            },
          }[state];

          return (
            <li
              key={stage.code}
              className="min-w-0 text-center"
            >
              <span
                data-stage-state={state}
                className={`mx-auto flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold ${visual.dot}`}
              >
                {visual.symbol}
              </span>

              <p
                className={`mt-1 truncate text-[8px] font-semibold ${visual.text}`}
                title={stage.label}
              >
                {stage.label}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
