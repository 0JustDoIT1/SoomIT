import { StateMessage } from "@/components/workspace/state-message";

import type { RadiologyCaseStage, RadiologyWorklistItem } from "../_lib/radiology-api";

export type RadiologyDisplayStage = "xray" | "ct" | "pet-ct" | "tnm" | "pathology";

const stages: Array<{
  id: RadiologyDisplayStage;
  label: string;
  backendStage: RadiologyCaseStage | null;
  description?: string;
}> = [
  { id: "xray", label: "X-ray", backendStage: "XRAY" },
  { id: "ct", label: "CT", backendStage: "CT" },
  { id: "pet-ct", label: "PET-CT", backendStage: null, description: "TNM 예측 입력 영상" },
  { id: "tnm", label: "TNM 예측", backendStage: "STAGING" },
  { id: "pathology", label: "병리", backendStage: "PATHOLOGY" },
];

export function getInitialDisplayStage(currentStage: RadiologyCaseStage): RadiologyDisplayStage | null {
  return stages.find((stage) => stage.backendStage === currentStage)?.id ?? null;
}

export function RadiologyStagePanel({
  item,
  selectedStage,
  onSelectStage,
}: {
  item: RadiologyWorklistItem | null;
  selectedStage: RadiologyDisplayStage | null;
  onSelectStage: (stage: RadiologyDisplayStage) => void;
}) {
  if (!item) {
    return (
      <section aria-label="검사 단계" className="flex min-h-0 items-center justify-center bg-slate-50 px-4">
        <StateMessage variant="empty" title="검사 항목을 선택하면 환자 단계를 확인할 수 있습니다." />
      </section>
    );
  }

  return (
    <section aria-labelledby="radiology-stage-heading" className="min-h-0 overflow-y-auto bg-slate-50">
      <div className="border-b border-slate-200 px-4 py-4">
        <h2 id="radiology-stage-heading" className="text-sm font-bold text-slate-800">검사 단계</h2>
        <p className="mt-1 truncate text-xs text-slate-500">{item.patient.name} · {item.patient.patient_code}</p>
      </div>
      <ol className="px-3 py-3">
        {stages.map((stage, index) => {
          const selected = selectedStage === stage.id;
          const current = stage.backendStage !== null && item.case.current_stage === stage.backendStage;

          return (
            <li key={stage.id} className="relative pb-2 last:pb-0">
              {index < stages.length - 1 ? <span aria-hidden="true" className="absolute left-[17px] top-9 h-[calc(100%-20px)] w-px bg-slate-200" /> : null}
              <button
                type="button"
                onClick={() => onSelectStage(stage.id)}
                aria-current={current ? "step" : undefined}
                className={`relative flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left ${selected ? "bg-blue-50" : "hover:bg-white"}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${current ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-500"}`}>
                  {index + 1}
                </span>
                <span className="min-w-0 pt-1">
                  <span className={`block text-sm font-semibold ${current ? "text-blue-700" : "text-slate-600"}`}>{stage.label}</span>
                  {stage.description ? <span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{stage.description}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
