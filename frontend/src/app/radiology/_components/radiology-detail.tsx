"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { StatusBadge } from "@/components/workspace/status-badge";

import {
  fetchRadiologyAnalysis,
  fetchRadiologyAnalysisResult,
  RadiologyApiError,
  startRadiologyAnalysis,
  type RadiologyAnalysisDetail,
  type RadiologyAnalysisResult,
  type RadiologyWorklistItem,
} from "../_lib/radiology-api";

type TrackedAnalysis = Pick<
  RadiologyAnalysisDetail,
  "analysis_id" | "analysis_type" | "status" | "started_at" | "completed_at" | "error_message"
> & {
  model_name: string;
  model_version: string;
};

function getInitialAnalysis(item: RadiologyWorklistItem): TrackedAnalysis | null {
  const analysis = item.latest_ai_analysis;
  if (!analysis) return null;
  return {
    analysis_id: analysis.id,
    analysis_type: analysis.analysis_type,
    status: analysis.status as TrackedAnalysis["status"],
    started_at: analysis.started_at,
    completed_at: analysis.completed_at,
    error_message: analysis.error_message,
    model_name: analysis.model_name,
    model_version: analysis.model_version,
  };
}

function trackAnalysis(analysis: RadiologyAnalysisDetail): TrackedAnalysis {
  return {
    analysis_id: analysis.analysis_id,
    analysis_type: analysis.analysis_type,
    status: analysis.status,
    started_at: analysis.started_at,
    completed_at: analysis.completed_at,
    error_message: analysis.error_message,
    model_name: analysis.model_version.model_name,
    model_version: analysis.model_version.version,
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(file: File) {
  const extension = file.name.split(".").pop();
  return extension && extension !== file.name ? extension.toUpperCase() : "형식 미확인";
}

function isPreviewableImage(file: File) {
  return file.type === "image/jpeg" || file.type === "image/png";
}

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

function formatPercent(value: string | null, scale = 100) {
  if (value === null) return "-";
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * scale).toFixed(1)}%` : value;
}

function AnalysisResultView({ data }: { data: RadiologyAnalysisResult }) {
  if ("assessment" in data.result) {
    return <dl className="grid grid-cols-2 divide-x divide-slate-200 text-xs"><div className="pr-5"><dt className="text-slate-500">판정</dt><dd className="mt-2 text-lg font-bold text-slate-900">{data.result.assessment_label}</dd></div><div className="pl-5"><dt className="text-slate-500">의심 점수</dt><dd className="mt-2 text-lg font-bold text-slate-900">{formatPercent(data.result.suspicion_score)}</dd></div></dl>;
  }
  if ("nodules" in data.result) {
    return <div className="text-xs"><dl className="grid grid-cols-2 divide-x divide-slate-200"><div className="pr-5"><dt className="text-slate-500">전체 악성 위험도</dt><dd className="mt-2 text-lg font-bold text-slate-900">{formatPercent(data.result.overall_malignancy_risk, 1)}</dd></div><div className="pl-5"><dt className="text-slate-500">결절 개수</dt><dd className="mt-2 text-lg font-bold text-slate-900">{data.result.nodules.length}</dd></div></dl><div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">{data.result.nodules.map((nodule) => <div key={nodule.nodule_no} className="grid gap-1 py-3 text-slate-700 sm:grid-cols-[100px_1fr_1fr]"><strong className="text-slate-800">결절 {nodule.nodule_no}</strong><span>검출 신뢰도 {formatPercent(nodule.detection_confidence)}</span><span>악성 위험도 {formatPercent(nodule.malignancy_risk, 1)}</span></div>)}</div></div>;
  }
  return <dl className="grid grid-cols-2 text-xs sm:grid-cols-4 sm:divide-x sm:divide-slate-200"><div className="pb-3 sm:pr-5"><dt className="text-slate-500">T</dt><dd className="mt-2 text-xl font-bold text-slate-900">{data.result.predicted_t ?? "-"}</dd></div><div className="pb-3 sm:px-5"><dt className="text-slate-500">N</dt><dd className="mt-2 text-xl font-bold text-slate-900">{data.result.predicted_n ?? "-"}</dd></div><div className="pb-3 sm:px-5"><dt className="text-slate-500">M</dt><dd className="mt-2 text-xl font-bold text-slate-900">{data.result.predicted_m ?? "-"}</dd></div><div className="pb-3 sm:pl-5"><dt className="text-slate-500">Stage</dt><dd className="mt-2 text-xl font-bold text-slate-900">{data.result.predicted_stage_group ?? "-"}</dd></div><div className="col-span-2 border-t border-slate-200 pt-3 sm:col-span-4"><dt className="text-slate-500">Confidence</dt><dd className="mt-1 text-base font-bold text-slate-900">{formatPercent(data.result.confidence)}</dd></div></dl>;
}

export function RadiologyPatientSummary({ item, onClear }: {
  item: RadiologyWorklistItem;
  onClear: () => void;
}) {
  const order = item.examination_order;

  return (
    <section aria-labelledby="selected-patient-heading" className="min-h-0 overflow-y-auto bg-slate-50">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">선택 환자</p>
          <div className="mt-1 flex min-w-0 items-baseline gap-2"><h2 id="selected-patient-heading" className="truncate text-base font-bold text-slate-900">{item.patient.name}</h2><span className="shrink-0 text-xs text-slate-500">{item.patient.patient_code}</span></div>
        </div>
        <StatusBadge status={item.workflow_status} label={getWorkflowLabel(item.workflow_status)} />
        <button type="button" onClick={onClear} className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-800">선택 해제</button>
      </div>
      <dl className="divide-y divide-slate-200 px-4 text-xs">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] py-2"><dt className="text-slate-500">환자코드</dt><dd className="text-slate-800">{item.patient.patient_code}</dd></div>
        <div className="grid grid-cols-[112px_minmax(0,1fr)] py-2"><dt className="text-slate-500">성별 / 생년월일</dt><dd className="text-slate-800">{item.patient.sex} / {item.patient.birth_date}</dd></div>
        <div className="grid grid-cols-[112px_minmax(0,1fr)] py-2"><dt className="text-slate-500">Case</dt><dd className="break-words text-slate-800">{item.case.case_code}</dd></div>
        <div className="grid grid-cols-[112px_minmax(0,1fr)] py-2"><dt className="text-slate-500">현재 검사</dt><dd className="font-semibold text-slate-800">{order.exam_type_label}</dd></div>
        <div className="grid grid-cols-[112px_minmax(0,1fr)] py-2"><dt className="text-slate-500">현재 상태</dt><dd className="text-slate-800">{getWorkflowLabel(item.workflow_status)}</dd></div>
        <div className="grid grid-cols-[112px_minmax(0,1fr)] py-2"><dt className="text-slate-500">요청 의사</dt><dd className="text-slate-800">{item.requesting_doctor.name}</dd></div>
        <div className="grid grid-cols-[112px_minmax(0,1fr)] py-2"><dt className="text-slate-500">검사 예정 시각</dt><dd className="text-slate-800">{formatDateTime(item.scheduled_at)}</dd></div>
        <div className="grid grid-cols-[112px_minmax(0,1fr)] py-2"><dt className="text-slate-500">검사 목적</dt><dd className="whitespace-pre-wrap break-words leading-5 text-slate-700">{order.purpose || "-"}</dd></div>
      </dl>
      <div className="border-t border-slate-200 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Patient Journey</p>
        <p className="mt-2 whitespace-nowrap text-xs font-medium text-slate-700">X-ray → CT → PET-CT → 병리</p>
      </div>
    </section>
  );
}

export function RadiologyDetail({ item }: {
  item: RadiologyWorklistItem;
}) {
  const [showResultNotice, setShowResultNotice] = useState(false);
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const [loadingResult, setLoadingResult] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [analysisResult, setAnalysisResult] = useState<RadiologyAnalysisResult | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [trackedAnalysis, setTrackedAnalysis] = useState<TrackedAnalysis | null>(() => getInitialAnalysis(item));
  const order = item.examination_order;
  const image = item.latest_image_asset;
  const isXray = order.exam_type === "XRAY" && order.exam_type_label !== "PET-CT / TNM";
  const previewFile = isXray ? selectedFiles.find(isPreviewableImage) ?? null : null;
  const previewUrl = useMemo(
    () => previewFile ? URL.createObjectURL(previewFile) : null,
    [previewFile],
  );
  const selectedFileSize = selectedFiles.reduce((total, file) => total + file.size, 0);
  const selectedFileTypes = Array.from(new Set(selectedFiles.map(getFileExtension)));
  const analysisCompleted = trackedAnalysis?.status === "SUCCEEDED";
  const analysisRunning = trackedAnalysis?.status === "RUNNING" || trackedAnalysis?.status === "PENDING";
  const canStartAnalysis = image?.status === "READY" && trackedAnalysis === null;
  const trackedAnalysisId = trackedAnalysis?.analysis_id;
  const trackedAnalysisStatus = trackedAnalysis?.status;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!trackedAnalysisId || !trackedAnalysisStatus || !["PENDING", "RUNNING"].includes(trackedAnalysisStatus)) return;

    const controller = new AbortController();
    const analysisId = trackedAnalysisId;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function pollAnalysis() {
      try {
        const nextAnalysis = await fetchRadiologyAnalysis(analysisId, controller.signal);
        if (controller.signal.aborted) return;
        setTrackedAnalysis(trackAnalysis(nextAnalysis));
        if (["PENDING", "RUNNING"].includes(nextAnalysis.status)) {
          timer = setTimeout(() => void pollAnalysis(), 5000);
        }
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        setActionError(error instanceof Error ? error.message : "AI 분석 상태를 확인하지 못했습니다.");
      }
    }

    timer = setTimeout(() => void pollAnalysis(), 5000);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [trackedAnalysisId, trackedAnalysisStatus]);

  async function handleStartAnalysis() {
    setStartingAnalysis(true);
    setActionError("");
    setActionMessage("");
    try {
      const created = await startRadiologyAnalysis(order.id);
      setTrackedAnalysis(trackAnalysis(created));
      setAnalysisResult(null);
      setShowResultNotice(false);
      setActionMessage(created.status === "PENDING" ? "AI 분석이 실행 대기 상태로 등록되었습니다." : "AI 분석이 등록되었습니다.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "AI 분석을 등록하지 못했습니다.");
    } finally {
      setStartingAnalysis(false);
    }
  }

  async function handleLoadResult() {
    if (!trackedAnalysis) return;
    if (analysisResult) {
      setShowResultNotice((current) => !current);
      return;
    }
    setLoadingResult(true);
    setActionError("");
    try {
      const result = await fetchRadiologyAnalysisResult(trackedAnalysis.analysis_id);
      setAnalysisResult(result);
      setShowResultNotice(true);
    } catch (error) {
      setActionError(error instanceof RadiologyApiError ? error.message : "AI 결과를 불러오지 못했습니다.");
    } finally {
      setLoadingResult(false);
    }
  }

  return (
    <main aria-label="영상 및 AI 작업" className="min-h-0 min-w-0 overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">영상 및 AI 작업</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{order.exam_type_label === "PET-CT / TNM" ? "PET-CT 영상 / TNM AI 분석" : `${order.exam_type_label} 영상 / AI 분석`}</h2>
            <p className="mt-1 text-xs text-slate-500">{item.patient.name} · {item.patient.patient_code}</p>
            {order.exam_type_label === "PET-CT / TNM" ? <p className="mt-1 text-xs font-medium text-slate-600">PET-CT 영상 → TNM AI 분석 → TNM 결과</p> : null}
          </div>
          <StatusBadge status={item.workflow_status} label={getWorkflowLabel(item.workflow_status)} />
        </div>
      </div>

      <div className="divide-y divide-slate-200 px-5">
        <section className="py-5" aria-labelledby="image-upload-heading">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 id="image-upload-heading" className="text-sm font-bold text-slate-800"><span className="mr-2 text-xs text-blue-700">01</span>영상 준비</h3>
              {image ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <StatusBadge status={image.status} label={image.status_label} />
                  <span>{image.image_type} · 영상 자산 {item.image_asset_count}건</span>
                  <span className="text-slate-400">촬영 {formatDateTime(image.acquired_at)}</span>
                </div>
              ) : <p className="mt-2 text-xs text-slate-500">연결된 영상 자산이 없습니다.</p>}
            </div>
            <label className="shrink-0 cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              로컬 영상 선택
              <input
                type="file"
                multiple={!isXray}
                accept=".dcm,.dicom,image/jpeg,image/png,application/dicom"
                className="sr-only"
                onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          </div>
          {selectedFiles.length === 0 ? <div className="mt-4 flex min-h-72 flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-50 px-6 text-center"><p className="text-sm font-semibold text-slate-700">영상 미리보기</p><p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">로컬 영상을 선택하면<br />미리보기 또는 Series 정보를 확인할 수 있습니다.</p></div> : null}
          {selectedFiles.length > 0 ? (
            <div className="mt-4 border-l-2 border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-800">선택 영상 {selectedFiles.length}건 · {formatFileSize(selectedFileSize)}</p>
                <StatusBadge status="IMAGE_PENDING" label="영상 연결 대기" />
              </div>
              <p className="mt-1 text-slate-500">파일 형식: {selectedFileTypes.join(", ")}</p>
              {previewUrl ? <div className="mt-3 flex min-h-72 items-center justify-center border border-slate-200 bg-slate-950"><Image src={previewUrl} alt="선택한 X-ray 영상 미리보기" width={960} height={640} unoptimized className="max-h-[420px] h-auto w-auto max-w-full object-contain" /></div> : null}
              {isXray && !previewUrl ? <div className="mt-3 flex min-h-72 items-center justify-center border border-dashed border-slate-300 bg-slate-100 px-3 text-center text-slate-500">DICOM 파일은 이 화면에서 미리보기를 제공하지 않습니다.</div> : null}
              {!isXray ? (
                <div className="mt-3">
                  <div className="flex min-h-72 flex-col items-center justify-center border border-dashed border-slate-300 bg-slate-100 text-center text-slate-600"><p className="text-sm font-semibold">선택된 DICOM Series</p><p className="mt-2 text-2xl font-bold text-slate-800">{selectedFiles.length} files</p></div>
                  <div className="mt-3 space-y-1">
                  {selectedFiles.slice(0, 3).map((file) => <p key={`${file.name}-${file.lastModified}`} className="truncate">{file.name} · {formatFileSize(file.size)}</p>)}
                  {selectedFiles.length > 3 ? <p className="text-slate-500">외 {selectedFiles.length - 3}개 파일</p> : null}
                  </div>
                </div>
              ) : null}
              <p className="mt-3 text-slate-500">선택한 파일은 아직 서버에 업로드되거나 영상 자산으로 등록되지 않았습니다.</p>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">영상 저장소 연결 후 등록됩니다.</p>
        </section>

        <section className="py-5" aria-labelledby="ai-analysis-heading">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h3 id="ai-analysis-heading" className="text-sm font-bold text-slate-800"><span className="mr-2 text-xs text-blue-700">02</span>{getAnalysisLabel(item)}</h3>
              {trackedAnalysis ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>현재 상태: <StatusBadge status={trackedAnalysis.status} label={trackedAnalysis.status === "PENDING" ? "실행 대기" : trackedAnalysis.status === "RUNNING" ? "분석 중" : trackedAnalysis.status === "SUCCEEDED" ? "분석 완료" : "분석 실패"} /></span>
                  <span>모델: <strong className="font-semibold text-slate-700">{trackedAnalysis.model_name} · {trackedAnalysis.model_version}</strong></span>
                </div>
              ) : <p className="mt-2 text-xs text-slate-500">현재 상태: AI 분석 이력 없음</p>}
            </div>
            <button type="button" disabled={!canStartAnalysis || startingAnalysis} onClick={handleStartAnalysis} className="shrink-0 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{startingAnalysis ? "등록 중" : "AI 분석 실행"}</button>
          </div>

          {analysisRunning ? (
            <div className="mt-4" role="status">
              <div className="mb-2 flex items-center justify-between text-xs"><strong className="font-semibold text-blue-700">AI 분석 중</strong><span className="text-slate-400">실시간 진행률 정보는 제공되지 않습니다.</span></div>
              <div className="h-1.5 overflow-hidden bg-slate-200"><div className="h-full w-1/3 animate-pulse bg-blue-600" /></div>
              <p className="mt-2 text-xs text-slate-500">모델 분석을 처리하고 있습니다.</p>
            </div>
          ) : null}
          {trackedAnalysis?.status === "FAILED" ? <p className="mt-4 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-700">AI 분석에 실패했습니다.{trackedAnalysis.error_message ? ` ${trackedAnalysis.error_message}` : ""}</p> : null}
          {!trackedAnalysis ? <p className="mt-3 text-xs text-slate-500">READY 영상 자산에서 분석을 실행할 수 있습니다.</p> : null}
          {actionMessage ? <p className="mt-3 border-l-2 border-blue-600 bg-blue-50 px-3 py-2 text-xs text-blue-800">{actionMessage}</p> : null}
          {actionError ? <p className="mt-3 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</p> : null}

          {analysisCompleted ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-l-2 border-blue-600 bg-blue-50 px-4 py-3">
              <div><p className="text-sm font-semibold text-blue-900">AI 분석 완료</p><p className="mt-1 text-xs text-blue-700">분석 결과를 확인할 수 있습니다.</p></div>
              <button type="button" disabled={loadingResult} onClick={handleLoadResult} className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{loadingResult ? "결과 조회 중" : "AI 결과 보기"}</button>
            </div>
          ) : null}
        </section>

        <section className="py-5" aria-labelledby="ai-result-heading">
          <h3 id="ai-result-heading" className="text-sm font-bold text-slate-800">AI 분석 결과</h3>
          {showResultNotice && analysisResult ? <div className="mt-4 border-t border-slate-200 pt-4"><AnalysisResultView data={analysisResult} /></div> : <p className="mt-3 text-xs text-slate-500">분석 완료 후 결과가 표시됩니다.</p>}
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
    </main>
  );
}
