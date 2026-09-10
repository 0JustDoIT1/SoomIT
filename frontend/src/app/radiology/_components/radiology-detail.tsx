"use client";

import { useState } from "react";

import { StatusBadge } from "@/components/workspace/status-badge";

import type { RadiologyWorklistItem } from "../_lib/radiology-api";

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function getWorkflowLabel(status: RadiologyWorklistItem["workflow_status"]) {
  const labels: Record<RadiologyWorklistItem["workflow_status"], string> = {
    CANCELLED: "취소됨",
    EXAM_PENDING: "예약됨",
    IMAGE_PENDING: "영상 연결 대기",
    AI_READY: "분석 대기 중",
    AI_RUNNING: "AI 분석 중",
    AI_FAILED: "AI 실패",
    REVIEW_PENDING: "의사 판독 중",
    REVIEW_COMPLETED: "판독 완료",
  };
  return labels[status];
}

function getAnalysisLabel(item: RadiologyWorklistItem) {
  if (item.examination_order.exam_type_label === "PET-CT / TNM") return "TNM AI 분석";
  return item.examination_order.exam_type === "XRAY" ? "X-ray AI 분석" : "CT AI 분석";
}

export function RadiologyDetail({ item, onClose }: {
  item: RadiologyWorklistItem;
  onClose: () => void;
}) {
  const [showResultNotice, setShowResultNotice] = useState(false);
  const order = item.examination_order;
  const image = item.latest_image_asset;
  const analysis = item.latest_ai_analysis;
  const analysisCompleted = analysis?.status === "SUCCEEDED" &&
    ["REVIEW_PENDING", "REVIEW_COMPLETED"].includes(item.workflow_status);
  const analysisRunning = analysis?.status === "RUNNING" || analysis?.status === "PENDING";

  return (
    <aside aria-label="환자 작업" className="min-h-0 min-w-0 overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">환자 작업</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-lg font-bold text-slate-900">{item.patient.name}</h2>
              <span className="text-xs text-slate-500">{item.patient.patient_code}</span>
              <span className="text-xs font-semibold text-slate-700">{order.exam_type_label}</span>
              <StatusBadge status={item.workflow_status} label={getWorkflowLabel(item.workflow_status)} />
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="환자 작업 닫기" className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            닫기
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-200 px-5">
        <section className="py-5" aria-labelledby="patient-information-heading">
          <h3 id="patient-information-heading" className="text-sm font-bold text-slate-800">환자 및 검사 정보</h3>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-xs text-slate-500">환자명</dt><dd className="mt-1 text-slate-800">{item.patient.name}</dd></div>
            <div><dt className="text-xs text-slate-500">환자코드</dt><dd className="mt-1 text-slate-800">{item.patient.patient_code}</dd></div>
            <div><dt className="text-xs text-slate-500">생년월일</dt><dd className="mt-1 text-slate-700">{item.patient.birth_date}</dd></div>
            <div><dt className="text-xs text-slate-500">성별</dt><dd className="mt-1 text-slate-700">{item.patient.sex}</dd></div>
            <div><dt className="text-xs text-slate-500">Case code</dt><dd className="mt-1 break-words text-slate-700">{item.case.case_code}</dd></div>
            <div><dt className="text-xs text-slate-500">현재 검사</dt><dd className="mt-1 font-semibold text-slate-800">{order.exam_type_label}</dd></div>
            <div><dt className="text-xs text-slate-500">오더 상태</dt><dd className="mt-1"><StatusBadge status={order.status} label={order.status_label} /></dd></div>
            <div><dt className="text-xs text-slate-500">요청 의사</dt><dd className="mt-1 text-slate-700">{item.requesting_doctor.name}</dd></div>
            <div><dt className="text-xs text-slate-500">검사 예정 시각</dt><dd className="mt-1 text-slate-700">{formatDateTime(item.scheduled_at)}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-slate-500">검사 목적</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-700">{order.purpose || "-"}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-slate-500">X-ray → CT → PET-CT → 병리</p>
          {order.exam_type_label === "PET-CT / TNM" ? <p className="mt-1 text-xs text-slate-500">PET-CT 영상에서 TNM AI 분석을 수행하는 하나의 검사 작업입니다.</p> : null}
        </section>

        <section className="py-5" aria-labelledby="image-upload-heading">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="image-upload-heading" className="text-sm font-bold text-slate-800">영상 업로드</h3>
              {image ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <StatusBadge status={image.status} label={image.status_label} />
                  <span>{image.image_type}</span><span>촬영 {formatDateTime(image.acquired_at)}</span><span>영상 자산 {item.image_asset_count}건</span>
                </div>
              ) : <p className="mt-3 text-xs text-slate-500">연결된 영상 자산이 없습니다.</p>}
              <p className="mt-2 text-xs leading-5 text-slate-500">영상 업로드·연결 API가 아직 제공되지 않습니다.</p>
            </div>
            <button type="button" disabled className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-400 disabled:cursor-not-allowed">영상 업로드 준비 중</button>
          </div>
        </section>

        <section className="py-5" aria-labelledby="ai-analysis-heading">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id="ai-analysis-heading" className="text-sm font-bold text-slate-800">{getAnalysisLabel(item)}</h3>
              {analysis ? (
                <div className="mt-3 space-y-2 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-2"><StatusBadge status={analysis.status} label={analysis.status_label} /><span>{analysis.model_name} · {analysis.model_version}</span></div>
                  <p>시작 {formatDateTime(analysis.started_at)} · 완료 {formatDateTime(analysis.completed_at)}</p>
                  {analysis.error_message ? <p className="break-words text-red-700">{analysis.error_message}</p> : null}
                </div>
              ) : <p className="mt-3 text-xs text-slate-500">AI 분석 이력이 없습니다.</p>}
            </div>
            <button type="button" disabled className="shrink-0 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">AI 분석 실행</button>
          </div>

          {analysisRunning ? (
            <div className="mt-4" role="status">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-blue-700"><span>AI 분석 중</span><span>진행률 정보 미제공</span></div>
              <div className="h-1.5 overflow-hidden bg-slate-200"><div className="h-full w-1/3 animate-pulse bg-blue-600" /></div>
            </div>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-slate-500">AI 실행·재실행 API가 아직 제공되지 않아 현재 버튼은 사용할 수 없습니다.</p>

          {analysisCompleted ? (
            <div className="mt-4 border-l-2 border-blue-600 bg-blue-50 px-4 py-3">
              <p className="text-sm font-semibold text-blue-900">AI 분석이 완료되었습니다.</p>
              <p className="mt-1 text-xs text-blue-700">현재 상태: {getWorkflowLabel(item.workflow_status)}</p>
              <button type="button" onClick={() => setShowResultNotice((current) => !current)} className="mt-3 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">AI 결과 보기</button>
              {showResultNotice ? <p className="mt-3 border-t border-blue-200 pt-3 text-xs leading-5 text-slate-600">방사선사 Worklist 응답에는 AI 결과 상세 필드가 포함되지 않아 분석 상태와 모델 정보만 확인할 수 있습니다.</p> : null}
            </div>
          ) : null}
        </section>

        <section className="py-5" aria-labelledby="review-heading">
          <h3 id="review-heading" className="text-sm font-bold text-slate-800">판독 진행</h3>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusBadge status={item.workflow_status} label={getWorkflowLabel(item.workflow_status)} />
            <p className="text-xs text-slate-500">
              {item.workflow_status === "REVIEW_COMPLETED" ? "호흡기내과 의사의 판독이 완료되었습니다." : item.workflow_status === "REVIEW_PENDING" ? "AI 결과가 생성되어 호흡기내과 의사의 판독을 기다리고 있습니다." : "AI 결과 생성 후 의사 판독 단계가 표시됩니다."}
            </p>
          </div>
        </section>
      </div>
    </aside>
  );
}
