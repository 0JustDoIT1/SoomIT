"use client";

import { useState, type ReactNode } from "react";

import { StateMessage } from "@/components/workspace/state-message";
import { StatusBadge } from "@/components/workspace/status-badge";

import type { RadiologyDisplayStage } from "./radiology-stage-panel";
import type { RadiologyWorklistItem } from "../_lib/radiology-api";

const stageLabels: Record<RadiologyDisplayStage, string> = {
  xray: "X-ray",
  ct: "CT",
  "pet-ct": "PET-CT",
  tnm: "TNM 예측",
  pathology: "병리",
};

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

function CollapsibleSection({ id, title, children, divided = true }: {
  id: string;
  title: string;
  children: ReactNode;
  divided?: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section aria-labelledby={`${id}-heading`} className={divided ? "border-t border-slate-200 pt-4" : ""}>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-controls={`${id}-content`} className="flex w-full items-center justify-between gap-3 py-1 text-left">
        <h3 id={`${id}-heading`} className="text-sm font-bold text-slate-800">{title}</h3>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-4 w-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}><path d="m5 7.5 5 5 5-5" /></svg>
      </button>
      {open ? <div id={`${id}-content`} className="pt-2">{children}</div> : null}
    </section>
  );
}

export function RadiologyDetail({ item, selectedStage }: {
  item: RadiologyWorklistItem | null;
  selectedStage: RadiologyDisplayStage | null;
}) {
  if (!item) {
    return (
      <aside aria-label="검사 상세" className="flex min-h-[420px] items-center justify-center bg-white px-6">
        <StateMessage variant="empty" title="Worklist에서 검사 항목을 선택해 주세요." />
      </aside>
    );
  }

  const order = item.examination_order;
  const image = item.latest_image_asset;
  const analysis = item.latest_ai_analysis;
  const isPetCtOrder = order.exam_type_label === "PET-CT / TNM";
  const isSelectedImagingOrder =
    (selectedStage === "xray" && order.exam_type === "XRAY") ||
    (selectedStage === "ct" && order.exam_type === "CT" && !isPetCtOrder) ||
    (selectedStage === "pet-ct" && isPetCtOrder);
  const isSelectedTnmAnalysis = selectedStage === "tnm" && analysis?.analysis_type === "TNM_STAGING";
  const showsSelectedAi =
    (isSelectedImagingOrder && selectedStage !== "pet-ct") || isSelectedTnmAnalysis;

  return (
    <aside aria-label="검사 상세" className="min-h-0 min-w-0 overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">선택 검사</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{item.patient.name}</h2>
            <p className="mt-1 text-xs text-slate-500">{item.patient.patient_code} · Case {item.case.case_code}</p>
          </div>
          <StatusBadge status={item.workflow_status} label={item.workflow_status_label} />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <CollapsibleSection id="patient-summary" title="환자 및 검사 정보" divided={false}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm lg:grid-cols-3">
            <div><dt className="text-xs text-slate-500">환자코드</dt><dd className="mt-1 text-slate-700">{item.patient.patient_code}</dd></div>
            <div><dt className="text-xs text-slate-500">Case</dt><dd className="mt-1 break-words text-slate-700">{item.case.case_code}</dd></div>
            <div><dt className="text-xs text-slate-500">생년월일 · 성별</dt><dd className="mt-1 text-slate-700">{item.patient.birth_date} · {item.patient.sex}</dd></div>
            <div><dt className="text-xs text-slate-500">검사 종류</dt><dd className="mt-1 font-semibold text-slate-800">{order.exam_type_label}</dd></div>
            <div><dt className="text-xs text-slate-500">오더 상태</dt><dd className="mt-1"><StatusBadge status={order.status} label={order.status_label} /></dd></div>
            <div><dt className="text-xs text-slate-500">우선순위</dt><dd className="mt-1"><StatusBadge status={order.priority} label={order.priority_label} /></dd></div>
            <div><dt className="text-xs text-slate-500">검사 예정 시각</dt><dd className="mt-1 text-slate-700">{formatDateTime(item.scheduled_at)}</dd></div>
            <div><dt className="text-xs text-slate-500">요청 의사</dt><dd className="mt-1 text-slate-700">{item.requesting_doctor.name}</dd></div>
            <div><dt className="text-xs text-slate-500">영상 자산 수</dt><dd className="mt-1 text-slate-700">{item.image_asset_count}</dd></div>
            <div className="col-span-2 lg:col-span-3"><dt className="text-xs text-slate-500">검사 목적</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-700">{order.purpose}</dd></div>
            <div className="col-span-2 lg:col-span-3"><dt className="text-xs text-slate-500">임상 메모</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-700">{order.clinical_note ?? "-"}</dd></div>
          </dl>
        </CollapsibleSection>

        <div className="border-t border-slate-200 pt-4">
          <p className="text-xs font-semibold text-blue-700">선택 단계 · {selectedStage ? stageLabels[selectedStage] : "선택 없음"}</p>
        </div>

        {!selectedStage || (!isSelectedImagingOrder && !isSelectedTnmAnalysis) ? (
          <StateMessage variant="empty" title="아직 등록된 정보가 없습니다." />
        ) : null}

        {isSelectedImagingOrder ? (
          <CollapsibleSection id="image-link" title="영상 연결" divided={false}>
            <div className="flex items-start justify-between gap-3">
              <div>
                {image ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <StatusBadge status={image.status} label={image.status_label} />
                    <span>{image.image_type}</span>
                    <span>촬영 {formatDateTime(image.acquired_at)}</span>
                  </div>
                ) : <p className="text-xs text-slate-500">연결된 영상 자산이 없습니다.</p>}
                <p className="mt-2 text-xs leading-5 text-slate-500">일반 영상 Study 조회·연결 API 준비 후 사용할 수 있습니다.</p>
              </div>
              <button type="button" disabled className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-400 disabled:cursor-not-allowed">Orthanc에서 불러오기</button>
            </div>
          </CollapsibleSection>
        ) : null}

        {showsSelectedAi ? (
          <CollapsibleSection id="ai-status" title="AI 상태">
            {analysis ? (
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={analysis.status} label={analysis.status_label} />
                  <span>{analysis.analysis_type}</span>
                  <span>{analysis.model_name} · {analysis.model_version}</span>
                </div>
                <p>시작 {formatDateTime(analysis.started_at)} · 완료 {formatDateTime(analysis.completed_at)}</p>
                {analysis.error_message ? <p className="break-words text-red-700">{analysis.error_message}</p> : null}
              </div>
            ) : <p className="text-xs text-slate-500">AI 분석 이력이 없습니다.</p>}
            <p className="mt-2 text-xs leading-5 text-slate-500">AI 실행 및 재실행 API 준비 후 사용할 수 있습니다.</p>
          </CollapsibleSection>
        ) : null}
      </div>
    </aside>
  );
}
