"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { StatusBadge } from "@/components/workspace/status-badge";

import {
  fetchRadiologyAnalysis,
  fetchRadiologyAnalysisResult,
  fetchRadiologyXrayImage,
  RadiologyApiError,
  startRadiologyAnalysis,
  submitRadiologyAnalysisForReview,
  uploadRadiologyXrayImage,
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
    AI_COMPLETED: "AI 분석 완료",
    AI_FAILED: "AI 실패",
    REVIEW_PENDING: "의사 판독 대기",
    REVIEW_COMPLETED: "판독 완료",
  };
  return labels[status];
}

function getAnalysisLabel(item: RadiologyWorklistItem) {
  if (item.examination_order.exam_type_label === "PET-CT") return "TNM AI 분석";
  return item.examination_order.exam_type === "XRAY" ? "X-ray AI 분석" : "CT AI 분석";
}

function formatPercent(value: string | null, scale = 100) {
  if (value === null) return "-";
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * scale).toFixed(1)}%` : value;
}

type XrayResult = Extract<RadiologyAnalysisResult["result"], { assessment: string }>;

function formatPayloadPercent(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(1)}%` : String(value);
}

function XrayImagePanel({
  title,
  imageUrl,
  result,
  showDetections,
}: {
  title: string;
  imageUrl: string | null;
  result: XrayResult;
  showDetections: boolean;
}) {
  const width = Number(result.image.width);
  const height = Number(result.image.height);
  const canOverlay = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
  const detections = result.detections.filter((detection) => (
    Array.isArray(detection.bbox_xyxy)
    && detection.bbox_xyxy.length === 4
    && detection.bbox_xyxy.every((value) => Number.isFinite(Number(value)))
  ));

  return <section className="rounded-xl border border-slate-200 bg-slate-950 p-3">
    <p className="mb-2 text-xs font-semibold text-slate-200">{title}</p>
    {imageUrl && canOverlay ? <div className="relative mx-auto w-full overflow-hidden bg-black" style={{ aspectRatio: `${width} / ${height}` }}>
      <Image src={imageUrl} alt={title} fill unoptimized sizes="(min-width: 1280px) 50vw, 100vw" className="object-contain" />
      {showDetections ? detections.map((detection, index) => {
        const [left, top, right, bottom] = detection.bbox_xyxy as [number, number, number, number];
        const boxWidth = Math.max(0, right - left);
        const boxHeight = Math.max(0, bottom - top);
        return <div key={`${detection.class_name ?? "detection"}-${index}`} className="absolute border-2 border-rose-400" style={{ left: `${(left / width) * 100}%`, top: `${(top / height) * 100}%`, width: `${(boxWidth / width) * 100}%`, height: `${(boxHeight / height) * 100}%` }}>
          <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{detection.class_name ?? "-"} {formatPayloadPercent(detection.score)}</span>
        </div>;
      }) : null}
    </div> : <div className="flex min-h-48 items-center justify-center border border-dashed border-slate-600 text-xs text-slate-400">{imageUrl ? "Image dimensions are unavailable." : "Image is loading."}</div>}
  </section>;
}

function AnalysisResultView({ data, sourceImageUrl }: { data: RadiologyAnalysisResult; sourceImageUrl: string | null }) {
  if ("assessment" in data.result) {
    const result = data.result;
    const probabilities = result.classification.probabilities ?? {};
    const labels = [
      ["Normal", probabilities.Normal],
      ["Other Lung Disease", probabilities["Other Lung Disease"]],
      ["Suspicious Lung Cancer", probabilities["Suspicious Lung Cancer"]],
    ] as const;
    return <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <XrayImagePanel title="\uc6d0\ubcf8 X-ray" imageUrl={sourceImageUrl} result={result} showDetections={false} />
        <XrayImagePanel title="AI \uc758\uc2ec \ubd80\uc704 Detection" imageUrl={sourceImageUrl} result={result} showDetections />
      </div>
      <dl className="grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4"><dt className="text-violet-600">\ud310\uc815</dt><dd className="mt-2 text-lg font-bold text-slate-900">{result.assessment_label}</dd></div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4"><dt className="text-blue-600">\uc758\uc2ec \uc810\uc218</dt><dd className="mt-2 text-lg font-bold text-slate-900">{formatPayloadPercent(result.classification.suspicion_score ?? result.suspicion_score)}</dd></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><dt className="text-slate-500">Prediction</dt><dd className="mt-2 break-words font-semibold text-slate-900">{result.classification.prediction ?? "-"}</dd></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><dt className="text-slate-500">assessment</dt><dd className="mt-2 break-words font-semibold text-slate-900">{result.classification.assessment ?? "-"}</dd></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><dt className="text-slate-500">model_revision</dt><dd className="mt-2 break-words font-semibold text-slate-900">{result.model_revision ?? "-"}</dd></div>
      </dl>
      <div className="grid gap-3 sm:grid-cols-3">{labels.map(([label, probability]) => <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs"><p className="text-slate-500">{label}</p><p className="mt-1 text-base font-bold text-slate-900">{formatPayloadPercent(probability)}</p></div>)}</div>
    </div>;
  }
  if ("nodules" in data.result) {
    return <div className="text-xs"><dl className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4"><dt className="text-violet-600">\uc804\uccb4 \uc545\uc131 \uc704\ud5d8\ub3c4</dt><dd className="mt-2 text-lg font-bold text-slate-900">{formatPercent(data.result.overall_malignancy_risk, 1)}</dd></div><div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4"><dt className="text-blue-600">\uacb0\uc808 \uac1c\uc218</dt><dd className="mt-2 text-lg font-bold text-slate-900">{data.result.nodules.length}</dd></div></dl></div>;
  }
  return <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">{[["T", data.result.predicted_t], ["N", data.result.predicted_n], ["M", data.result.predicted_m], ["Stage", data.result.predicted_stage_group], ["Confidence", formatPercent(data.result.confidence)]].map(([label, value]) => <div key={label} className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/70 to-blue-50/50 p-4"><dt className="text-violet-600">{label}</dt><dd className="mt-2 text-xl font-bold text-slate-900">{value ?? "-"}</dd></div>)}</dl>;
}

export function RadiologyPatientSummary({ item, onClear }: {
  item: RadiologyWorklistItem;
  onClear: () => void;
}) {
  const order = item.examination_order;

  return (
    <section aria-labelledby="selected-patient-heading" className="min-h-0 overflow-y-auto bg-gradient-to-b from-violet-50/50 to-blue-50/30 p-4">
      <div className="flex items-center gap-3 rounded-t-2xl border border-violet-100 bg-gradient-to-r from-white to-violet-50/70 px-5 py-4 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">선택 환자</p>
          <div className="mt-1 flex min-w-0 items-baseline gap-2"><h2 id="selected-patient-heading" className="truncate text-lg font-bold text-slate-900">{item.patient.name}</h2><span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{item.patient.patient_code}</span></div>
        </div>
        <StatusBadge status={item.workflow_status} label={getWorkflowLabel(item.workflow_status)} />
        <button type="button" onClick={onClear} className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-800">선택 해제</button>
      </div>
      <dl className="grid gap-x-4 gap-y-3 border-x border-violet-100 bg-white px-5 py-4 text-xs sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <div><dt className="text-[11px] text-slate-400">환자코드</dt><dd className="mt-1 font-medium text-slate-800">{item.patient.patient_code}</dd></div>
        <div><dt className="text-[11px] text-slate-400">성별 / 생년월일</dt><dd className="mt-1 font-medium text-slate-800">{item.patient.sex} / {item.patient.birth_date}</dd></div>
        <div><dt className="text-[11px] text-slate-400">Case</dt><dd className="mt-1 break-words font-medium text-slate-800">{item.case.case_code}</dd></div>
        <div><dt className="text-[11px] text-slate-400">현재 검사</dt><dd className="mt-1 font-semibold text-violet-700">{order.exam_type_label}</dd></div>
        <div><dt className="text-[11px] text-slate-400">현재 상태</dt><dd className="mt-1 font-medium text-slate-800">{getWorkflowLabel(item.workflow_status)}</dd></div>
        <div><dt className="text-[11px] text-slate-400">요청 의사</dt><dd className="mt-1 font-medium text-slate-800">{item.requesting_doctor.name}</dd></div>
        <div><dt className="text-[11px] text-slate-400">검사 예정 시각</dt><dd className="mt-1 font-medium text-slate-800">{formatDateTime(item.scheduled_at)}</dd></div>
        <div><dt className="text-[11px] text-slate-400">검사 목적</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-5 text-slate-700">{order.purpose || "-"}</dd></div>
      </dl>
      <div className="rounded-b-2xl border border-violet-100 bg-blue-50/40 px-5 py-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Patient Journey</p>
        <p className="mt-2 whitespace-nowrap text-xs font-medium text-slate-700">X-ray → CT → PET-CT → 병리</p>
      </div>
    </section>
  );
}

export function RadiologyDetail({ item, embedded = false, onImageUploaded }: {
  item: RadiologyWorklistItem;
  embedded?: boolean;
  onImageUploaded?: () => void;
}) {
  const [showResultNotice, setShowResultNotice] = useState(false);
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const [loadingResult, setLoadingResult] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(
    item.workflow_status === "REVIEW_PENDING" || item.workflow_status === "REVIEW_COMPLETED",
  );
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [analysisResult, setAnalysisResult] = useState<RadiologyAnalysisResult | null>(null);
  const [serverImageUrl, setServerImageUrl] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [trackedAnalysis, setTrackedAnalysis] = useState<TrackedAnalysis | null>(() => getInitialAnalysis(item));
  const order = item.examination_order;
  const image = item.latest_image_asset;
  const isXray = order.exam_type === "XRAY";
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
    if (!isXray || !image?.id) {
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetchRadiologyXrayImage(order.id, image.id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setServerImageUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setServerImageUrl(null);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image?.id, isXray, order.id]);

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

  useEffect(() => {
    if (!trackedAnalysisId || trackedAnalysisStatus !== "SUCCEEDED" || analysisResult) return;
    const controller = new AbortController();
    void fetchRadiologyAnalysisResult(trackedAnalysisId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setAnalysisResult(result);
          setShowResultNotice(true);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [analysisResult, trackedAnalysisId, trackedAnalysisStatus]);

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

  async function handleUploadImage() {
    if (!isXray || !previewFile) return;
    setUploadingImage(true);
    setActionError("");
    setActionMessage("");
    try {
      await uploadRadiologyXrayImage(order.id, previewFile);
      setSelectedFiles([]);
      setActionMessage("X-ray 영상이 업로드되어 영상 자산으로 연결되었습니다.");
      onImageUploaded?.();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "X-ray 영상을 업로드하지 못했습니다.");
    } finally {
      setUploadingImage(false);
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

  async function handleSubmitForReview() {
    if (!trackedAnalysis || trackedAnalysis.status !== "SUCCEEDED" || submitted) return;
    setSubmitting(true);
    setActionError("");
    try {
      const response = await submitRadiologyAnalysisForReview(trackedAnalysis.analysis_id);
      setSubmitted(true);
      setActionMessage(
        response.submitted
          ? "AI 결과를 담당 의사에게 제출했습니다."
          : "이미 담당 의사에게 제출된 AI 결과입니다.",
      );
    } catch (error) {
      setActionError(error instanceof RadiologyApiError ? error.message : "AI 결과를 제출하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main aria-label="영상 및 AI 작업" className={embedded ? "min-w-0 rounded-b-2xl border border-t-0 border-violet-100 bg-gradient-to-b from-white to-blue-50/30" : "min-h-0 min-w-0 overflow-y-auto bg-slate-50/60"}>
      {!embedded ? <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">영상 및 AI 작업</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{order.exam_type_label === "PET-CT" ? "PET-CT 영상 / TNM AI 분석" : `${order.exam_type_label} 영상 / AI 분석`}</h2>
            <p className="mt-1 text-xs text-slate-500">{item.patient.name} · {item.patient.patient_code}</p>
            {order.exam_type_label === "PET-CT" ? <p className="mt-1 text-xs font-medium text-slate-600">PET-CT 영상 → TNM AI 분석 → 결과 확인</p> : null}
          </div>
          <StatusBadge status={item.workflow_status} label={getWorkflowLabel(item.workflow_status)} />
        </div>
      </div> : null}

      <div className="space-y-4 p-5">
        <div className="relative grid grid-cols-2 gap-2 rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50/70 via-white to-blue-50/70 p-3 shadow-sm sm:grid-cols-4">
          {[
            ["01", "영상 준비", Boolean(image)],
            ["02", "AI 분석", analysisCompleted || analysisRunning],
            ["03", "결과 확인", Boolean(analysisResult)],
            ["04", "의사에게 제출", submitted],
          ].map(([number, label, completed], index) => {
            const active = index === 0 ? !image : index === 1 ? Boolean(image) && !analysisCompleted : index === 2 ? analysisCompleted && !analysisResult : analysisCompleted && !submitted;
            return <div key={String(number)} className={`relative rounded-xl border px-3 py-3 transition-colors ${completed ? "border-emerald-200 bg-emerald-50/90 text-emerald-700" : active ? "border-violet-300 bg-violet-100/80 text-violet-700 shadow-sm" : "border-slate-100 bg-white/70 text-slate-400"}`}><span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${completed ? "bg-emerald-100" : active ? "bg-violet-200" : "bg-slate-100"}`}>{number}</span><p className="mt-1.5 text-xs font-semibold">{label}</p></div>;
          })}
        </div>
        <section className="rounded-xl border border-blue-100 bg-white p-5 shadow-sm" aria-labelledby="image-upload-heading">
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
                accept={isXray ? "image/jpeg,image/png" : ".dcm,.dicom,application/dicom"}
                className="sr-only"
                onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
              />
            </label>
          </div>
          {selectedFiles.length === 0 ? <div className="mt-4 flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-gradient-to-br from-slate-50 to-blue-50/70 px-6 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl text-blue-300 shadow-sm" aria-hidden="true">＋</span><p className="mt-3 text-sm font-semibold text-slate-700">영상 미리보기</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">로컬 영상을 선택하면 미리보기 또는 Series 정보를 확인할 수 있습니다.</p></div> : null}
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
              {isXray ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-slate-500">{"\uc120\ud0dd\ud55c PNG \ub610\ub294 JPEG\ub294 \uc5c5\ub85c\ub4dc \ud6c4 \uc601\uc0c1 \uc790\uc0b0\uc73c\ub85c \uc5f0\uacb0\ub429\ub2c8\ub2e4."}</p><button type="button" onClick={handleUploadImage} disabled={!previewFile || uploadingImage} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{uploadingImage ? "\uc5c5\ub85c\ub4dc \uc911" : "\uc11c\ubc84\uc5d0 \uc5c5\ub85c\ub4dc"}</button></div> : <p className="mt-3 text-slate-500">선택한 파일은 아직 서버에 업로드되거나 영상 자산으로 등록되지 않았습니다.</p>}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">영상 저장소 연결 후 등록됩니다.</p>
        </section>

        <section className="rounded-xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/30 p-5 shadow-sm" aria-labelledby="ai-analysis-heading">
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
            <button type="button" disabled={!canStartAnalysis || startingAnalysis} onClick={handleStartAnalysis} className="shrink-0 rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">{startingAnalysis ? "등록 중" : "AI 분석 실행"}</button>
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-blue-50 px-4 py-3">
              <div><p className="text-sm font-semibold text-emerald-800">AI 분석 완료</p><p className="mt-1 text-xs text-slate-600">분석 결과를 확인할 수 있습니다.</p></div>
              <button type="button" disabled={loadingResult} onClick={handleLoadResult} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{loadingResult ? "결과 조회 중" : "AI 결과 보기"}</button>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-violet-100 bg-white p-5 shadow-sm" aria-labelledby="ai-result-heading">
          <h3 id="ai-result-heading" className="text-sm font-bold text-slate-800"><span className="mr-2 text-xs text-violet-600">03</span>AI 분석 결과</h3>
          {showResultNotice && analysisResult ? <div className="mt-4"><AnalysisResultView data={analysisResult} sourceImageUrl={serverImageUrl} /></div> : <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center text-xs text-slate-500">분석 완료 후 결과가 표시됩니다.</div>}
        </section>

        <section className={`rounded-xl border p-5 shadow-sm ${item.workflow_status === "REVIEW_COMPLETED" ? "border-emerald-200 bg-emerald-50/60" : "border-violet-200 bg-gradient-to-r from-violet-50/90 to-blue-50/70"}`} aria-labelledby="review-heading">
          <h3 id="review-heading" className="text-sm font-bold text-slate-800"><span className="mr-2 text-xs text-violet-600">04</span>의사에게 제출</h3>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/80 bg-white/65 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{submitted ? "제출 완료" : "AI 분석 결과를 담당 호흡기내과 의사에게 제출합니다."}</p>
              <p className="mt-1 text-xs text-slate-500">담당 의사: {item.responsible_doctor?.name ?? "미지정"}</p>
            </div>
            {submitted ? <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">제출 완료</span> : <button type="button" onClick={handleSubmitForReview} disabled={!analysisCompleted || !item.responsible_doctor || submitting} className="rounded-lg bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300">{submitting ? "제출 중" : "의사에게 제출"}</button>}
          </div>
          {!analysisCompleted ? <p className="mt-2 text-xs text-slate-500">AI 분석이 완료된 후 제출할 수 있습니다.</p> : null}
          {analysisCompleted && !item.responsible_doctor ? <p className="mt-2 text-xs text-amber-700">현재 Case에 연결된 담당 의사가 없어 제출할 수 없습니다.</p> : null}
        </section>
      </div>
    </main>
  );
}
