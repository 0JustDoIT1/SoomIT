"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { StateMessage } from "@/components/workspace/state-message";

import {
  fetchRadiologyCompletedExams,
  fetchRadiologyXrayImage,
  type RadiologyCompletedExam,
  type RadiologyCompletedExamHistory,
} from "../_lib/radiology-api";

const CtRegisteredSeriesPreview = dynamic(
  () => import("./ct-registered-series-preview").then((module) => module.CtRegisteredSeriesPreview),
  { ssr: false },
);

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function formatPercent(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(1)}%` : String(value);
}

function valueOf(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function XrayHistoryPreview({ orderId, assetId }: { orderId: string; assetId: string }) {
  return <XrayHistoryPreviewContent key={`${orderId}:${assetId}`} orderId={orderId} assetId={assetId} />;
}

function XrayHistoryPreviewContent({ orderId, assetId }: { orderId: string; assetId: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetchRadiologyXrayImage(orderId, assetId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, orderId]);

  return (
    <div className="relative h-32 overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
      {imageUrl ? (
        <Image src={imageUrl} alt="완료된 X-ray 대표 영상" fill unoptimized sizes="320px" className="object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-slate-300">
          {failed ? "대표 영상 미리보기를 불러올 수 없습니다." : "대표 영상을 불러오는 중입니다."}
        </div>
      )}
    </div>
  );
}

function ImagePreview({ exam }: { exam: RadiologyCompletedExam }) {
  const asset = exam.latest_image_asset;
  const order = exam.examination_order;
  if (!asset) return <p className="text-xs text-slate-500">대표 영상 미리보기 없음</p>;
  if (order.order_type === "XRAY") return <XrayHistoryPreview orderId={order.id} assetId={asset.id} />;
  if (order.order_type === "CT") return <CtRegisteredSeriesPreview orderId={order.id} assetId={asset.id} />;
  return <p className="text-xs text-slate-500">대표 영상 미리보기 없음</p>;
}

function AiResultSummary({ exam }: { exam: RadiologyCompletedExam }) {
  const result = exam.ai_result;
  if (!result) return <p className="text-xs text-slate-500">저장된 AI 분석 결과가 없습니다.</p>;
  if ("assessment" in result) {
    return <dl className="grid gap-3 text-xs sm:grid-cols-3">
      <div><dt className="text-slate-500">판정</dt><dd className="mt-1 font-semibold text-slate-800">{result.assessment_label}</dd></div>
      <div><dt className="text-slate-500">의심 점수</dt><dd className="mt-1 font-semibold text-slate-800">{formatPercent(result.classification.suspicion_score ?? result.suspicion_score)}</dd></div>
      <div><dt className="text-slate-500">Detection 수</dt><dd className="mt-1 font-semibold text-slate-800">{result.detections.length}</dd></div>
    </dl>;
  }
  if ("nodules" in result) {
    const firstNodule = result.nodules[0];
    const payload = firstNodule?.finding_payload;
    const quantification = payload && typeof payload === "object"
      ? (payload as { quantification?: { maximum_3d_diameter_mm?: number | null; equivalent_diameter_mm?: number | null } }).quantification
      : undefined;
    const diameter = quantification?.maximum_3d_diameter_mm ?? quantification?.equivalent_diameter_mm ?? null;
    return <dl className="grid gap-3 text-xs sm:grid-cols-3">
      <div><dt className="text-slate-500">결절 수</dt><dd className="mt-1 font-semibold text-slate-800">{result.nodules.length}</dd></div>
      <div><dt className="text-slate-500">전체 악성 위험도</dt><dd className="mt-1 font-semibold text-slate-800">{formatPercent(result.overall_malignancy_risk)}</dd></div>
      {firstNodule ? <div><dt className="text-slate-500">첫 번째 결절 직경</dt><dd className="mt-1 font-semibold text-slate-800">{diameter === null ? "-" : `${diameter.toFixed(1)} mm`}</dd></div> : null}
    </dl>;
  }
  const payload = result.result_payload;
  return <dl className="grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
    <div><dt className="text-slate-500">T candidate</dt><dd className="mt-1 font-semibold text-slate-800">{valueOf(payload?.t?.t_candidate)}</dd></div>
    <div><dt className="text-slate-500">Size-only candidate</dt><dd className="mt-1 font-semibold text-slate-800">{valueOf(payload?.t?.size_only_t_candidate)}</dd></div>
    <div><dt className="text-slate-500">N+ probability</dt><dd className="mt-1 font-semibold text-slate-800">{formatPercent(payload?.n?.nplus_probability)}</dd></div>
    <div><dt className="text-slate-500">Risk tier</dt><dd className="mt-1 font-semibold text-slate-800">{valueOf(payload?.n?.risk_tier)}</dd></div>
    <div><dt className="text-slate-500">M candidate</dt><dd className="mt-1 font-semibold text-slate-800">{valueOf(payload?.m?.m_candidate)}</dd></div>
  </dl>;
}

function CompletedExamAccordion({ exam }: { exam: RadiologyCompletedExam }) {
  const order = exam.examination_order;
  const completedAt = formatDateTime(exam.completed_at);
  return <details className="group border-t border-slate-200 first:border-t-0">
    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-left hover:bg-slate-50">
      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90"><path d="m7 4 6 6-6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
      <div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{order.order_type_label} 분석 완료</p><p className="mt-1 text-xs text-slate-500">{completedAt ? `완료일 ${completedAt}` : "완료일 정보 없음"}</p></div>
      <span className="shrink-0 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-slate-900">진행 완료</span>
    </summary>
    <div className="grid gap-5 border-t border-slate-100 bg-slate-50/60 px-5 py-5 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
      <section><h4 className="text-xs font-bold text-slate-700">대표 영상 미리보기</h4><div className="mt-3"><ImagePreview exam={exam} /></div></section>
      <div className="space-y-5">
        <section><h4 className="text-xs font-bold text-slate-700">검사 기본 정보</h4><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div><dt className="text-slate-500">검사</dt><dd className="mt-1 font-semibold text-slate-800">{order.order_type_label}</dd></div>
          <div><dt className="text-slate-500">요청 의사</dt><dd className="mt-1 font-semibold text-slate-800">{exam.requesting_doctor.name}</dd></div>
          {order.purpose ? <div className="sm:col-span-2"><dt className="text-slate-500">검사 목적</dt><dd className="mt-1 text-slate-800">{order.purpose}</dd></div> : null}
        </dl></section>
        <section><h4 className="text-xs font-bold text-slate-700">AI 분석 결과 요약</h4><div className="mt-3"><AiResultSummary exam={exam} /></div></section>
        <section><h4 className="text-xs font-bold text-slate-700">검토 정보</h4>{exam.review ? <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
          <div><dt className="text-slate-500">상태</dt><dd className="mt-1 font-semibold text-slate-800">{exam.review.status}</dd></div>
          <div><dt className="text-slate-500">담당 의사</dt><dd className="mt-1 font-semibold text-slate-800">{exam.review.assigned_doctor.name}</dd></div>
          <div><dt className="text-slate-500">제출 시각</dt><dd className="mt-1 font-semibold text-slate-800">{formatDateTime(exam.review.submitted_at) ?? "-"}</dd></div>
        </dl> : <p className="mt-3 text-xs text-slate-500">검토 정보가 없습니다.</p>}</section>
      </div>
    </div>
  </details>;
}

function CompletedCaseCard({ history }: { history: RadiologyCompletedExamHistory }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={`${history.patient.name} 완료 검사 이력`}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-4"><div><h3 className="font-bold text-slate-900">{history.patient.name}<span className="ml-2 text-sm font-medium text-slate-500">{history.patient.patient_code}</span></h3><p className="mt-1 text-xs text-slate-500">Case {history.case.case_code}</p></div><p className="text-xs text-slate-500">완료 검사 {history.completed_exams.length}건</p></header>
    <div>{history.completed_exams.map((exam) => <CompletedExamAccordion key={exam.examination_order.id} exam={exam} />)}</div>
  </section>;
}

export function RadiologyCompletedHistory() {
  const [histories, setHistories] = useState<RadiologyCompletedExamHistory[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetchRadiologyCompletedExams(controller.signal)
      .then((data) => { if (!controller.signal.aborted) setHistories(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && (reason as Error).name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "완료 기록을 불러올 수 없습니다.");
        }
      });
    return () => controller.abort();
  }, []);

  if (error) return <StateMessage variant="error" title="완료 기록을 조회할 수 없습니다." description={error} />;
  if (!histories) return <StateMessage variant="loading" title="완료 기록을 불러오는 중입니다." />;
  if (histories.length === 0) return <StateMessage variant="empty" title="완료된 검사 이력이 없습니다." />;
  return <section className="space-y-4" aria-label="완료 기록">{histories.map((history) => <CompletedCaseCard key={history.case.id} history={history} />)}</section>;
}
