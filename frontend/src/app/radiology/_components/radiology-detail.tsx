import { PatientJourney } from "@/components/workspace/patient-journey";
import { StateMessage } from "@/components/workspace/state-message";
import { StatusBadge } from "@/components/workspace/status-badge";

import type { RadiologyWorklistItem } from "./radiology-worklist";

export function RadiologyDetail({ item }: { item: RadiologyWorklistItem | null }) {
  if (!item) {
    return (
      <aside aria-label="검사 상세" className="flex min-h-[420px] items-center justify-center bg-slate-50 px-6">
        <StateMessage variant="empty" title="Worklist에서 검사 항목을 선택해 주세요." />
      </aside>
    );
  }

  return (
    <aside aria-label="검사 상세" className="min-w-0 bg-slate-50">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">선택 검사</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{item.patientName}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {item.patientCode}{item.caseId ? ` · Case ${item.caseId}` : ""}
            </p>
          </div>
          <StatusBadge status={item.status} label={item.statusLabel} />
        </div>
      </div>

      <div className="space-y-6 p-5">
        <section aria-labelledby="exam-summary-heading">
          <h3 id="exam-summary-heading" className="text-sm font-bold text-slate-800">검사 정보</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
            <div><dt className="text-xs text-slate-500">검사 종류</dt><dd className="mt-1 font-semibold text-slate-800">{item.examType}</dd></div>
            <div><dt className="text-xs text-slate-500">우선순위</dt><dd className="mt-1"><StatusBadge status={item.priority} label={item.priorityLabel} /></dd></div>
            <div><dt className="text-xs text-slate-500">담당 호흡기내과 의사</dt><dd className="mt-1 text-slate-700">{item.doctorName ?? "-"}</dd></div>
            <div><dt className="text-xs text-slate-500">검사 예정 시각</dt><dd className="mt-1 text-slate-700">{item.scheduledAt ?? "-"}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-slate-500">검사 목적</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-700">{item.purpose ?? "-"}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="journey-heading" className="border-t border-slate-200 pt-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 id="journey-heading" className="text-sm font-bold text-slate-800">Patient Journey</h3>
              <p className="mt-1 text-xs text-slate-500">현재 Case stage만 강조하며 이전 단계의 완료를 단정하지 않습니다.</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto pb-2">
            <PatientJourney currentStage={item.currentStage} />
          </div>
          <p className="mt-2 border-l-2 border-cyan-300 pl-3 text-xs leading-5 text-slate-600">
            PET-CT 영상은 TNM 병기 판정의 핵심 근거로 활용되며, 최종 TNM 판정은 호흡기내과 의료진이 수행합니다.
          </p>
        </section>

        <section aria-labelledby="orthanc-heading" className="border-t border-slate-200 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 id="orthanc-heading" className="text-sm font-bold text-slate-800">영상 연결</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">일반 영상 Study 조회·연결 API 준비 후 사용할 수 있습니다.</p>
            </div>
            <button type="button" disabled className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-400 disabled:cursor-not-allowed">
              Orthanc에서 불러오기
            </button>
          </div>
        </section>

        <section aria-labelledby="ai-heading" className="border-t border-slate-200 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 id="ai-heading" className="text-sm font-bold text-slate-800">AI 상태</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">X-ray/CT AI 실행 및 재실행 API 준비 후 사용할 수 있습니다.</p>
            </div>
            <button type="button" disabled className="shrink-0 rounded-md bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 disabled:cursor-not-allowed">
              AI 실행
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}
