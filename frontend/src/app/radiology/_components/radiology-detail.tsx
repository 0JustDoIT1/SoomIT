import { PatientJourney } from "@/components/workspace/patient-journey";
import { StateMessage } from "@/components/workspace/state-message";
import { StatusBadge } from "@/components/workspace/status-badge";

import type { RadiologyWorklistItem } from "../_lib/radiology-api";

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function RadiologyDetail({ item }: { item: RadiologyWorklistItem | null }) {
  if (!item) {
    return (
      <aside aria-label="검사 상세" className="flex min-h-[420px] items-center justify-center bg-slate-50 px-6">
        <StateMessage variant="empty" title="Worklist에서 검사 항목을 선택해 주세요." />
      </aside>
    );
  }

  const order = item.examination_order;
  const image = item.latest_image_asset;
  const analysis = item.latest_ai_analysis;

  return (
    <aside aria-label="검사 상세" className="min-w-0 bg-slate-50">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">선택 검사</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{item.patient.name}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {item.patient.patient_code} · Case {item.case.case_code}
            </p>
          </div>
          <StatusBadge status={item.workflow_status} label={item.workflow_status_label} />
        </div>
      </div>

      <div className="space-y-6 p-5">
        <section aria-labelledby="patient-summary-heading">
          <h3 id="patient-summary-heading" className="text-sm font-bold text-slate-800">환자 및 검사 정보</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
            <div><dt className="text-xs text-slate-500">환자코드</dt><dd className="mt-1 text-slate-700">{item.patient.patient_code}</dd></div>
            <div><dt className="text-xs text-slate-500">생년월일 · 성별</dt><dd className="mt-1 text-slate-700">{item.patient.birth_date} · {item.patient.sex}</dd></div>
            <div><dt className="text-xs text-slate-500">검사 종류</dt><dd className="mt-1 font-semibold text-slate-800">{order.exam_type_label}</dd></div>
            <div><dt className="text-xs text-slate-500">오더 상태</dt><dd className="mt-1"><StatusBadge status={order.status} label={order.status_label} /></dd></div>
            <div><dt className="text-xs text-slate-500">우선순위</dt><dd className="mt-1"><StatusBadge status={order.priority} label={order.priority_label} /></dd></div>
            <div><dt className="text-xs text-slate-500">요청 의사</dt><dd className="mt-1 text-slate-700">{item.requesting_doctor.name}</dd></div>
            <div><dt className="text-xs text-slate-500">검사 예정 시각</dt><dd className="mt-1 text-slate-700">{formatDateTime(item.scheduled_at)}</dd></div>
            <div><dt className="text-xs text-slate-500">영상 자산 수</dt><dd className="mt-1 text-slate-700">{item.image_asset_count}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-slate-500">검사 목적</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-700">{order.purpose}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-slate-500">임상 메모</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-700">{order.clinical_note ?? "-"}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="journey-heading" className="border-t border-slate-200 pt-5">
          <h3 id="journey-heading" className="text-sm font-bold text-slate-800">Patient Journey</h3>
          <p className="mt-1 text-xs text-slate-500">현재 Case stage만 강조하며 이전 단계의 완료를 단정하지 않습니다.</p>
          <div className="mt-4 overflow-x-auto pb-2">
            <PatientJourney currentStage={item.case.current_stage} />
          </div>
          <p className="mt-2 border-l-2 border-cyan-300 pl-3 text-xs leading-5 text-slate-600">
            PET-CT 영상은 TNM 병기 판정의 핵심 근거로 활용되며, 최종 TNM 판정은 호흡기내과 의료진이 수행합니다.
          </p>
        </section>

        <section aria-labelledby="orthanc-heading" className="border-t border-slate-200 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="orthanc-heading" className="text-sm font-bold text-slate-800">영상 연결</h3>
              {image ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <StatusBadge status={image.status} label={image.status_label} />
                  <span>{image.image_type}</span>
                  <span>촬영 {formatDateTime(image.acquired_at)}</span>
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-500">연결된 영상 자산이 없습니다.</p>
              )}
              <p className="mt-2 text-xs leading-5 text-slate-500">일반 영상 Study 조회·연결 API 준비 후 사용할 수 있습니다.</p>
            </div>
            <button type="button" disabled className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-400 disabled:cursor-not-allowed">
              Orthanc에서 불러오기
            </button>
          </div>
        </section>

        <section aria-labelledby="ai-heading" className="border-t border-slate-200 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="ai-heading" className="text-sm font-bold text-slate-800">AI 상태</h3>
              {analysis ? (
                <div className="mt-2 space-y-2 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={analysis.status} label={analysis.status_label} />
                    <span>{analysis.analysis_type}</span>
                    <span>{analysis.model_name} · {analysis.model_version}</span>
                  </div>
                  <p>시작 {formatDateTime(analysis.started_at)} · 완료 {formatDateTime(analysis.completed_at)}</p>
                  {analysis.error_message ? <p className="break-words text-red-700">{analysis.error_message}</p> : null}
                </div>
              ) : (
                <p className="mt-1 text-xs text-slate-500">AI 분석 이력이 없습니다.</p>
              )}
              <p className="mt-2 text-xs leading-5 text-slate-500">X-ray/CT AI 실행 및 재실행 API 준비 후 사용할 수 있습니다.</p>
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
