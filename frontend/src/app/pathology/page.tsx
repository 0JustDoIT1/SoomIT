"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import Image from "next/image";
import { RecentPatients, useRecentPatients } from "@/components/workspace/recent-patients";
import { StateMessage } from "@/components/workspace/state-message";
import { showToast } from "@/components/ui/toast/toast";
import { formatPatientSex } from "@/lib/patient-display";
import { OrthancWsiViewer } from "./_components/orthanc-wsi-viewer";

import {
  fetchPathologyCaseWorkflow,
  fetchPathologyCompletedExams,
  fetchPathologyGeneAnalyses,
  fetchPathologyWsiPreview,
  fetchPathologyWsiTissueHeatmap,
  fetchPathologyWorkstation,
  fetchPdl1Analyses,
  runPathologyGeneAnalysis,
  runPdl1Analysis,
  uploadPdl1Input,
  uploadPathologyGeneInput,
  submitPathologyForReview,
  type PathologyWorkstationItem,
  type PathologyCaseWorkflow,
  type PathologyCompletedExamHistory,
} from "./_lib/pathology-workstation-api";

import type { PathologyAiAnalysis } from "./_lib/pathology-api";

type Tab = "worklist" | "completed";

const PAGE_SIZE = 10;

function WorklistSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-auto" role="status" aria-label="Worklist 로딩 중" aria-busy="true">
      <span className="sr-only">Worklist 로딩 중</span>
      <table className="w-full min-w-[420px] text-left text-xs" aria-hidden="true">
        <thead className="sticky top-0 z-[1] bg-[#F1F3FF] text-slate-600">
          <tr>
            {["환자명", "환자코드", "검사", "상태"].map((label) => (
              <th key={label} className="px-3 py-2.5">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="motion-safe:animate-pulse">
          {Array.from({ length: 7 }, (_, index) => (
            <tr key={index} className="border-b border-l-[3px] border-l-transparent border-b-[#E8EAF3]">
              {["w-14", "w-20", "w-12", "w-16"].map((width) => (
                <td key={width} className="px-3 py-2.5">
                  <div className={`h-4 max-w-full rounded bg-slate-100 ${width}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const geneTargets = [
  { symbol: "EGFR", label: "EGFR" },
  { symbol: "KRAS", label: "KRAS" },
  { symbol: "BRAF", label: "BRAF" },
  { symbol: "MET", label: "MET" },
  { symbol: "ERBB2", label: "HER2 (ERBB2)" },
  { symbol: "TP53", label: "TP53" },
  { symbol: "STK11", label: "STK11" },
  { symbol: "KEAP1", label: "KEAP1" },
];

const pathologyOrderTypeLabels = {
  PATHOLOGY_GENE: "조직·유전자 검사",
  PDL1: "PD-L1 검사",
} as const;

function getPathologyOrderTypeLabel(
  orderType: string | null | undefined,
  fallback?: string | null,
) {
  if (orderType && Object.hasOwn(pathologyOrderTypeLabels, orderType)) {
    return pathologyOrderTypeLabels[
      orderType as keyof typeof pathologyOrderTypeLabels
    ];
  }

  return fallback?.trim() || "검사 종류 미확인";
}

function workflowDisplayStatus(item: PathologyWorkstationItem) {
  if (item.workflow_status === "REVIEW_COMPLETED") {
    return "호흡기내과 확정 완료";
  }

  if (
    item.workflow_status === "AI_COMPLETED" ||
    item.workflow_status === "REVIEW_PENDING"
  ) {
    return "AI 분석 완료";
  }

  if (item.workflow_status === "SCHEDULED") {
    return "예약중";
  }

  return "조직검사 완료";
}

function worklistDisplayStatus(item: PathologyWorkstationItem) {
  if (item.workflow_status === "REVIEW_COMPLETED") {
    return "진행 완료";
  }

  if (
    item.workflow_status === "AI_COMPLETED" ||
    item.workflow_status === "REVIEW_PENDING"
  ) {
    return "검토 대기 중";
  }

  return "AI 분석 전";
}

const workflowStatusGroups: Record<string, PathologyWorkstationItem["workflow_status"][]> = {
  AI_BEFORE: ["SCHEDULED", "SPECIMEN_COMPLETED", "IMAGE_PENDING", "AI_READY", "AI_RUNNING", "CANCELLED"],
  REVIEW_PENDING: ["AI_COMPLETED", "REVIEW_PENDING"],
  REVIEW_COMPLETED: ["REVIEW_COMPLETED"],
};

function percent(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return String(value);
  }

  return `${(
    numericValue >= 0 && numericValue <= 1
      ? numericValue * 100
      : numericValue
  ).toFixed(1)}%`;
}

function resultPayloadText(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || !(key in payload)) return "-";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "-";
}

function pathologyGeneStatus(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("gene" in payload)) return null;
  const gene = (payload as Record<string, unknown>).gene;
  if (!gene || typeof gene !== "object" || !("status" in gene)) return null;
  const status = (gene as Record<string, unknown>).status;
  return typeof status === "string" ? status : null;
}

function geneStatus(value: string | undefined) {
  if (value === "PREDICTED_POSITIVE") return "Positive";
  if (value === "PREDICTED_NEGATIVE") return "Negative";
  if (value === "INDETERMINATE") return "Indeterminate";

  return "-";
}

type PathologyGeneResultEntry = NonNullable<
  NonNullable<PathologyAiAnalysis["result_detail"]>["genes"]
>[number];

function PathologyGeneResultGroups({
  results,
  compact = false,
}: {
  results: PathologyGeneResultEntry[];
  compact?: boolean;
}) {
  const displayResults = geneTargets.map((target) => ({
    target,
    result: results.find((entry) => entry?.gene_symbol === target.symbol) ?? null,
  }));
  const positiveResults = displayResults.filter(
    ({ result }) => result?.predicted_status === "PREDICTED_POSITIVE",
  );
  const otherResults = displayResults.filter(
    ({ result }) => result?.predicted_status !== "PREDICTED_POSITIVE",
  );

  return (
    <div className={compact ? "mt-5" : "mt-3"}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-bold text-slate-800">주요 양성 결과</h4>
        {positiveResults.length > 0 ? (
          <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-semibold text-[#3446B8]">
            {positiveResults.length}개
          </span>
        ) : null}
      </div>
      {positiveResults.length > 0 ? (
        <div className={`mt-2 grid gap-2 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
          {positiveResults.map(({ target, result }) => (
            <article
              key={target.symbol}
              className="rounded-xl border border-[#EBD8DD] bg-[#FCF6F7] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h5 className="text-sm font-bold text-[#783A4B]">{target.label}</h5>
                <span className="rounded-full bg-[#F5E6E9] px-2 py-1 text-[11px] font-bold text-[#874557] ring-1 ring-inset ring-[#E9CDD4]">
                  Positive
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Probability <span className="font-semibold text-slate-700">{percent(result?.predicted_probability)}</span>
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-lg bg-[#F8F9FC] px-3 py-2 text-xs text-slate-500">
          주요 양성 유전자 없음
        </p>
      )}

      <div className="mt-4">
        <h4 className="text-xs font-semibold text-slate-600">기타 유전자 결과</h4>
        {otherResults.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {otherResults.map(({ target, result }) => (
              <span
                key={target.symbol}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7F0] bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600"
              >
                <span className="font-semibold text-slate-700">{target.label}</span>
                <span>{geneStatus(result?.predicted_status)}</span>
                {result?.predicted_probability !== null && result?.predicted_probability !== undefined ? (
                  <span className="text-slate-400">· {percent(result.predicted_probability)}</span>
                ) : null}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-slate-400">기타 유전자 결과 없음</p>
        )}
      </div>
    </div>
  );
}

function AnalysisProgress({
  status,
  label,
}: {
  status: string | undefined;
  label?: string;
}) {
  if (status !== "PENDING" && status !== "RUNNING") {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border-l-2 border-[#3446B8] bg-[#F1F3FF] px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#DDE2F7] border-t-[#3446B8]" aria-hidden="true" />
        <p className="text-xs font-semibold text-[#3446B8]">{label ?? (status === "PENDING" ? "분석 요청을 준비하고 있습니다" : "AI 분석을 진행하고 있습니다")}</p>
      </div>
      <p className="mt-2 text-xs text-slate-500">AI 분석이 완료될 때까지 잠시만 기다려 주세요.</p>
    </div>
  );
}

function diagnosticReviewDisplayStatus(status: string | null | undefined) {
  if (status === "PENDING") return "의사 검토 대기";
  if (status === "IN_PROGRESS") return "의사 검토 중";
  return "분석 결과를 호흡기내과 의사에게 제출합니다.";
}

function AnalysisStatus({
  status,
}: {
  status: string | undefined;
}) {
  if (status === "SUCCEEDED") {
    return (
      <span className="inline-flex rounded-md bg-[#F1F3FF] px-2 py-1 text-[11px] font-semibold text-[#3446B8]">
        분석 완료
      </span>
    );
  }

  if (status === "FAILED") {
    return (
      <span className="inline-flex bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
        분석 실패
      </span>
    );
  }

  if (status === "CANCELLED") {
    return (
      <span className="inline-flex bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
        분석 취소됨
      </span>
    );
  }

  if (status === "PENDING" || status === "RUNNING") {
    return (
      <span className="inline-flex bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
        분석 진행 중
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
      분석 전
    </span>
  );
}

function PatientSummary({
  item,
}: {
  item: PathologyWorkstationItem;
}) {
  const summaryRows = [
    ["환자코드", item.patient.patient_code],
    [
      "성별 / 생년월일",
      `${formatPatientSex(item.patient.sex)} / ${item.patient.birth_date || "-"}`,
    ],
    ["Case Code", item.case.case_code || "-"],
    ["현재 검사", item.order_type_label ?? "-"],
    ["현재 상태", workflowDisplayStatus(item)],
    ["의뢰 의사", item.requesting_doctor?.name ?? "-"],
  ];

  return (
    <section
      aria-labelledby="pathology-selected-patient-heading"
      className="min-h-0 overflow-y-auto bg-gradient-to-b from-violet-50/50 to-blue-50/30 p-4"
    >
      <div className="flex items-center gap-3 rounded-t-2xl border border-violet-100 bg-gradient-to-r from-white to-violet-50/70 px-5 py-4 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">선택 환자</p>
          <div className="mt-1 flex min-w-0 items-baseline gap-2">
            <h2 id="pathology-selected-patient-heading" className="truncate text-lg font-bold text-slate-900">{item.patient.name}</h2>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{item.patient.patient_code}</span>
          </div>
        </div>
      </div>

      <dl className="grid gap-x-4 gap-y-3 border-x border-violet-100 bg-white px-5 py-4 text-xs sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {summaryRows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] text-slate-400">{label}</dt>
            <dd className="mt-1 break-words font-medium text-slate-800">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function subscribeToUserSessionStorage() {
  return () => undefined;
}

function getPathologyStaffName() {
  try {
    const user = JSON.parse(sessionStorage.getItem("user") ?? "null") as { name?: string; username?: string } | null;
    return user?.name || user?.username || "-";
  } catch {
    return "-";
  }
}

function SelectedCaseOverview({
  workflow,
  item,
  staffName,
}: {
  workflow: PathologyCaseWorkflow;
  item: PathologyWorkstationItem | null;
  staffName: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-violet-100 bg-white px-5 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6674B8]">
            선택 환자 병리검사
          </p>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
            <h1 className="truncate text-lg font-bold text-slate-900">{workflow.patient.name}</h1>
            <span className="shrink-0 text-xs font-medium text-slate-500">{workflow.patient.patient_code}</span>
          </div>
          <p className="mt-1 text-xs font-medium leading-4 text-slate-500">
            <span>{formatPatientSex(workflow.patient.sex)}</span>
            <span className="mx-1.5 text-slate-400">·</span>
            <span>{workflow.patient.birth_date || "-"}</span>
            <span className="mx-1.5 text-slate-400">·</span>
            <span>{workflow.case.case_code || "-"}</span>
          </p>
        </div>
        <dl className="flex shrink-0 items-center gap-x-3 text-xs">
          <div>
            <dt className="text-[11px] text-slate-400">담당자</dt>
            <dd className="mt-1 font-semibold text-slate-800">{staffName || "-"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-slate-400">의뢰 의사</dt>
            <dd className="mt-1 font-semibold text-slate-800">{item?.requesting_doctor?.name ?? "-"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function PathologyWsiPreview({ wsiId, alt = "H&E 원본 조직영상 미리보기" }: { wsiId: string; alt?: string }) {
  const [previewState, setPreviewState] = useState<{
    wsiId: string;
    previewUrl: string | null;
    error: string;
    unavailable: boolean;
    loading: boolean;
  }>({ wsiId, previewUrl: null, error: "", unavailable: false, loading: true });
  const isCurrentWsi = previewState.wsiId === wsiId;
  const previewUrl = isCurrentWsi ? previewState.previewUrl : null;
  const previewError = isCurrentWsi ? previewState.error : "";
  const loading = !isCurrentWsi || previewState.loading;

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetchPathologyWsiPreview(wsiId, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          if (!blob) {
            setPreviewState({ wsiId, previewUrl: null, error: "", unavailable: true, loading: false });
            return;
          }
          objectUrl = URL.createObjectURL(blob);
          setPreviewState({ wsiId, previewUrl: objectUrl, error: "", unavailable: false, loading: false });
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : "알 수 없는 미리보기 오류";
        console.error(`[PathologyWsiPreview] WSI ${wsiId} preview failed: ${message}`, reason);
        setPreviewState({ wsiId, previewUrl: null, error: message, unavailable: false, loading: false });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [wsiId]);

  return (
    <>
      {previewUrl ? (
        <Image
          src={previewUrl}
          alt={alt}
          fill
          unoptimized
          sizes="100vw"
          className="object-contain"
          onError={() => {
            const message = "미리보기 이미지를 표시하지 못했습니다.";
            console.error(`[PathologyWsiPreview] WSI ${wsiId} image decode failed`);
            setPreviewState({ wsiId, previewUrl: null, error: message, unavailable: false, loading: false });
          }}
        />
      ) : null}
      {loading ? <p role="status" className="absolute inset-0 z-10 grid place-items-center bg-slate-950/70 text-sm text-slate-200">미리보기 불러오는 중...</p> : null}
      {previewState.unavailable && isCurrentWsi ? <p role="status" className="absolute inset-0 z-10 grid place-items-center text-xs text-slate-400">미리보기 준비 중</p> : null}
      {previewError ? <p role="status" className="absolute inset-0 z-10 grid place-items-center px-4 text-center text-xs text-slate-400">미리보기 준비 중</p> : null}
    </>
  );
}

function PathologyTissueHeatmap({
  wsiId,
  analysisId,
  emptyMessage = "AI Heatmap을 사용할 수 없습니다.",
}: {
  wsiId: string;
  analysisId?: string;
  emptyMessage?: string;
}) {
  const [heatmap, setHeatmap] = useState({
    wsiId,
    imageUrl: null as string | null,
    loaded: false,
  });

  const isCurrentWsi = heatmap.wsiId === wsiId;
  const imageUrl = isCurrentWsi ? heatmap.imageUrl : null;
  const loading = !isCurrentWsi || !heatmap.loaded;

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;

    void fetchPathologyWsiTissueHeatmap(wsiId, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted && blob?.size) {
          objectUrl = URL.createObjectURL(blob);
          setHeatmap({
            wsiId,
            imageUrl: objectUrl,
            loaded: true,
          });
        } else if (!controller.signal.aborted) {
          setHeatmap({
            wsiId,
            imageUrl: null,
            loaded: true,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHeatmap({
            wsiId,
            imageUrl: null,
            loaded: true,
          });
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [analysisId, wsiId]);

  return (
    <div className="relative flex h-full min-h-[320px] w-full flex-1 items-center justify-center overflow-hidden p-0 text-center text-sm text-slate-500">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt="Tissue CLAM attention heatmap"
          fill
          unoptimized
          sizes="100vw"
          className="h-full w-full object-contain"
        />
      ) : (
        loading ? "AI Heatmap 불러오는 중입니다." : emptyMessage
      )}
    </div>
  );
}


function Pdl1AnalysisResults({
  result,
  analysis,
  modelRevision,
}: {
  result: NonNullable<NonNullable<PathologyAiAnalysis["result_detail"]>["pdl1"]>;
  analysis: PathologyAiAnalysis;
  modelRevision: string;
}) {
  const probabilityEntries = [
    { key: "class_0", label: "Class 0", rangeLabel: "PD-L1 발현 구간 · TPS < 1%", value: result.probabilities.class_0 },
    { key: "class_1", label: "Class 1", rangeLabel: "PD-L1 발현 구간 · TPS 1–49%", value: result.probabilities.class_1 },
    { key: "class_2", label: "Class 2", rangeLabel: "PD-L1 발현 구간 · TPS ≥ 50%", value: result.probabilities.class_2 },
  ];
  const comparableValues = probabilityEntries.map(({ value }) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return null;
    return numericValue >= 0 && numericValue <= 1 ? numericValue * 100 : numericValue;
  });
  const maximumProbability = Math.max(...comparableValues.filter((value): value is number => value !== null));
  const highestProbabilityIndexes = new Set(
    comparableValues.flatMap((value, index) => value === maximumProbability ? [index] : []),
  );

  return (
    <div className="mt-4 space-y-5">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[#C9D0F2] bg-[#F1F3FF] px-4 py-4">
          <dt className="text-xs font-semibold text-[#5364C7]">TPS 예측 구간</dt>
          <dd className="mt-2 text-2xl font-bold tracking-tight text-[#29366F]">
            {result.predicted_tps_range_label ?? "-"}
          </dd>
        </div>
        <div className="rounded-xl border border-[#DDE2F7] bg-white px-4 py-4">
          <dt className="text-xs font-semibold text-slate-500">Confidence</dt>
          <dd className="mt-2 text-2xl font-bold tracking-tight text-slate-800">
            {percent(result.confidence)}
          </dd>
        </div>
      </dl>

      <section>
        <h4 className="text-xs font-semibold text-slate-700">Class별 확률</h4>
        <dl className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
          {probabilityEntries.map(({ key, label, rangeLabel, value }, index) => {
            const isHighest = highestProbabilityIndexes.has(index);
            return (
              <div
                key={key}
                className={`rounded-lg border px-3 py-3 ${isHighest ? "border-[#AEB8EB] bg-[#F1F3FF]" : "border-slate-200 bg-white"}`}
              >
                <dt className={`text-xs ${isHighest ? "font-semibold text-[#5364C7]" : "text-slate-500"}`}>
                  {label}
                </dt>
                <p className="mt-0.5 text-[10px] font-normal leading-4 text-slate-400">{rangeLabel}</p>
                <dd className={`mt-1.5 text-base ${isHighest ? "font-bold text-[#3446B8]" : "font-medium text-slate-700"}`}>
                  {percent(value)}
                </dd>
                {isHighest ? <p className="mt-1 text-[10px] font-medium text-[#5364C7]">최고 확률</p> : null}
              </div>
            );
          })}
        </dl>
      </section>

      <section className="border-t border-slate-100 pt-3">
        <h4 className="text-[11px] font-semibold text-slate-500">모델 정보</h4>
        <dl className="mt-2 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-slate-400">모델명</dt>
            <dd className="mt-0.5 break-all font-medium text-slate-700">{analysis.model_name || "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">모델 버전</dt>
            <dd className="mt-0.5 break-all font-medium text-slate-700">{analysis.model_version_name || "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-400">실행 revision</dt>
            <dd className="mt-0.5 break-all font-medium text-slate-700">{modelRevision || "-"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function CompletedRecordsSkeleton() {
  return (
    <section role="status" aria-label="완료 기록 로딩 중" aria-busy="true" className="space-y-4">
      <span className="sr-only">완료 기록 로딩 중</span>
      {Array.from({ length: 5 }, (_, index) => (
        <article key={index} aria-hidden="true" className="overflow-hidden rounded-xl border border-[#DDE2F7] bg-white">
          <header className="border-b border-[#E2E5F2] bg-[#FBFBFF] px-5 py-4"><div className="h-4 w-28 rounded bg-slate-100 motion-safe:animate-pulse" /><div className="mt-2 h-3 w-40 rounded bg-slate-50 motion-safe:animate-pulse" /></header>
          <div className="divide-y divide-[#E2E5F2]">{[0, 1].map(row => <div key={row} className="flex items-center gap-3 px-5 py-4"><div className="h-4 w-4 rounded bg-slate-100 motion-safe:animate-pulse" /><div className="h-4 w-36 rounded bg-slate-100 motion-safe:animate-pulse" /><div className="ml-auto h-5 w-16 rounded bg-slate-50 motion-safe:animate-pulse" /></div>)}</div>
          <div className="grid gap-5 border-t border-[#EEF0F8] px-5 py-4 lg:grid-cols-[180px_minmax(0,1fr)]"><div className="h-32 rounded-lg border border-slate-100 bg-slate-50 motion-safe:animate-pulse" /><div className="grid content-start gap-4 sm:grid-cols-3">{Array.from({ length: 6 }, (_, cell) => <div key={cell}><div className="h-3 w-14 rounded bg-slate-50 motion-safe:animate-pulse" /><div className="mt-2 h-4 w-24 rounded bg-slate-100 motion-safe:animate-pulse" /></div>)}</div></div>
        </article>
      ))}
    </section>
  );
}

function PathologyCompletedHistory() {
  const [histories, setHistories] = useState<PathologyCompletedExamHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetchPathologyCompletedExams(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setHistories(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "완료 기록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) return <CompletedRecordsSkeleton />;
  if (error) return <StateMessage variant="error" title={error} />;
  if (histories.length === 0) return <StateMessage variant="empty" title="완료된 병리 검사가 없습니다." />;

  return (
    <section className="space-y-4" aria-label="병리 완료 기록">
      {histories.map((history) => (
        <article key={history.case.id} className="overflow-hidden rounded-xl border border-[#DDE2F7] bg-white">
          <header className="border-b border-[#E2E5F2] bg-[#FBFBFF] px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">{history.patient.name}</h2>
            <p className="mt-1 text-xs text-slate-500">{history.patient.patient_code} · {history.case.case_code}</p>
          </header>
          <div className="divide-y divide-[#E2E5F2]">
            {history.completed_exams.map((item) => {
              const analysis = item.order_type === "PATHOLOGY_GENE" ? item.latest_gene_analysis : item.latest_ai_analysis;
              const pathology = analysis?.result_detail?.pathology;
              const pdl1 = analysis?.result_detail?.pdl1;
              const geneStatusValue = pathologyGeneStatus(analysis?.result_detail?.result_payload);
              const isLuad = pathology?.predicted_subtype === "LUAD" || pathology?.predicted_histologic_type === "LUAD";
              const isGeneNotApplicable = geneStatusValue === "NOT_APPLICABLE_NON_LUAD" || !isLuad;
              return (
                <details key={item.examination_order?.id ?? item.id} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-sm hover:bg-[#FBFBFF]">
                    <span className="text-[#5364C7] transition group-open:rotate-90">›</span>
                    <span className="font-semibold text-slate-800">{item.order_type_label ?? item.current_exam_or_task}</span>
                    <span className="ml-auto rounded-sm bg-emerald-100/80 px-1.5 py-0.5 text-xs font-semibold text-black">진행 완료</span>
                    <span className="text-xs text-slate-500">{item.completed_at ? new Date(item.completed_at).toLocaleDateString("ko-KR") : "완료일 정보 없음"}</span>
                  </summary>
                  <div className="grid gap-5 border-t border-[#EEF0F8] px-5 py-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-lg border border-[#E2E5F2] bg-[#F7F8FC] text-xs text-slate-400">
                      {item.latest_wsi ? <PathologyWsiPreview wsiId={item.latest_wsi.id} /> : null}
                      {!item.latest_wsi ? <span>대표 영상 미리보기</span> : null}
                    </div>
                    <div className="space-y-4 text-sm">
                      <dl className="grid gap-3 text-xs sm:grid-cols-3">
                        {[
                          ["검사", item.order_type_label ?? "-"],
                          ["검체", item.specimen?.specimen_code ?? "-"],
                          ["파일", item.latest_wsi?.original_filename ?? "-"],
                          ["제출 상태", item.diagnostic_review?.status ?? "-"],
                          ["확정 완료", item.diagnostic_review?.completed_at ? new Date(item.diagnostic_review.completed_at).toLocaleDateString("ko-KR") : "-"],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-slate-400">{label}</dt>
                            <dd className="mt-1 break-words font-medium text-slate-800">{value}</dd>
                          </div>
                        ))}
                      </dl>
                      {item.order_type === "PATHOLOGY_GENE" ? (
                        <div className="space-y-3 border-t border-[#EEF0F8] pt-3">
                          <p className="text-xs font-semibold text-[#5364C7]">저장된 조직·유전자 분석 결과</p>
                          <dl className="grid gap-3 text-xs sm:grid-cols-3">
                            <div><dt className="text-slate-400">예측 아형</dt><dd className="mt-1 font-medium text-slate-800">{pathology?.predicted_subtype ?? pathology?.predicted_histologic_type ?? "-"}</dd></div>
                            <div><dt className="text-slate-400">아형 확률</dt><dd className="mt-1 font-medium text-slate-800">{percent(pathology?.subtype_confidence)}</dd></div>
                            <div><dt className="text-slate-400">유전자 분석</dt><dd className="mt-1 font-medium text-slate-800">{isGeneNotApplicable ? "유전자 분석 비대상 (NOT_APPLICABLE_NON_LUAD)" : "저장된 예측 결과"}</dd></div>
                          </dl>
                          {!isGeneNotApplicable && analysis?.result_detail?.genes?.length ? (
                            <div className="flex flex-wrap gap-2">
                              {analysis.result_detail.genes.map((gene) => <span key={gene.gene_symbol} className="bg-[#F1F3FF] px-2 py-1 text-xs text-slate-700">{gene.gene_symbol} · {gene.predicted_status_label}</span>)}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="border-t border-[#EEF0F8] pt-3">
                          <p className="text-xs font-semibold text-[#5364C7]">저장된 PD-L1 분석 결과</p>
                          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                            <div><dt className="text-slate-400">TPS 예측 구간</dt><dd className="mt-1 font-medium text-slate-800">{pdl1?.predicted_tps_range_label ?? "-"}</dd></div>
                            <div><dt className="text-slate-400">Confidence</dt><dd className="mt-1 font-medium text-slate-800">{percent(pdl1?.confidence)}</dd></div>
                            <div><dt className="text-slate-400">ROI annotation</dt><dd className="mt-1 font-medium text-slate-800">{item.latest_wsi?.pdl1_input_ready ? "등록됨" : "-"}</dd></div>
                          </dl>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </article>
      ))}
    </section>
  );
}

function hasPathologyGeneResult(analysis: PathologyAiAnalysis | null | undefined) {
  const detail = analysis?.result_detail;
  return Boolean(
    analysis?.status === "SUCCEEDED" &&
      detail?.pathology &&
      detail.result_payload &&
      typeof detail.result_payload === "object",
  );
}

function WorkArea({
  item,
  sectionNumber,
  onGeneWsiUploaded,
  onPdl1WsiUploaded,
  onGeneAnalysisCompleted,
}: {
  item: PathologyWorkstationItem;
  sectionNumber: number;
  onGeneWsiUploaded: () => void;
  onPdl1WsiUploaded: () => void;
  onGeneAnalysisCompleted: () => void;
}) {
  const [pdl1Analyses, setPdl1Analyses] = useState<
    PathologyAiAnalysis[]
  >(
    item.order_type === "PDL1" && item.latest_ai_analysis
      ? [item.latest_ai_analysis]
      : [],
  );

  const [pdl1WsiFile, setPdl1WsiFile] = useState<File | null>(null);
  const [pdl1AnnotationFile, setPdl1AnnotationFile] = useState<File | null>(null);
  const [pdl1RoiLayer, setPdl1RoiLayer] = useState<"Tumor" | "Tumor-JS">("Tumor");
  const [pdl1InputReady, setPdl1InputReady] = useState(Boolean(item.latest_wsi?.pdl1_input_ready));
  const [uploadingPdl1Input, setUploadingPdl1Input] = useState(false);
  const [pathologyGeneWsiFile, setPathologyGeneWsiFile] = useState<File | null>(null);
  const [uploadingPathologyGeneWsi, setUploadingPathologyGeneWsi] = useState(false);
  const [uploadDragTarget, setUploadDragTarget] = useState<"gene" | "pdl1-wsi" | "pdl1-annotation" | null>(null);
  const pathologyGeneWsiInputRef = useRef<HTMLInputElement | null>(null);
  const pdl1WsiInputRef = useRef<HTMLInputElement | null>(null);
  const pdl1AnnotationInputRef = useRef<HTMLInputElement | null>(null);
  const [pathologyGeneWsiId, setPathologyGeneWsiId] = useState<string | null>(
    item.order_type === "PATHOLOGY_GENE" &&
    item.latest_wsi?.stain === "HE" &&
    item.latest_wsi.image_status === "READY"
      ? item.latest_wsi.id
      : null,
  );
  const [pathologyGeneAnalysis, setPathologyGeneAnalysis] = useState<PathologyAiAnalysis | null>(
    item.order_type === "PATHOLOGY_GENE" ? item.latest_gene_analysis : null,
  );
  const [successfulPathologyGeneAnalysis, setSuccessfulPathologyGeneAnalysis] = useState<PathologyAiAnalysis | null>(
    item.order_type === "PATHOLOGY_GENE" && hasPathologyGeneResult(item.latest_gene_analysis)
      ? item.latest_gene_analysis
      : null,
  );
  const [runningPathologyGene, setRunningPathologyGene] = useState(false);
  const [runningPdl1, setRunningPdl1] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pathologyGeneResultAnalysis = successfulPathologyGeneAnalysis ??
    (hasPathologyGeneResult(pathologyGeneAnalysis) ? pathologyGeneAnalysis : null);
  const pathology = item.order_type === "PATHOLOGY_GENE"
    ? pathologyGeneResultAnalysis ?? pathologyGeneAnalysis
    : null;
  const pdl1 = pdl1Analyses[0] ?? null;
  const pdl1Status = runningPdl1 ? "RUNNING" : pdl1?.status;
  const pdl1AnalysisId = pdl1?.id;
  const pdl1AnalysisStatus = pdl1?.status;
  const pdl1TerminalToastRef = useRef<{ id: string | undefined; status: string | undefined }>({ id: pdl1AnalysisId, status: pdl1AnalysisStatus });
  const pdl1TerminalToastIdsRef = useRef(new Set<string>());
  const pathologyResult = pathology?.result_detail?.pathology;
  const pdl1Result = pdl1?.result_detail?.pdl1;
  const pdl1AnalysisCompleted = pdl1?.status === "SUCCEEDED" && Boolean(pdl1Result);
  const pdl1ModelRevision = resultPayloadText(
    pdl1?.result_detail?.result_payload,
    "model_revision",
  );
  const geneResults = useMemo(
    () => pathology?.result_detail?.genes ?? [],
    [pathology],
  );
  const pathologyGeneResultStatus = pathologyGeneStatus(
    pathology?.result_detail?.result_payload,
  );

  const pathologyGeneIsLuad =
    pathologyResult?.predicted_subtype === "LUAD" ||
    pathologyResult?.predicted_histologic_type === "LUAD";
  const pathologyGeneNotApplicable =
    pathologyGeneResultStatus === "NOT_APPLICABLE_NON_LUAD" || !pathologyGeneIsLuad;

  useEffect(() => {
    if (
      item.order_type !== "PDL1" ||
      !pdl1AnalysisId ||
      (pdl1AnalysisStatus !== "PENDING" && pdl1AnalysisStatus !== "RUNNING")
    ) return;
    let cancelled = false;
    const refresh = () => fetchPdl1Analyses(item.case_id)
      .then((analyses) => { if (!cancelled) setPdl1Analyses(analyses); })
      .catch(() => undefined);
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [item.case_id, item.order_type, pdl1AnalysisId, pdl1AnalysisStatus]);

  const pathologyGeneAnalysisId = pathologyGeneAnalysis?.id;
  const pathologyGeneAnalysisStatus = pathologyGeneAnalysis?.status;

  const pathologyGeneTerminalToastRef = useRef<{ id: string | undefined; status: string | undefined }>({ id: pathologyGeneAnalysisId, status: pathologyGeneAnalysisStatus });
  const pathologyGeneTerminalToastIdsRef = useRef(new Set<string>());
  const pathologyGeneWorkflowRefreshIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const previous = pdl1TerminalToastRef.current;
    if (previous.id === pdl1AnalysisId && pdl1AnalysisId && (previous.status === "PENDING" || previous.status === "RUNNING")) {
      if (pdl1AnalysisStatus === "SUCCEEDED" && !pdl1TerminalToastIdsRef.current.has(pdl1AnalysisId)) {
        pdl1TerminalToastIdsRef.current.add(pdl1AnalysisId);
        showToast.success("AI 분석이 완료되었습니다.");
      }
      if (pdl1AnalysisStatus === "FAILED" && !pdl1TerminalToastIdsRef.current.has(pdl1AnalysisId)) {
        pdl1TerminalToastIdsRef.current.add(pdl1AnalysisId);
        showToast.error("AI 분석에 실패했습니다.");
      }
    }
    pdl1TerminalToastRef.current = { id: pdl1AnalysisId, status: pdl1AnalysisStatus };
  }, [pdl1AnalysisId, pdl1AnalysisStatus]);

  useEffect(() => {
    const previous = pathologyGeneTerminalToastRef.current;
    if (previous.id === pathologyGeneAnalysisId && pathologyGeneAnalysisId && (previous.status === "PENDING" || previous.status === "RUNNING")) {
      if (pathologyGeneAnalysisStatus === "SUCCEEDED" && !pathologyGeneTerminalToastIdsRef.current.has(pathologyGeneAnalysisId)) {
        pathologyGeneTerminalToastIdsRef.current.add(pathologyGeneAnalysisId);
        showToast.success("AI 분석이 완료되었습니다.");
      }
      if (pathologyGeneAnalysisStatus === "FAILED" && !pathologyGeneTerminalToastIdsRef.current.has(pathologyGeneAnalysisId)) {
        pathologyGeneTerminalToastIdsRef.current.add(pathologyGeneAnalysisId);
        showToast.error("AI 분석에 실패했습니다.");
      }
    }
    pathologyGeneTerminalToastRef.current = { id: pathologyGeneAnalysisId, status: pathologyGeneAnalysisStatus };
  }, [pathologyGeneAnalysisId, pathologyGeneAnalysisStatus]);

  useEffect(() => {
    if (
      item.order_type !== "PATHOLOGY_GENE" ||
      !pathologyGeneAnalysisId
    ) return;
    const isRunning = pathologyGeneAnalysisStatus === "PENDING" ||
      pathologyGeneAnalysisStatus === "RUNNING";
    let cancelled = false;
    const refresh = () => fetchPathologyGeneAnalyses(item.case_id)
      .then((analyses) => {
        const analysis = analyses.find((entry) => entry.id === pathologyGeneAnalysisId);
        if (cancelled) return;
        if (analysis) setPathologyGeneAnalysis(analysis);
        const latestSuccessful = analyses.find(hasPathologyGeneResult);
        if (latestSuccessful) setSuccessfulPathologyGeneAnalysis(latestSuccessful);
        if (
          analysis &&
          hasPathologyGeneResult(analysis) &&
          !pathologyGeneWorkflowRefreshIdsRef.current.has(analysis.id)
        ) {
          pathologyGeneWorkflowRefreshIdsRef.current.add(analysis.id);
          onGeneAnalysisCompleted();
        }
      })
      .catch(() => undefined);
    void refresh();
    const timer = isRunning ? window.setInterval(() => { void refresh(); }, 3000) : null;
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [item.case_id, item.order_type, onGeneAnalysisCompleted, pathologyGeneAnalysisId, pathologyGeneAnalysisStatus]);

  async function handlePdl1Run() {
    if (!pdl1InputReady || runningPdl1 || pdl1AnalysisCompleted || pdl1?.status === "PENDING" || pdl1?.status === "RUNNING") return;

    setRunningPdl1(true);
    setError("");
    setMessage("");

    try {
      const result = await runPdl1Analysis(item.case_id);
      setPdl1Analyses((current) => [result, ...current]);
      showToast.info("AI 분석을 시작했습니다.");
    } catch (reason) {
      console.error(reason);
      showToast.error("AI 분석을 시작하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setRunningPdl1(false);
    }
  }

  async function handlePdl1Upload() {
    if (!item.examination_order?.id || !pdl1WsiFile || !pdl1AnnotationFile) return;
    setUploadingPdl1Input(true);
    setError("");
    try {
      const result = await uploadPdl1Input(item.examination_order.id, pdl1WsiFile, pdl1AnnotationFile, pdl1RoiLayer);
      setPdl1InputReady(result.upload_ready);
      onPdl1WsiUploaded();
      showToast.success("PD-L1 파일 업로드가 완료되었습니다.");
    } catch (reason) {
      console.error(reason);
      showToast.error("PD-L1 파일 업로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setUploadingPdl1Input(false);
    }
  }

  async function handlePathologyGeneWsiUpload() {
    const orderId = item.examination_order?.id;
    if (item.order_type !== "PATHOLOGY_GENE" || !orderId || !pathologyGeneWsiFile) return;
    setUploadingPathologyGeneWsi(true);
    setError("");
    try {
      const result = await uploadPathologyGeneInput(orderId, pathologyGeneWsiFile);
      setPathologyGeneWsiId(result.wsi_id);
      onGeneWsiUploaded();
      showToast.success("WSI 업로드가 완료되었습니다.");
    } catch (reason) {
      console.error(reason);
      showToast.error("WSI 업로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setUploadingPathologyGeneWsi(false);
    }
  }

  function handleGeneWsiSelection(file: File | null) {
    setPathologyGeneWsiFile(file);
    setError("");
  }

  function handlePdl1WsiSelection(file: File | null) {
    setPdl1WsiFile(file);
  }

  function handlePdl1AnnotationSelection(file: File | null) {
    setPdl1AnnotationFile(file);
  }

  function handleUploadDrop(
    event: DragEvent<HTMLDivElement>,
    onFile: (file: File | null) => void,
  ) {
    event.preventDefault();
    setUploadDragTarget(null);
    onFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function handlePathologyGeneRun() {
    if (
      !pathologyGeneWsiId ||
      runningPathologyGene ||
      pathologyGeneAnalysis?.status === "PENDING" ||
      pathologyGeneAnalysis?.status === "RUNNING"
    ) return;
    setRunningPathologyGene(true);
    setError("");
    setMessage("");
    try {
      const result = await runPathologyGeneAnalysis(item.case_id, pathologyGeneWsiId);
      setPathologyGeneAnalysis(result);
      showToast.info("AI 분석을 시작했습니다.");
    } catch (reason) {
      console.error(reason);
      showToast.error("AI 분석을 시작하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setRunningPathologyGene(false);
    }
  }

  const currentTestType = item.order_type;
  const isPathologyGene = currentTestType === "PATHOLOGY_GENE";
  const isPdl1 = currentTestType === "PDL1";
  const isKnownTestType = isPathologyGene || isPdl1;
  const pathologyGeneWsiReady = Boolean(pathologyGeneWsiId);
  const pathologyGeneAnalysisRunning =
    runningPathologyGene ||
    pathologyGeneAnalysisStatus === "PENDING" ||
    pathologyGeneAnalysisStatus === "RUNNING";
  const canViewPathologyGeneResult = Boolean(pathologyGeneResultAnalysis);
  const canRunPathologyGene = pathologyGeneWsiReady &&
    !pathologyGeneAnalysisRunning &&
    (canViewPathologyGeneResult ||
      !pathologyGeneAnalysis ||
      pathologyGeneAnalysis.status === "FAILED" ||
      pathologyGeneAnalysis.status === "CANCELLED");
  const pathologyGeneWsiFilename = pathologyGeneWsiReady
    ? pathologyGeneWsiFile?.name ?? item.latest_wsi?.original_filename ?? null
    : null;
  const currentAnalysis = isPathologyGene
    ? pathologyGeneResultAnalysis ?? pathologyGeneAnalysis
    : isPdl1
      ? pdl1
      : null;
  const expectedAnalysisType = isPathologyGene
    ? "PATHOLOGY_GENE_ANALYSIS"
    : isPdl1
      ? "PDL1_ANALYSIS"
      : null;
  const alreadySubmitted =
    reviewSubmitted ||
    item.diagnostic_review_status === "PENDING" ||
    item.diagnostic_review_status === "IN_PROGRESS";
  const canSubmitForReview =
    currentAnalysis?.status === "SUCCEEDED" &&
    currentAnalysis.analysis_type === expectedAnalysisType &&
    item.workflow_status !== "REVIEW_COMPLETED" &&
    !alreadySubmitted &&
    !submittingReview;
  const testTitle = isPathologyGene
    ? "조직·유전자 검사"
    : isPdl1
      ? "PD-L1 검사"
      : "검사 종류 미확인";
  const workflowSteps = [
    {
      label: "조직데이터",
      completed: Boolean(item.latest_wsi),
    },
    {
      label: "AI 분석",
      completed: Boolean(currentAnalysis),
    },
    {
      label: "AI 분석 결과",
      completed: currentAnalysis?.status === "SUCCEEDED",
    },
    {
      label: "의사에게 제출",
      completed:
        alreadySubmitted || item.workflow_status === "REVIEW_COMPLETED",
    },
  ];
  const activeWorkflowStepIndex = workflowSteps.findIndex((step) => !step.completed);
  const indicatorWorkflowStepIndex =
    activeWorkflowStepIndex >= 0
      ? activeWorkflowStepIndex
      : alreadySubmitted || item.workflow_status === "REVIEW_COMPLETED"
        ? workflowSteps.length - 1
        : -1;

  async function handleSubmitForReview() {
    if (!canSubmitForReview || !currentAnalysis) return;

    setSubmittingReview(true);
    try {
      await submitPathologyForReview(
        item.case_id,
        item.id,
        currentAnalysis.id,
      );
      setReviewSubmitted(true);
      showToast.success("병리 검사 결과를 제출했습니다.");
    } catch (reason) {
      console.error(reason);
      showToast.error("병리 검사 결과 제출에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmittingReview(false);
    }
  }

  return (
    <section className="overflow-hidden border-b border-[#E2E5F2] bg-white last:border-b-0">
      <header className="relative flex flex-wrap items-start justify-between gap-3 overflow-hidden border-b border-[#DDE2F7] bg-[#F8F8FF] px-5 py-4">
        <div>
          <h2 className="text-lg font-bold leading-6 text-[#6670B8]">
            {String(sectionNumber).padStart(2, "0")} {testTitle}
          </h2>
        </div>
        <span className="rounded-full bg-[#F1EFFB] px-2.5 py-1 text-xs font-semibold text-[#6670B8] ring-1 ring-inset ring-[#D9D6EE]">
          {workflowDisplayStatus(item)}
        </span>
      </header>

      <div className="space-y-4 bg-[#F7F8FF] p-4">
        {isKnownTestType ? (
          <ol
            aria-label={`${testTitle} workflow`}
            className="relative grid grid-cols-4 gap-1 rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50/70 via-white to-blue-50/70 p-2"
          >
            {workflowSteps.map((step, index) => (
              <li
                key={step.label}
                className={`relative flex w-full min-w-0 min-h-[70px] flex-col justify-center overflow-visible rounded-xl border py-3 pl-2 pr-6 transition-colors ${indicatorWorkflowStepIndex === index ? "border-[#7566C4] bg-[#DDD7FA] text-[#43358A] shadow-[0_2px_8px_rgba(91,76,160,0.12)]" : step.completed ? "border-[#C7BFEA] bg-[#F1EEFF] text-[#6252A6]" : "border-slate-100 bg-white/70 text-slate-400"} ${indicatorWorkflowStepIndex === index ? "pr-10" : ""}`}
              >
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    indicatorWorkflowStepIndex === index
                      ? "bg-[#B2A5E5] text-[#43358A]"
                      : step.completed
                        ? "bg-[#DCD5F5] text-[#6252A6]"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                    className={`mt-1 text-xs font-semibold ${
                    indicatorWorkflowStepIndex === index
                      ? "font-bold text-[#43358A]"
                      : step.completed
                        ? "font-semibold text-[#6252A6]"
                        : "font-medium text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
                {indicatorWorkflowStepIndex === index ? (
                  <span
                    className="pointer-events-none absolute -right-2 top-1/2 z-10 h-8 w-8 -translate-y-1/2"
                    role="img"
                    aria-label={`현재 단계: ${step.label}`}
                  >
                    <Image
                      src="/images/borasoomi_face.png"
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 object-contain"
                    />
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        {!isKnownTestType ? (
          <StateMessage
            variant="empty"
            title="현재 오더의 검사 종류를 확인할 수 없습니다."
            className="my-5"
          />
        ) : null}

        {isKnownTestType ? (
        <section className="rounded-xl border border-[#DDE2F7] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold">
            <span className="mr-2 text-xs text-[#3446B8]">
              01
            </span>
            조직데이터
          </h3>

          {item.latest_wsi ? (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3 text-xs sm:grid-cols-5">
                <div>
                  <dt className="text-slate-500">Slide</dt>
                  <dd className="mt-1 font-semibold">
                    {item.latest_wsi.slide_code}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">Stain</dt>
                  <dd className="mt-1 font-semibold">
                    {item.latest_wsi.stain}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">
                    Filename
                  </dt>
                  <dd
                    className="mt-1 truncate font-semibold"
                    title={item.latest_wsi.original_filename}
                  >
                    {item.latest_wsi.original_filename}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">
                    MPP <span className="text-[10px] text-slate-400">(해상도)</span>
                  </dt>
                  <dd className="mt-1 font-semibold">
                    {item.latest_wsi.mpp == null
                      ? "-"
                      : `${item.latest_wsi.mpp} μm/px`}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">상태</dt>
                  <dd className="mt-1 font-semibold">
                    {item.latest_wsi.image_status}
                  </dd>
                </div>
              </dl>

              <div className={`mt-3 grid gap-3 ${isPathologyGene ? "md:grid-cols-2" : "grid-cols-1"}`}>
              <div className="relative flex h-[400px] min-h-[400px] flex-col items-center justify-center rounded-lg border border-[#C7CBE5] bg-slate-950 text-slate-200 shadow-inner">
                <p className="absolute left-3 top-3 z-10 rounded bg-slate-950/75 px-3 py-2 text-xs font-semibold text-white">원본 H&amp;E</p>
                {item.latest_wsi.orthanc_series_id ? <OrthancWsiViewer slide={item.latest_wsi} caseId={item.case_id} fillHeight /> : <PathologyWsiPreview wsiId={item.latest_wsi.id} alt="원본 H&E 조직영상 미리보기" />}
              </div>
              {isPathologyGene ? (
              <section className="flex h-[400px] min-h-[400px] flex-col rounded-lg border border-[#DDE2F7] bg-[#F8F8FF] text-slate-600">
                <p className="border-b border-[#E2E5F2] bg-white px-3 py-2 text-xs font-semibold text-slate-700">AI Heatmap</p>
                <div className="flex min-h-0 flex-1 items-center justify-center p-0 text-center text-sm">
                  {!pathologyGeneResultAnalysis && (pathologyGeneAnalysis?.status === "PENDING" || pathologyGeneAnalysis?.status === "RUNNING") ? (
                    <p>AI 분석 중입니다. 완료 후 Heatmap이 표시됩니다.</p>
                  ) : pathologyGeneResultAnalysis ? (
                    item.latest_wsi && pathologyGeneResultAnalysis.source_image_asset_id === item.latest_wsi.image_asset_id ? (
                      <PathologyTissueHeatmap
                        key={pathologyGeneResultAnalysis.id}
                        wsiId={item.latest_wsi.id}
                        analysisId={pathologyGeneResultAnalysis.id}
                        emptyMessage="분석 결과에 Heatmap 이미지가 포함되어 있지 않습니다."
                      />
                    ) : <p>분석 결과에 Heatmap 이미지가 포함되어 있지 않습니다.</p>
                  ) : pathologyGeneAnalysis?.status === "FAILED" ? (
                    <p>AI 분석 결과를 확인할 수 없습니다.</p>
                  ) : (
                    <p>AI 분석 후 Heatmap이 표시됩니다.</p>
                  )}
                </div>
              </section>
              ) : null}
              </div>
            </>
          ) : (
            <StateMessage
              variant="empty"
              title="조직영상 연결 대기"
              description="검체에 연결된 WSI가 없습니다."
            className="mt-3 min-h-72"
            />
          )}
        </section>
        ) : null}

        {isPathologyGene ? (
          <>
            <section className="rounded-xl border border-[#DDE2F7] bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold">H&amp;E WSI 업로드</h3>
              <div className="mt-3 flex w-full flex-col gap-3">
                {pathologyGeneWsiReady ? (
                  <>
                    <span className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                      H&amp;E WSI 업로드 완료
                    </span>
                    {pathologyGeneWsiFilename ? (
                      <p className="text-xs text-slate-600">{pathologyGeneWsiFilename}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => pathologyGeneWsiInputRef.current?.click()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") pathologyGeneWsiInputRef.current?.click();
                      }}
                      onDragEnter={(event) => { event.preventDefault(); setUploadDragTarget("gene"); }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={(event) => { event.preventDefault(); setUploadDragTarget(null); }}
                      onDrop={(event) => handleUploadDrop(event, handleGeneWsiSelection)}
                      className={`flex min-h-44 w-full cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center shadow-sm transition-colors ${uploadDragTarget === "gene" ? "border-[#3446B8] bg-[#F1F3FF]" : "border-[#C7CBE5] bg-[#FBFBFF] hover:border-[#8B96E8]"} ${uploadingPathologyGeneWsi ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#DDE2F7] bg-white text-2xl font-light leading-none text-[#5364C7] shadow-sm" aria-hidden="true">＋</span>
                      <p className="mt-2 text-sm font-semibold text-slate-700">H&amp;E WSI 추가</p>
                      <p className="mt-1 text-[11px] text-slate-500">클릭하거나 파일을 여기에 끌어다 놓으세요.</p>
                      <input
                        ref={pathologyGeneWsiInputRef}
                        type="file"
                        accept=".svs"
                        disabled={uploadingPathologyGeneWsi}
                        className="sr-only"
                        onChange={(event) => handleGeneWsiSelection(event.target.files?.[0] ?? null)}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <p className="text-slate-500">{pathologyGeneWsiFile ? `선택 파일: ${pathologyGeneWsiFile.name}` : "업로드할 H&E WSI 파일을 선택하세요."}</p>
                      <button
                        type="button"
                        disabled={!pathologyGeneWsiFile || uploadingPathologyGeneWsi || !item.examination_order?.id}
                        onClick={handlePathologyGeneWsiUpload}
                        className="shrink-0 rounded-lg bg-[#3446B8] px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300"
                      >
                        {uploadingPathologyGeneWsi ? "업로드 중..." : "서버에 올리기"}
                      </button>
                    </div>
                  </>
                )}
              </div>
              {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
            </section>
            <section className="rounded-xl border border-[#DDE2F7] bg-white p-4 shadow-sm">
          <div className="flex flex-col items-start gap-3">
            <div>
              <h3 className="text-sm font-bold">
                <span className="mr-2 text-xs text-[#3446B8]">
                  02
                </span>
                통합 AI 분석
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                H&amp;E WSI 업로드 후 아형과 유전자 분석을 함께 실행합니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canRunPathologyGene}
              onClick={handlePathologyGeneRun}
              className={`rounded-md px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300 ${canViewPathologyGeneResult ? "bg-[#C75B63] hover:bg-[#AD4550]" : "bg-[#3446B8] hover:bg-[#29399F]"}`}
            >
              {pathologyGeneAnalysisRunning
                ? canViewPathologyGeneResult ? "재분석 중..." : "분석 중..."
                : canViewPathologyGeneResult ? "재분석" : "분석 실행"}
            </button>
            <AnalysisStatus status={canViewPathologyGeneResult ? "SUCCEEDED" : pathologyGeneAnalysisStatus} />
            </div>
          </div>

          <AnalysisProgress
            status={pathologyGeneAnalysisStatus}
            label={canViewPathologyGeneResult ? "재분석 중..." : undefined}
          />

        </section>
          </>
        ) : null}

        {isPdl1 ? (
          <section className="rounded-xl border border-[#DDE2F7] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold"><span className="mr-2 text-xs text-[#3446B8]">01</span>입력 데이터</h3>
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3">
              <div
                role="button"
                tabIndex={0}
                aria-disabled={pdl1InputReady}
                onClick={() => !pdl1InputReady && pdl1WsiInputRef.current?.click()}
                onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !pdl1InputReady) pdl1WsiInputRef.current?.click(); }}
                onDragEnter={(event) => { event.preventDefault(); if (!pdl1InputReady) setUploadDragTarget("pdl1-wsi"); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { event.preventDefault(); setUploadDragTarget(null); }}
                onDrop={(event) => { if (!pdl1InputReady) handleUploadDrop(event, handlePdl1WsiSelection); }}
                className={`relative flex min-h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center shadow-sm transition-colors ${pdl1InputReady ? "cursor-not-allowed border-slate-200 bg-slate-50" : uploadDragTarget === "pdl1-wsi" ? "border-[#8B96E8] bg-[#F1F3FF]" : pdl1WsiFile ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-[#FBFBFF] hover:border-[#8B96E8]"}`}
              >
                <span className="absolute left-3 right-3 top-3 flex items-center justify-between gap-2 text-left">
                  <span className="text-xs font-semibold text-slate-700">WSI 파일</span>
                  {pdl1InputReady ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">업로드 완료 · 변경 불가</span> : pdl1WsiFile ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">선택 완료</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">미선택</span>}
                </span>
                <span className="flex flex-col items-center gap-1">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#DDE2F7] bg-white text-2xl font-light leading-none text-[#5364C7] shadow-sm" aria-hidden="true">＋</span>
                  <span className="mt-1 text-sm font-semibold text-slate-700">WSI 파일 추가</span>
                  <span className="max-w-full truncate text-xs text-slate-600">{pdl1WsiFile?.name ?? "선택된 파일이 없습니다."}</span>
                </span>
                <p className="mt-2 text-[11px] text-slate-500">클릭하거나 파일을 여기에 끌어다 놓으세요.</p>
                <input ref={pdl1WsiInputRef} type="file" accept=".svs,.tif,.tiff" disabled={uploadingPdl1Input || pdl1InputReady} className="sr-only" onChange={(event) => handlePdl1WsiSelection(event.target.files?.[0] ?? null)} />
              </div>
              <div
                role="button"
                tabIndex={0}
                aria-disabled={pdl1InputReady}
                onClick={() => !pdl1InputReady && pdl1AnnotationInputRef.current?.click()}
                onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !pdl1InputReady) pdl1AnnotationInputRef.current?.click(); }}
                onDragEnter={(event) => { event.preventDefault(); if (!pdl1InputReady) setUploadDragTarget("pdl1-annotation"); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { event.preventDefault(); setUploadDragTarget(null); }}
                onDrop={(event) => { if (!pdl1InputReady) handleUploadDrop(event, handlePdl1AnnotationSelection); }}
                className={`relative flex min-h-44 w-full flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center shadow-sm transition-colors ${pdl1InputReady ? "cursor-not-allowed border-slate-200 bg-slate-50" : uploadDragTarget === "pdl1-annotation" ? "border-[#8B96E8] bg-[#F1F3FF]" : pdl1AnnotationFile ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-[#FBFBFF] hover:border-[#8B96E8]"}`}
              >
                <span className="absolute left-3 right-3 top-3 flex items-center justify-between gap-2 text-left">
                  <span className="text-xs font-semibold text-slate-700">HALO annotation 파일</span>
                  {pdl1InputReady ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">업로드 완료 · 변경 불가</span> : pdl1AnnotationFile ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">선택 완료</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">미선택</span>}
                </span>
                <span className="flex flex-col items-center gap-1">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#DDE2F7] bg-white text-2xl font-light leading-none text-[#5364C7] shadow-sm" aria-hidden="true">＋</span>
                  <span className="mt-1 text-sm font-semibold text-slate-700">HALO annotation 추가</span>
                  <span className="max-w-full truncate text-xs text-slate-600">{pdl1AnnotationFile?.name ?? "선택된 파일이 없습니다."}</span>
                </span>
                <p className="mt-2 text-[11px] text-slate-500">클릭하거나 파일을 여기에 끌어다 놓으세요.</p>
                <input ref={pdl1AnnotationInputRef} type="file" accept=".annotations" disabled={uploadingPdl1Input || pdl1InputReady} className="sr-only" onChange={(event) => handlePdl1AnnotationSelection(event.target.files?.[0] ?? null)} />
              </div>
              <label className="text-xs font-semibold text-slate-700">ROI layer
                <select value={pdl1RoiLayer} disabled={uploadingPdl1Input || pdl1InputReady} onChange={(event) => setPdl1RoiLayer(event.target.value as "Tumor" | "Tumor-JS")} className="mt-2 block rounded border border-slate-300 bg-white px-2 py-1 disabled:bg-slate-100">
                  <option value="Tumor">Tumor</option><option value="Tumor-JS">Tumor-JS</option>
                </select>
                <span className="mt-1 block text-[11px] font-normal text-slate-400">HALO annotation 내부 ROI layer 이름과 일치하는 항목을 선택하세요.</span>
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <p className="text-slate-500">{pdl1InputReady ? "PD-L1 입력 파일이 서버에 등록되었습니다." : pdl1WsiFile || pdl1AnnotationFile ? `선택 파일: ${[pdl1WsiFile?.name, pdl1AnnotationFile?.name].filter(Boolean).join(" · ")}` : "업로드할 WSI와 HALO annotation 파일을 선택하세요."}</p>
                <button type="button" disabled={!pdl1WsiFile || !pdl1AnnotationFile || uploadingPdl1Input || pdl1InputReady} onClick={handlePdl1Upload} className="shrink-0 rounded-lg bg-[#3446B8] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#29399F] disabled:bg-slate-300">
                  {uploadingPdl1Input ? "업로드 중..." : pdl1InputReady ? "업로드 완료" : "서버에 올리기"}
                </button>
              </div>
              {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-[#DDE2F7] bg-white p-3">
              <div><p className="text-xs font-semibold text-slate-700">02 PD-L1 AI 분석</p><p className="mt-1 text-xs text-slate-500">WSI와 HALO annotation이 모두 업로드된 후 실행합니다.</p></div>
              <button type="button" disabled={!pdl1InputReady || runningPdl1 || pdl1?.status === "PENDING" || pdl1?.status === "RUNNING" || pdl1AnalysisCompleted} onClick={handlePdl1Run} className="rounded-lg bg-[#3446B8] px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">{runningPdl1 || pdl1?.status === "PENDING" || pdl1?.status === "RUNNING" ? "분석 중..." : pdl1AnalysisCompleted ? "분석 완료" : "분석 실행"}</button>
            </div>
            <AnalysisProgress status={pdl1Status} /><div className="mt-3"><AnalysisStatus status={pdl1Status} /></div>
            {message ? <p className="mt-3 text-xs text-blue-800">{message}</p> : null}
          </section>
        ) : null}

        {isPathologyGene || currentAnalysis?.status === "SUCCEEDED" ? (
          <section className="rounded-xl border border-[#DDE2F7] bg-white p-4 shadow-sm">
            <div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5364C7]">
                  AI 결과
                </p>
                <h3 className="mt-1 text-sm font-bold text-slate-900">
                  AI 분석 결과
                </h3>
              </div>
            </div>

            {currentAnalysis?.status !== "SUCCEEDED" ? (
              <p className="mt-4 rounded-lg border border-[#E2E5F2] bg-[#F7F8FC] px-4 py-3 text-sm text-slate-500">
                {currentAnalysis?.status === "PENDING" || currentAnalysis?.status === "RUNNING"
                  ? "AI 분석 중입니다."
                  : "AI 분석이 완료되면 결과가 여기에 표시됩니다."}
              </p>
            ) : null}

            {currentAnalysis?.status === "SUCCEEDED" && isPathologyGene && pathologyResult ? (
              <>
                <p className="mt-4 text-xs font-bold text-slate-700">조직 결과</p>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                  {[
                    [
                      "예측 아형",
                      pathologyResult.predicted_subtype ??
                        pathologyResult.predicted_histologic_type ??
                        "-",
                    ],
                    ["아형 신뢰도", percent(pathologyResult.subtype_confidence)],
                    [
                      "악성 판정",
                      pathologyResult.malignancy_assessment_label ?? "-",
                    ],
                    ["악성 확률", percent(pathologyResult.malignancy_probability)],
                  ].map(([label, value], index) => (
                    <div
                      key={label}
                      className="rounded-xl border border-[#E4E7F3] bg-gradient-to-b from-[#F5F6FF] to-white p-3"
                    >
                      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
                      <dd className={`mt-2 text-base ${index === 0 && value === "LUAD" ? "font-bold text-[#A13F57]" : index === 2 ? "font-bold text-[#A13F57]" : "font-semibold text-[#59627F]"}`}>{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}

            {currentAnalysis?.status === "SUCCEEDED" && isPdl1 && pdl1Result ? (
              <Pdl1AnalysisResults result={pdl1Result} analysis={currentAnalysis} modelRevision={pdl1ModelRevision} />
            ) : null}

            {currentAnalysis?.status === "SUCCEEDED" && isPathologyGene ? (
              <div className="mt-5">
                <p className="text-xs font-bold text-slate-700">유전자 결과</p>
                {pathologyGeneNotApplicable ? (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    유전자 분석 비대상
                    <span className="ml-2 text-xs text-slate-400">NOT_APPLICABLE_NON_LUAD</span>
                  </div>
                ) : (
                  <PathologyGeneResultGroups results={geneResults} />
                )}
              </div>
            ) : null}

          </section>
        ) : null}

        {currentAnalysis?.status === "SUCCEEDED" ? (
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#DDE2F7] bg-gradient-to-r from-white to-[#F1F3FF] px-5 py-4 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {item.workflow_status === "REVIEW_COMPLETED"
                  ? "의사 검토 완료"
                  : diagnosticReviewDisplayStatus(item.diagnostic_review_status)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {alreadySubmitted
                  ? "동일한 제출은 중복 생성되지 않습니다."
                  : "완료된 현재 검사 결과만 제출할 수 있습니다."}
              </p>
            </div>
            <button
              type="button"
              disabled={!canSubmitForReview}
              onClick={handleSubmitForReview}
              className="rounded-lg bg-[#3446B8] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#29399F] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submittingReview
                ? "제출 중"
                : alreadySubmitted
                  ? diagnosticReviewDisplayStatus(item.diagnostic_review_status)
                  : "의사에게 제출"}
            </button>
          </section>
        ) : null}
      </div>

      {isResultOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsResultOpen(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pathology-result-title"
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#E2E5F2] border-t-4 border-t-[#3446B8] bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-5 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id="pathology-result-title"
                    className="text-lg font-bold text-[#3446B8]"
                  >
                    {isPathologyGene
                      ? "조직·유전자 AI 결과"
                      : isPdl1
                        ? "PD-L1 AI 결과"
                        : "AI 결과"}
                  </h2>

                  <span className="rounded-md bg-[#F1F3FF] px-2 py-1 text-[11px] font-semibold text-[#3446B8]">
                    분석 완료
                  </span>
                </div>

                <p className="mt-2 text-xs text-slate-500">
                  {item.patient.name} · {item.patient.patient_code} ·{" "}
                  {item.specimen?.specimen_code ?? "검체 미연결"}
                </p>
              </div>

              <button
                type="button"
                aria-label="결과 팝업 닫기"
                onClick={() => setIsResultOpen(false)}
                className="px-2 py-1 text-xl text-slate-400 transition hover:text-slate-700"
              >
                ×
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {isPathologyGene ? (
                pathologyResult ? (
                  <>
                    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div className="rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3">
                        <dt className="text-slate-500">예측 아형</dt>
                        <dd className={`mt-1 font-bold ${(pathologyResult.predicted_subtype ?? pathologyResult.predicted_histologic_type) === "LUAD" ? "text-[#A13F57]" : "text-slate-900"}`}>
                          {pathologyResult.predicted_subtype ??
                            pathologyResult.predicted_histologic_type ??
                            "-"}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3">
                        <dt className="text-slate-500">아형 신뢰도</dt>
                        <dd className="mt-1 font-bold text-slate-900">
                          {percent(pathologyResult.subtype_confidence)}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3">
                        <dt className="text-slate-500">악성 판정</dt>
                        <dd className="mt-1 font-bold text-[#A13F57]">
                          {pathologyResult.malignancy_assessment_label ?? "-"}
                        </dd>
                      </div>
                      <div className="rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3">
                        <dt className="text-slate-500">악성 확률</dt>
                        <dd className="mt-1 font-bold text-slate-900">
                          {percent(pathologyResult.malignancy_probability)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="relative flex min-h-64 flex-col items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-slate-950 px-4 text-center text-slate-200 shadow-inner">
                        {item.latest_wsi ? <PathologyWsiPreview wsiId={item.latest_wsi.id} /> : null}
                        <p className="relative z-10 rounded bg-slate-950/75 px-3 py-2 font-semibold">원본 조직영상</p>
                        <p className="relative z-10 mt-2 rounded bg-slate-950/75 px-3 py-1 text-xs text-slate-300">
                          {item.latest_wsi
                            ? `${item.latest_wsi.slide_code} · ${item.latest_wsi.original_filename}`
                            : "연결된 WSI가 없습니다."}
                        </p>
                      </div>
                      <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50">
                        {item.latest_wsi && pathologyGeneResultAnalysis?.source_image_asset_id === item.latest_wsi.image_asset_id ? (
                          <PathologyTissueHeatmap
                            key={pathologyGeneResultAnalysis?.id}
                            wsiId={item.latest_wsi.id}
                            analysisId={pathologyGeneResultAnalysis?.id}
                            emptyMessage="AI Heatmap 연결 예정"
                          />
                        ) : <p className="text-sm font-semibold text-slate-500">AI Heatmap 연결 예정</p>}
                      </div>
                    </div>
                  </>
                ) : (
                  <StateMessage
                    variant="empty"
                    title="저장된 AI 결과 상세가 없습니다."
                  />
                )
              ) : null}

              {isPdl1 ? (
                pdl1Result ? (
                  pdl1 ? <Pdl1AnalysisResults result={pdl1Result} analysis={pdl1} modelRevision={pdl1ModelRevision} /> : null
                ) : (
                  <StateMessage variant="empty" title="저장된 AI 결과 상세가 없습니다." />
                )
              ) : null}

        {isPathologyGene ? (
                <div className="mt-5">
                  <p className="text-xs font-bold text-slate-700">유전자 결과</p>
                  {pathologyGeneNotApplicable ? (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                      유전자 분석 비대상
                      <span className="ml-2 text-xs text-slate-400">NOT_APPLICABLE_NON_LUAD</span>
                    </div>
                  ) : (
                  <PathologyGeneResultGroups results={geneResults} compact />
                  )}
                </div>
              ) : null}
            </div>

            <footer className="m-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] px-5 py-4 sm:m-6">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {item.workflow_status === "REVIEW_COMPLETED"
                    ? "의사 검토 완료"
                    : diagnosticReviewDisplayStatus(item.diagnostic_review_status)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {alreadySubmitted
                    ? "동일한 제출은 중복 생성되지 않습니다."
                    : "완료된 현재 검사 결과만 제출할 수 있습니다."}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsResultOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  닫기
                </button>
                <button
                  type="button"
                  disabled={!canSubmitForReview}
                  onClick={handleSubmitForReview}
                  className="rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {submittingReview
                    ? "제출 중"
                    : alreadySubmitted
                      ? diagnosticReviewDisplayStatus(item.diagnostic_review_status)
                      : "의사에게 제출"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default function PathologyDashboardPage() {
  const recent = useRecentPatients("pathologyRecentPatients");
  const pathologyStaffName = useSyncExternalStore(
    subscribeToUserSessionStorage,
    getPathologyStaffName,
    () => "-",
  );
  const [items, setItems] = useState<
    PathologyWorkstationItem[]
  >([]);

  const [selectedId, setSelectedId] = useState<
    string | null
  >(null);

  const [selectedItem, setSelectedItem] = useState<PathologyWorkstationItem | null>(null);

  const [selectedWorkflow, setSelectedWorkflow] = useState<
    PathologyCaseWorkflow | null
  >(null);
  const [workflowRefreshVersion, setWorkflowRefreshVersion] = useState(0);
  const refreshCurrentWorkflow = useCallback(
    () => setWorkflowRefreshVersion((version) => version + 1),
    [],
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [tab, setTab] =
    useState<Tab>("worklist");

  const [examFilter, setExamFilter] =
    useState("ALL");

  const [
    workflowStatusFilter,
    setWorkflowStatusFilter,
  ] = useState("ALL");

  const [page, setPage] = useState(1);

  const [totalCount, setTotalCount] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] = useState("");

  useEffect(() => {
    if (tab === "completed") return;

    const controller = new AbortController();

    void fetchPathologyWorkstation({
      page,

     orderType:
      tab === "worklist" &&
      examFilter !== "ALL"
        ? examFilter
        : undefined,

      workflowStatus: undefined,

      signal: controller.signal,
    })
      .then((data) => {
        const nextItems = Array.isArray(
          data?.results,
        )
          ? data.results
          : [];

        setItems(nextItems);

        setSelectedItem((currentItem) => {
          if (!currentItem) return null;
          return nextItems.find((item) => item.case_id === currentItem.case_id) ?? currentItem;
        });

        setTotalCount(
          typeof data?.count === "number"
            ? data.count
            : 0,
        );

      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "병리 Worklist를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    examFilter,
    workflowStatusFilter,
    page,
    tab,
  ]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const controller = new AbortController();
    const detailTimeout = window.setTimeout(() => {
      setDetailError("병리 검사 상세 조회가 시간 초과되었습니다. 다시 선택해 주세요.");
      setDetailLoading(false);
      controller.abort();
    }, 30_000);

    void fetchPathologyCaseWorkflow(selectedId, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) {
          setSelectedWorkflow(data);
          setDetailError("");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setDetailError(
            reason instanceof Error
              ? reason.message
              : "병리 검사 상세를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        window.clearTimeout(detailTimeout);
        if (!controller.signal.aborted) setDetailLoading(false);
      });

    return () => {
      window.clearTimeout(detailTimeout);
      controller.abort();
    };
  }, [selectedId, workflowRefreshVersion]);

  const visible = useMemo(() => {
    const nonCancelled = items.filter(
      (item) =>
        item.workflow_status !== "CANCELLED",
    );

    if (tab === "completed") {
      return nonCancelled.filter(
        (item) =>
          item.workflow_status ===
          "REVIEW_COMPLETED",
      );
    }

    return items.filter(
      (item) => workflowStatusFilter === "ALL" || workflowStatusGroups[workflowStatusFilter]?.includes(item.workflow_status),
    );
  }, [items, tab, workflowStatusFilter]);

  const selected =
    (selectedItem?.case_id === selectedId ? selectedItem : null) ??
    items.find((item) => item.case_id === selectedId) ??
    null;
  const currentWorkflowOrder =
    selectedWorkflow && selected?.examination_order?.id
      ? selectedWorkflow.orders.find(
          (order) => order.examination_order?.id === selected.examination_order?.id,
        ) ?? null
      : null;

  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / PAGE_SIZE),
  );

  const changePage = (
    nextPage: number,
  ) => {
    if (
      nextPage === page ||
      nextPage < 1 ||
      nextPage > totalPages
    ) {
      return;
    }

    setLoading(true);
    setError("");
    setPage(nextPage);
  };

  const changeExamFilter = (
    nextFilter: string,
  ) => {
    if (nextFilter === examFilter) {
      return;
    }

    setLoading(true);
    setError("");
    setExamFilter(nextFilter);
    setPage(1);
  };

  const changeWorkflowStatusFilter = (
    nextFilter: string,
  ) => {
    if (
      nextFilter === workflowStatusFilter
    ) {
      return;
    }

    setLoading(true);
    setError("");
    setWorkflowStatusFilter(nextFilter);
    setPage(1);
  };

  const changeTab = (nextTab: Tab) => {
    if (nextTab === tab) return;

    setLoading(true);
    setError("");
    setTab(nextTab);
    setPage(1);
    setSelectedId(null);
  };

  return (
    <div className="min-w-0 bg-[#F5F6FF] text-slate-900">
      <nav className="overflow-x-auto border-b border-[#DDE2F7] bg-white shadow-sm">
        <div className="mx-auto w-full max-w-[1760px] px-4 sm:px-6">
          <div className="flex min-w-max gap-7">
            {(
              [
                ["worklist", "Worklist"],
                ["completed", "완료 기록"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  changeTab(id)
                }
                className={`border-b-2 px-2 py-3 text-sm font-semibold transition ${
                  tab === id
                    ? "border-[#3446B8] bg-[#F1F3FF] text-[#3446B8]"
                    : "border-transparent text-slate-500 hover:bg-[#F1F3FF] hover:text-[#3446B8]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 sm:py-5">
        {tab === "completed" ? <PathologyCompletedHistory /> : (
        <div className="grid gap-4 xl:h-[calc(100vh-173px)] xl:min-h-[560px] xl:grid-cols-[minmax(500px,42fr)_minmax(0,58fr)]">
          <section className="grid min-h-0 grid-cols-[160px_minmax(0,1fr)] overflow-hidden rounded-xl border border-[#DDE2F7] bg-white shadow-sm">
          <RecentPatients className="min-h-0 w-[160px] shrink-0 overflow-y-auto border-r border-[#E2E5F2] bg-[#FBFBFF] p-3" patients={recent.patients} selectedId={selectedId} onSelect={patient => {
            if (patient.case_id !== selectedId) {
              setSelectedItem(null); setSelectedWorkflow(null); setDetailError(""); setDetailLoading(true); setSelectedId(patient.case_id);
            }
            recent.remember(patient);
          }} />
          <div className="grid min-h-0 grid-rows-[minmax(0,62fr)_minmax(0,38fr)] overflow-hidden divide-y divide-[#E2E5F2]">
            <section className="flex min-h-0 flex-col">
              <div className="flex flex-wrap items-center gap-3 border-b border-[#E2E5F2] bg-[#F8F8FF] px-4 py-3">
                <h1 className="mr-auto text-sm font-bold">
                  병리 Worklist
                </h1>

                {tab === "worklist" ? (
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <span>검사</span>

                      <select
                        value={examFilter}
                        onChange={(event) =>
                          changeExamFilter(
                            event.target.value,
                          )
                        }
                        className="min-w-[100px] rounded-lg border border-[#CDD3EE] bg-white px-2 py-1.5 text-xs text-slate-700 outline-none transition hover:border-[#6677D8] focus:border-[#3446B8]"
                      >
                        <option value="ALL">
                          전체
                        </option>

                        <option value="PATHOLOGY_GENE">
                          {pathologyOrderTypeLabels.PATHOLOGY_GENE}
                        </option>

                        <option value="PDL1">
                          {pathologyOrderTypeLabels.PDL1}
                        </option>

                      </select>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-500">
                      <span>상태</span>

                      <select
                        value={
                          workflowStatusFilter
                        }
                        onChange={(event) =>
                          changeWorkflowStatusFilter(
                            event.target.value,
                          )
                        }
                        className="min-w-[100px] rounded-lg border border-[#CDD3EE] bg-white px-2 py-1.5 text-xs text-slate-700 outline-none transition hover:border-[#6677D8] focus:border-[#3446B8]"
                      >
                        <option value="ALL">
                          전체
                        </option>

                        <option value="AI_BEFORE">
                          AI 분석 전
                        </option>

                        <option value="REVIEW_PENDING">
                          검토 대기 중
                        </option>

                        <option value="REVIEW_COMPLETED">
                          진행 완료
                        </option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>

              {loading && items.length === 0 ? (
                <WorklistSkeleton />
              ) : error && items.length === 0 ? (
                <StateMessage
                  variant="error"
                  title={error}
                  className="m-4"
                />
              ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full min-w-[420px] text-left text-xs">
                    <thead className="sticky top-0 z-[1] bg-[#F1F3FF] text-slate-600">
                      <tr>
                        <th className="px-3 py-2.5">
                          환자명
                        </th>

                        <th className="px-3 py-2.5">
                          환자코드
                        </th>

                        <th className="px-3 py-2.5">
                          검사
                        </th>

                        <th className="px-3 py-2.5">
                          상태
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {visible.map((item) => (
                        <tr
                          key={item.id}
                          tabIndex={0}
                          onClick={() =>
                            (() => {
                              if (item.case_id !== selectedId) {
                                setDetailLoading(true);
                                setDetailError("");
                                setSelectedWorkflow(null);
                              }
                              setSelectedItem(item);
                              recent.remember({ case_id: item.case_id, patient_name: item.patient.name, birth_date: item.patient.birth_date });
                              setSelectedId(item.case_id);
                            })()
                          }
                          onKeyDown={(
                            event,
                          ) => {
                            if (
                              event.key ===
                              "Enter"
                            ) {
                              if (item.case_id !== selectedId) {
                                setDetailLoading(true);
                                setDetailError("");
                                setSelectedWorkflow(null);
                              }
                              setSelectedItem(item);
                              recent.remember({ case_id: item.case_id, patient_name: item.patient.name, birth_date: item.patient.birth_date });
                              setSelectedId(item.case_id);
                            }
                          }}
                          className={`cursor-pointer border-b border-l-[3px] border-[#E8EAF3] transition hover:bg-[#F7F8FF] ${
                            selectedId ===
                            item.case_id
                              ? "border-l-[#3446B8] bg-[#F1F3FF]"
                              : "border-l-transparent"
                          }`}
                        >
                          <td className="px-3 py-2.5 font-semibold">
                            {
                              item.patient
                                .name
                            }
                          </td>

                          <td className="px-3 py-2.5 text-slate-600">
                            {
                              item.patient
                                .patient_code
                            }
                          </td>

                          <td className="px-3 py-2.5">
                            {getPathologyOrderTypeLabel(
                              item.order_type,
                              item.order_type_label ?? item.current_exam_or_task,
                            )}
                          </td>

                          <td className="px-3 py-2.5">
                            <span className={`whitespace-nowrap rounded-sm px-0.5 py-0 font-semibold text-black ${
                              item.workflow_status === "REVIEW_COMPLETED"
                                ? "bg-emerald-100/80"
                                : item.workflow_status === "REVIEW_PENDING" || item.workflow_status === "AI_COMPLETED"
                                  ? "bg-orange-100/80"
                                  : "bg-yellow-100/80"
                            }`}>
                              {worklistDisplayStatus(
                                item,
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {visible.length === 0 ? (
                    <StateMessage
                      variant="empty"
                      title="표시할 병리 작업이 없습니다."
                      className="m-4"
                    />
                  ) : null}
                </div>
              )}

              {!error &&
              totalCount > 0 ? (
                <div className="flex items-center justify-center gap-1 border-t border-slate-200 px-3 py-2.5 text-xs">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() =>
                      changePage(page - 1)
                    }
                    className="rounded border border-slate-300 px-2.5 py-1.5 font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    이전
                  </button>

                  {Array.from(
                    {
                      length:
                        totalPages,
                    },
                    (_, index) =>
                      index + 1,
                  ).map(
                    (pageNumber) => (
                      <button
                        key={
                          pageNumber
                        }
                        type="button"
                        aria-current={
                          pageNumber ===
                          page
                            ? "page"
                            : undefined
                        }
                        onClick={() =>
                          changePage(
                            pageNumber,
                          )
                        }
                        className={`min-w-8 rounded border px-2 py-1.5 font-semibold ${
                          pageNumber ===
                          page
                            ? "border-[#3446B8] bg-[#3446B8] text-white"
                            : "border-[#CDD3EE] bg-white text-slate-600 hover:border-[#6677D8]"
                        }`}
                      >
                        {
                          pageNumber
                        }
                      </button>
                    ),
                  )}

                  <button
                    type="button"
                    disabled={
                      page ===
                      totalPages
                    }
                    onClick={() =>
                      changePage(page + 1)
                    }
                    className="rounded border border-slate-300 px-2.5 py-1.5 font-medium text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    다음
                  </button>
                </div>
              ) : null}
            </section>

            {selected ? (
              <PatientSummary
                item={selected}
              />
            ) : selectedId && recent.patients.some(patient => patient.case_id === selectedId) ? (
              <div className="p-4">
                <p>{recent.patients.find(patient => patient.case_id === selectedId)?.patient_name}</p>
                <p>{recent.patients.find(patient => patient.case_id === selectedId)?.birth_date || "-"}</p>
              </div>
            ) : null}
          </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#DDE2F7] bg-white shadow-sm">
          {detailLoading ? (
            <div
              className="flex min-h-0 flex-1 items-center justify-center bg-white px-6 py-10"
              role="status"
              aria-live="polite"
            >
              <div className="-translate-y-6 text-center">
                <Image
                  src="/images/soomi-loading.png"
                  alt=""
                  width={176}
                  height={176}
                  className="mx-auto h-[115px] w-auto object-contain"
                />
                <p className="mt-4 text-base font-semibold text-[#25324B]">
                  병리 검사 정보를 불러오는 중입니다
                </p>
                <p className="mt-2 text-sm text-slate-500">잠시만 기다려 주세요</p>
                <span
                  className="mx-auto mt-4 block h-4 w-4 animate-spin rounded-full border-2 border-[#DDE2F7] border-t-[#5364C7]"
                  aria-label="로딩 중"
                />
              </div>
            </div>
          ) : detailError ? (
            <StateMessage
              variant="error"
              title={detailError}
              className="m-6 self-start"
            />
          ) : selectedId && selectedWorkflow ? (
            <main className="min-h-0 flex-1 overflow-y-auto bg-white p-4">
              <SelectedCaseOverview
                workflow={selectedWorkflow}
                item={currentWorkflowOrder}
                staffName={pathologyStaffName}
              />
              {currentWorkflowOrder ? (
                <div className="mt-5">
                  <WorkArea
                    key={currentWorkflowOrder.examination_order?.id ?? currentWorkflowOrder.id}
                    item={currentWorkflowOrder}
                    sectionNumber={1}
                    onGeneWsiUploaded={() => setWorkflowRefreshVersion((version) => version + 1)}
                    onPdl1WsiUploaded={() => setWorkflowRefreshVersion((version) => version + 1)}
                    onGeneAnalysisCompleted={refreshCurrentWorkflow}
                  />
                </div>
              ) : selectedWorkflow.orders.length === 0 ? (
                <StateMessage
                  variant="empty"
                  title="표시할 병리 검사 오더가 없습니다."
                  className="m-6"
                />
              ) : (
                <StateMessage
                  variant="empty"
                  title="표시할 현재 병리 검사 오더가 없습니다."
                  className="m-6"
                />
              )}
            </main>
          ) : (
            <main className="flex min-h-0 flex-1 items-center justify-center bg-white p-6">
              <div className="flex -translate-y-8 flex-col items-center text-center">
                <Image src="/images/soomi.png" alt="" width={176} height={176} className="mb-5 h-auto w-44 object-contain" />
                <h1 className="text-xl font-bold text-slate-900">환자를 선택해 주세요</h1>
                <p className="mt-2 max-w-[340px] text-sm leading-6 text-slate-500">
                  왼쪽 Worklist에서 환자를 선택하면 병리 검사 및 AI 분석 작업을 시작할 수 있습니다.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3" aria-label="병리 검사 종류">
                  <div className="flex min-w-[154px] items-center justify-center gap-2 rounded-[10px] border border-[#ECE8FC] bg-[#F8F6FF] px-4 py-3 text-sm font-semibold text-[#25324B]">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                      <path d="m8 4 3 3-2 2 4 4 2-2 3 3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M13 6.5 18.5 12M6.5 17.5l4-4M4 20h16" strokeLinecap="round" />
                      <circle cx="17.5" cy="6.5" r="2.5" />
                    </svg>
                    <span>조직·유전자 검사</span>
                  </div>
                  <div className="flex min-w-[118px] items-center justify-center gap-2 rounded-[10px] border border-[#E1F1EC] bg-[#F3FAF8] px-4 py-3 text-sm font-semibold text-[#25324B]">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                      <circle cx="8" cy="9" r="3" />
                      <circle cx="16" cy="8" r="2.5" />
                      <circle cx="14" cy="16" r="3.5" />
                      <path d="m10.4 10.7 1.5 2.1m2.1-2.2-.7 1.9" strokeLinecap="round" />
                    </svg>
                    <span>PD-L1 검사</span>
                  </div>
                  <div className="flex min-w-[118px] items-center justify-center gap-2 rounded-[10px] border border-[#E5EEFC] bg-[#F4F8FF] px-4 py-3 text-sm font-semibold text-[#25324B]">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                      <path d="M5 5h14v14H5z" />
                      <path d="M8 9h8M8 12h8M8 15h5" strokeLinecap="round" />
                    </svg>
                    <span>결과 확인</span>
                  </div>
                </div>
              </div>
            </main>
          )}
          </section>
        </div>
        )}
      </div>
    </div>
  );
}
