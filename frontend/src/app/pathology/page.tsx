"use client";

import { useEffect, useMemo, useState } from "react";
import { RecentPatients, useRecentPatients } from "@/components/workspace/recent-patients";
import { StateMessage } from "@/components/workspace/state-message";

import {
  cancelPathologyGeneAnalysis,
  fetchPathologyCaseWorkflow,
  fetchPathologyGeneAnalyses,
  fetchPathologyWsiPreview,
  fetchPathologyWorkstation,
  fetchPdl1Analyses,
  runPathologyGeneAnalysis,
  runPdl1Analysis,
  uploadPdl1Input,
  uploadPathologyGeneInput,
  submitPathologyForReview,
  type PathologyWorkstationItem,
  type PathologyCaseWorkflow,
} from "./_lib/pathology-workstation-api";

import type { PathologyAiAnalysis } from "./_lib/pathology-api";

type Tab = "worklist" | "ai" | "completed";

const PAGE_SIZE = 10;

function WorklistSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-auto" role="status" aria-label="Worklist 로딩 중" aria-busy="true">
      <table className="w-full min-w-[420px] text-left text-xs" aria-hidden="true">
        <thead className="sticky top-0 z-[1] bg-[#F1F3FF] text-slate-600">
          <tr>
            {["환자명", "환자코드", "검사", "상태"].map((label) => (
              <th key={label} className="px-3 py-2.5">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="motion-safe:animate-pulse">
          {Array.from({ length: PAGE_SIZE }, (_, index) => (
            <tr key={index} className="border-b border-l-[3px] border-l-transparent border-b-[#E8EAF3]">
              {["w-14", "w-20", "w-12", "w-16"].map((width) => (
                <td key={width} className="px-3 py-2.5">
                  <div className={`h-4 max-w-full rounded bg-[#EEF0F8] ${width}`} />
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

function workflowDisplayStatus(item: PathologyWorkstationItem) {
  if (item.workflow_status === "REVIEW_COMPLETED") {
    return "의사 판독 완료";
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

function AnalysisProgress({
  status,
}: {
  status: string | undefined;
}) {
  if (status !== "PENDING" && status !== "RUNNING") {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border-l-2 border-[#3446B8] bg-[#F1F3FF] px-3 py-3">
      <p className="text-xs font-semibold text-[#3446B8]">분석 중</p>

      <div className="mt-2 h-1.5 overflow-hidden bg-blue-100">
        <div className="h-full w-1/2 animate-pulse bg-[#3446B8]" />
      </div>
    </div>
  );
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
      `${item.patient.sex || "-"} / ${item.patient.birth_date || "-"}`,
    ],
    ["Case Code", item.case.case_code || "-"],
    ["현재 검사", item.order_type_label ?? "-"],
    ["현재 상태", workflowDisplayStatus(item)],
    ["의뢰 의사", item.requesting_doctor?.name ?? "-"],
  ];

  return (
    <section
      aria-labelledby="pathology-selected-patient-heading"
      className="min-h-0 overflow-y-auto border-t border-[#E2E5F2] bg-[#FBFBFF] p-4"
    >
      <div className="bg-white px-1 py-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          선택 환자
        </p>

        <div className="mt-1 flex items-start justify-between gap-3">
          <div>
            <h2
              id="pathology-selected-patient-heading"
              className="text-base font-bold text-slate-900"
            >
              {item.patient.name}
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              {item.patient.patient_code}
            </p>
          </div>

          <span className="whitespace-nowrap px-1 py-0 text-[11px] font-semibold text-[#3446B8]">
            {workflowDisplayStatus(item)}
          </span>
        </div>
      </div>

      <dl className="grid gap-x-4 gap-y-3 bg-white px-1 py-4 text-xs sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
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

function SelectedCaseOverview({
  workflow,
  item,
}: {
  workflow: PathologyCaseWorkflow;
  item: PathologyWorkstationItem | null;
}) {
  return (
    <section className="overflow-hidden border-b border-[#E2E5F2] bg-white">
      <div className="relative flex flex-wrap items-start justify-between gap-4 overflow-hidden border-b border-[#E2E5F2] bg-[#F8F8FF] px-5 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5364C7]">
            선택 환자 정보
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h1 className="text-xl font-bold text-slate-900">
              {workflow.patient.name}
            </h1>
            <span className="text-xs text-slate-500">
              {workflow.patient.patient_code}
            </span>
          </div>
        </div>

        {item ? (
          <span className="rounded-full border border-[#CDD3EE] bg-white px-3 py-1.5 text-xs font-semibold text-[#3446B8] shadow-sm">
            {workflowDisplayStatus(item)}
          </span>
        ) : null}
      </div>

      <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["생년월일", workflow.patient.birth_date || "-"],
          ["성별", workflow.patient.sex || "-"],
          ["Case Code", workflow.case.case_code || "-"],
          ["현재 단계", workflow.case.current_stage || "-"],
          ["Case 상태", workflow.case.case_status || "-"],
          ["담당자", item?.assigned_to_name ?? "-"],
          ["의뢰 의사", item?.requesting_doctor?.name ?? "-"],
          ["현재 검사", item?.order_type_label ?? "-"],
        ].map(([label, value]) => (
          <div key={label} className="border-l-2 border-[#CDD3EE] pl-3">
            <dt className="text-[11px] text-slate-400">{label}</dt>
            <dd className="mt-1 break-words font-semibold text-slate-800">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function PathologyWsiPreview({ wsiId }: { wsiId: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetchPathologyWsiPreview(wsiId, controller.signal)
      .then((blob) => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setPreviewUrl(objectUrl);
        }
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [wsiId]);

  return previewUrl ? <img src={previewUrl} alt="H&E 원본 조직영상 미리보기" className="absolute inset-0 h-full w-full object-contain" /> : null;
}

function WorkArea({
  item,
  sectionNumber,
}: {
  item: PathologyWorkstationItem;
  sectionNumber: number;
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
  const [pdl1UploadMessage, setPdl1UploadMessage] = useState("");
  const [pathologyGeneWsiFile, setPathologyGeneWsiFile] = useState<File | null>(null);
  const [uploadingPathologyGeneWsi, setUploadingPathologyGeneWsi] = useState(false);
  const [pathologyGeneUploadMessage, setPathologyGeneUploadMessage] = useState("");
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
  const [runningPathologyGene, setRunningPathologyGene] = useState(false);
  const [cancellingPathologyGene, setCancellingPathologyGene] = useState(false);
  const [runningPdl1, setRunningPdl1] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewSubmissionError, setReviewSubmissionError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const pathology =
    item.order_type === "PATHOLOGY_GENE" ? pathologyGeneAnalysis : null;
  const pdl1 = pdl1Analyses[0] ?? null;
  const pdl1Status = runningPdl1 ? "RUNNING" : pdl1?.status;
  const pdl1AnalysisId = pdl1?.id;
  const pdl1AnalysisStatus = pdl1?.status;
  const pathologyResult = pathology?.result_detail?.pathology;
  const pdl1Result = pdl1?.result_detail?.pdl1;
  const pdl1ModelRevision = resultPayloadText(
    pdl1?.result_detail?.result_payload,
    "model_revision",
  );
  const geneResults =
    pathologyGeneAnalysis?.result_detail?.genes ?? [];
  const pathologyGeneResultStatus = pathologyGeneStatus(
    pathologyGeneAnalysis?.result_detail?.result_payload,
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

  useEffect(() => {
    if (
      item.order_type !== "PATHOLOGY_GENE" ||
      !pathologyGeneAnalysisId ||
      (pathologyGeneAnalysisStatus !== "PENDING" &&
        pathologyGeneAnalysisStatus !== "RUNNING")
    ) return;
    let cancelled = false;
    const refresh = () => fetchPathologyGeneAnalyses(item.case_id)
      .then((analyses) => {
        const analysis = analyses.find((entry) => entry.id === pathologyGeneAnalysisId);
        if (!cancelled && analysis) setPathologyGeneAnalysis(analysis);
      })
      .catch(() => undefined);
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [item.case_id, item.order_type, pathologyGeneAnalysisId, pathologyGeneAnalysisStatus]);

  async function handlePdl1Run() {
    if (!pdl1InputReady) return;

    setRunningPdl1(true);
    setError("");
    setMessage("");

    try {
      const result = await runPdl1Analysis(item.case_id);
      setPdl1Analyses((current) => [result, ...current]);
      setMessage("PD-L1 분석 요청이 등록되었습니다.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "PD-L1 분석을 시작하지 못했습니다.",
      );
    } finally {
      setRunningPdl1(false);
    }
  }

  async function handlePdl1Upload() {
    if (!item.examination_order?.id || !pdl1WsiFile || !pdl1AnnotationFile) return;
    setUploadingPdl1Input(true);
    setError("");
    setPdl1UploadMessage("");
    try {
      const result = await uploadPdl1Input(item.examination_order.id, pdl1WsiFile, pdl1AnnotationFile, pdl1RoiLayer);
      setPdl1InputReady(result.upload_ready);
      setPdl1UploadMessage("PD-L1 입력 파일이 서버에 업로드되었습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PD-L1 입력 파일 업로드에 실패했습니다.");
    } finally {
      setUploadingPdl1Input(false);
    }
  }

  async function handlePathologyGeneWsiUpload() {
    const orderId = item.examination_order?.id;
    if (item.order_type !== "PATHOLOGY_GENE" || !orderId || !pathologyGeneWsiFile) return;
    setUploadingPathologyGeneWsi(true);
    setError("");
    setPathologyGeneUploadMessage("");
    try {
      const result = await uploadPathologyGeneInput(orderId, pathologyGeneWsiFile);
      setPathologyGeneWsiId(result.wsi_id);
      setPathologyGeneUploadMessage("H&E WSI 파일이 서버에 업로드되었습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "H&E WSI 업로드에 실패했습니다.");
    } finally {
      setUploadingPathologyGeneWsi(false);
    }
  }

  async function handlePathologyGeneRun() {
    if (!pathologyGeneWsiId || runningPathologyGene) return;
    setRunningPathologyGene(true);
    setError("");
    setMessage("");
    try {
      const result = await runPathologyGeneAnalysis(item.case_id, pathologyGeneWsiId);
      setPathologyGeneAnalysis(result);
      setMessage("조직·유전자 분석 요청이 등록되었습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "조직·유전자 분석 요청에 실패했습니다.");
    } finally {
      setRunningPathologyGene(false);
    }
  }

  async function handlePathologyGeneCancel() {
    if (
      !pathologyGeneAnalysisId ||
      (pathologyGeneAnalysisStatus !== "PENDING" && pathologyGeneAnalysisStatus !== "RUNNING") ||
      cancellingPathologyGene
    ) return;

    setCancellingPathologyGene(true);
    setError("");
    setMessage("");
    try {
      const result = await cancelPathologyGeneAnalysis(item.case_id, pathologyGeneAnalysisId);
      setPathologyGeneAnalysis(result);
      setRunningPathologyGene(false);
      setMessage("조직·유전자 분석이 취소되었습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "조직·유전자 분석 취소에 실패했습니다.");
    } finally {
      setCancellingPathologyGene(false);
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
  const canViewPathologyGeneResult =
    pathologyGeneAnalysisStatus === "SUCCEEDED";
  const canRunPathologyGene = pathologyGeneWsiReady &&
    !pathologyGeneAnalysisRunning &&
    !canViewPathologyGeneResult;
  const canCancelPathologyGene = Boolean(pathologyGeneAnalysisId) &&
    (pathologyGeneAnalysisStatus === "PENDING" || pathologyGeneAnalysisStatus === "RUNNING");
  const pathologyGeneWsiFilename = pathologyGeneWsiReady
    ? pathologyGeneWsiFile?.name ?? item.latest_wsi?.original_filename ?? null
    : null;
  const currentAnalysis = isPathologyGene
    ? pathologyGeneAnalysis
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
  const testDescription = isPathologyGene
    ? "조직·유전자 분석"
    : isPdl1
      ? "PD-L1 TPS 분석"
      : "현재 오더의 검사 종류를 확인할 수 없습니다.";
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

  async function handleSubmitForReview() {
    if (!canSubmitForReview || !currentAnalysis) return;

    setSubmittingReview(true);
    setReviewSubmissionError("");

    try {
      await submitPathologyForReview(
        item.case_id,
        item.id,
        currentAnalysis.id,
      );
      setReviewSubmitted(true);
    } catch (reason) {
      setReviewSubmissionError(
        reason instanceof Error
          ? reason.message
          : "의사에게 제출하지 못했습니다.",
      );
    } finally {
      setSubmittingReview(false);
    }
  }

  return (
    <section className="overflow-hidden border-b border-[#E2E5F2] bg-white last:border-b-0">
      <header className="relative flex flex-wrap items-start justify-between gap-3 overflow-hidden border-b border-[#DDE2F7] bg-[#F8F8FF] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            병리 분석 Workstation
          </p>

          <h2 className="mt-1 text-lg font-bold text-[#3446B8]">
            {String(sectionNumber).padStart(2, "0")} · {testTitle}
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            {testDescription} · {item.patient.name} ·{" "}
            {item.specimen?.specimen_code ?? "검체 미연결"}
          </p>
        </div>
        <span className="rounded-full border border-[#DDE2F7] bg-white px-2.5 py-1 text-xs font-semibold text-[#3446B8]">
          {workflowDisplayStatus(item)}
        </span>
      </header>

      <div className="space-y-4 bg-[#F7F8FF] p-4">
        {isKnownTestType ? (
          <ol
            aria-label={`${testTitle} workflow`}
            className="grid overflow-hidden rounded-lg border border-[#DDE2F7] bg-white sm:grid-cols-4"
          >
            {workflowSteps.map((step, index) => (
              <li
                key={step.label}
                className={`relative flex items-center gap-3 border-b border-[#E2E5F2] px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${
                  step.completed ? "bg-[#F1F3FF]" : "bg-white"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    step.completed
                      ? "bg-[#3446B8] text-white"
                      : "border border-[#CDD3EE] bg-white text-slate-400"
                  }`}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    step.completed ? "text-[#3446B8]" : "text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
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
                  <dt className="text-slate-500">MPP</dt>
                  <dd className="mt-1 font-semibold">
                    {item.latest_wsi.mpp ?? "-"}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">상태</dt>
                  <dd className="mt-1 font-semibold">
                    {item.latest_wsi.image_status}
                  </dd>
                </div>
              </dl>

              <div className="relative mt-3 flex min-h-96 flex-col items-center justify-center rounded-lg border border-[#C7CBE5] bg-slate-950 text-slate-200 shadow-inner">
                <PathologyWsiPreview wsiId={item.latest_wsi.id} />
                <p className="font-semibold">
                  조직영상 미리보기
                </p>

                <p className="mt-2 text-xs text-slate-400">
                  WSI Viewer 연결 준비 중
                </p>
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
              <div className="mt-3 flex flex-col items-start gap-2">
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
                    <label className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${pathologyGeneWsiFile ? "bg-emerald-500" : "bg-[#3446B8] hover:bg-[#29399F]"} ${uploadingPathologyGeneWsi ? "cursor-not-allowed opacity-60" : ""}`}>
                      <span>{pathologyGeneWsiFile ? "H&E WSI 선택 완료" : "H&E WSI 선택"}</span>
                      <input
                        type="file"
                        accept=".svs"
                        disabled={uploadingPathologyGeneWsi}
                        className="sr-only"
                        onChange={(event) => {
                          setPathologyGeneWsiFile(event.target.files?.[0] ?? null);
                          setPathologyGeneUploadMessage("");
                          setError("");
                        }}
                      />
                    </label>
                    {pathologyGeneWsiFile ? <p className="text-xs text-slate-600">{pathologyGeneWsiFile.name}</p> : null}
                    <button
                      type="button"
                      disabled={!pathologyGeneWsiFile || uploadingPathologyGeneWsi || !item.examination_order?.id}
                      onClick={handlePathologyGeneWsiUpload}
                      className="rounded-lg bg-[#3446B8] px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300"
                    >
                      {uploadingPathologyGeneWsi ? "업로드 중..." : "서버에 업로드"}
                    </button>
                  </>
                )}
              </div>
              {pathologyGeneUploadMessage ? <p role="status" className="mt-2 text-xs text-emerald-700">{pathologyGeneUploadMessage}</p> : null}
              {error ? <p role="alert" className="mt-2 text-xs text-red-700">{error}</p> : null}
            </section>
            <section className="rounded-xl border border-[#DDE2F7] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
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

            <div className="flex gap-2">
            <button
              type="button"
              disabled={!canRunPathologyGene}
              onClick={handlePathologyGeneRun}
              className="rounded-md bg-[#3446B8] px-3 py-2 text-xs font-semibold text-white hover:bg-[#29399F] disabled:bg-slate-300"
            >
              {pathologyGeneAnalysisRunning ? "분석 실행 중" : "분석 실행"}
            </button>
            {canCancelPathologyGene ? (
              <button
                type="button"
                disabled={cancellingPathologyGene}
                onClick={handlePathologyGeneCancel}
                className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300"
              >
                {cancellingPathologyGene ? "취소 중..." : "분석 취소"}
              </button>
            ) : null}
            </div>
          </div>

          <AnalysisProgress status={pathology?.status} />

          <div className="mt-3">
            <AnalysisStatus status={pathology?.status} />
          </div>

          <button
            type="button"
            disabled={!canViewPathologyGeneResult}
            onClick={() => setIsResultOpen(true)}
            className="mt-3 rounded-md bg-[#3446B8] px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300"
          >
            AI 결과 보기
          </button>
        </section>
          </>
        ) : null}

        {isPdl1 ? (
          <section className="rounded-xl border border-[#DDE2F7] bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold"><span className="mr-2 text-xs text-[#3446B8]">01</span>입력 데이터</h3>
            <div className="mt-3 grid gap-3 rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3">
              <label className={`rounded-lg border p-3 transition ${pdl1WsiFile ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">WSI 파일</span>
                  {pdl1WsiFile ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">선택 완료</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">미선택</span>}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-3 py-2 text-xs font-semibold text-white ${uploadingPdl1Input || pdl1InputReady ? "bg-slate-300" : "bg-[#3446B8] hover:bg-[#29399F]"}`}>WSI 파일 선택</span>
                  <span className="min-w-0 truncate text-xs text-slate-600">{pdl1WsiFile?.name ?? "선택된 파일이 없습니다."}</span>
                </span>
                <input type="file" accept=".svs,.tif,.tiff" disabled={uploadingPdl1Input || pdl1InputReady} className="sr-only" onChange={(event) => { setPdl1WsiFile(event.target.files?.[0] ?? null); setPdl1UploadMessage(""); }} />
              </label>
              <label className={`rounded-lg border p-3 transition ${pdl1AnnotationFile ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">HALO annotation 파일</span>
                  {pdl1AnnotationFile ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">선택 완료</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">미선택</span>}
                </span>
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-3 py-2 text-xs font-semibold text-white ${uploadingPdl1Input || pdl1InputReady ? "bg-slate-300" : "bg-[#3446B8] hover:bg-[#29399F]"}`}>HALO annotation 선택</span>
                  <span className="min-w-0 truncate text-xs text-slate-600">{pdl1AnnotationFile?.name ?? "선택된 파일이 없습니다."}</span>
                </span>
                <input type="file" accept=".annotations" disabled={uploadingPdl1Input || pdl1InputReady} className="sr-only" onChange={(event) => { setPdl1AnnotationFile(event.target.files?.[0] ?? null); setPdl1UploadMessage(""); }} />
              </label>
              <label className="text-xs font-semibold text-slate-700">ROI layer
                <select value={pdl1RoiLayer} disabled={uploadingPdl1Input || pdl1InputReady} onChange={(event) => setPdl1RoiLayer(event.target.value as "Tumor" | "Tumor-JS")} className="mt-2 block rounded border border-slate-300 bg-white px-2 py-1 disabled:bg-slate-100">
                  <option value="Tumor">Tumor</option><option value="Tumor-JS">Tumor-JS</option>
                </select>
              </label>
              <button type="button" disabled={!pdl1WsiFile || !pdl1AnnotationFile || uploadingPdl1Input || pdl1InputReady} onClick={handlePdl1Upload} className="w-fit rounded-lg bg-[#3446B8] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#29399F] disabled:bg-slate-300">
                {uploadingPdl1Input ? "업로드 중..." : pdl1InputReady ? "업로드 완료" : "서버에 업로드"}
              </button>
              {pdl1UploadMessage ? <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{pdl1UploadMessage}</p> : null}
              {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-[#DDE2F7] bg-white p-3">
              <div><p className="text-xs font-semibold text-slate-700">02 PD-L1 AI 분석</p><p className="mt-1 text-xs text-slate-500">WSI와 HALO annotation이 모두 업로드된 후 실행합니다.</p></div>
              <button type="button" disabled={!pdl1InputReady || runningPdl1} onClick={handlePdl1Run} className="rounded-lg bg-[#3446B8] px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300">{runningPdl1 ? "분석 요청 중" : "분석 실행"}</button>
            </div>
            <AnalysisProgress status={pdl1Status} /><div className="mt-3"><AnalysisStatus status={pdl1Status} /></div>
            {message ? <p className="mt-3 text-xs text-blue-800">{message}</p> : null}
          </section>
        ) : null}

        {currentAnalysis?.status === "SUCCEEDED" ? (
          <section className="rounded-xl border border-[#DDE2F7] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#5364C7]">
                  AI 결과
                </p>
                <h3 className="mt-1 text-sm font-bold text-slate-900">
                  AI 분석 결과
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsResultOpen(true)}
                className="rounded-lg bg-[#3446B8] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#29399F]"
              >
                AI 결과 보기
              </button>
            </div>

            {isPathologyGene && pathologyResult ? (
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
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3"
                    >
                      <dt className="text-xs text-slate-500">{label}</dt>
                      <dd className="mt-2 font-bold text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}

            {isPdl1 && pdl1Result ? (
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                {[
                  ["TPS 예측 구간", pdl1Result.predicted_tps_range_label ?? "-"],
                  ["Confidence", percent(pdl1Result.confidence)],
                  ["Class 0 확률", percent(pdl1Result.probabilities.class_0)],
                  ["Class 1 확률", percent(pdl1Result.probabilities.class_1)],
                  ["Class 2 확률", percent(pdl1Result.probabilities.class_2)],
                  ["Model revision", pdl1ModelRevision],
                  ["모델명", pdl1?.model_name ?? "-"],
                  ["모델 버전", pdl1?.model_version_name ?? "-"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3"
                  >
                    <dt className="text-xs text-slate-500">{label}</dt>
                    <dd className="mt-2 font-bold text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
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
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {geneTargets.map((gene) => {
                      const result = geneResults.find(
                        (entry) => entry.gene_symbol === gene.symbol,
                      );

                      return (
                        <div
                          key={gene.symbol}
                          className="rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3 text-sm"
                        >
                          <dt className="font-bold text-slate-800">{gene.label}</dt>
                          <dd className="mt-2 font-semibold text-slate-700">
                            {geneStatus(result?.predicted_status)}
                          </dd>
                          <dd className="mt-1 text-xs text-slate-500">
                            Probability {percent(result?.predicted_probability)}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
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
                  ? "의사 판독 완료"
                  : alreadySubmitted
                    ? "의사에게 제출 완료"
                    : "AI 분석 결과를 의사 판독 대상으로 제출합니다."}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {reviewSubmissionError ||
                  (alreadySubmitted
                    ? "동일한 판독 작업은 중복 생성되지 않습니다."
                    : "완료된 현재 검사 결과만 제출할 수 있습니다.")}
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
                  ? "의사에게 제출 완료"
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
                        <dd className="mt-1 font-bold text-slate-900">
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
                        <dd className="mt-1 font-bold text-slate-900">
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
                      <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-500">
                        AI Heatmap 연결 예정
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
                  <dl className="grid gap-3 text-sm sm:grid-cols-3">
                    {[
                      ["TPS 예측 구간", pdl1Result.predicted_tps_range_label ?? "-"],
                      ["Confidence", percent(pdl1Result.confidence)],
                      ["Model revision", pdl1ModelRevision],
                      ["Class 0 확률", percent(pdl1Result.probabilities?.class_0)],
                      ["Class 1 확률", percent(pdl1Result.probabilities?.class_1)],
                      ["Class 2 확률", percent(pdl1Result.probabilities?.class_2)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="mt-1 font-bold text-slate-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
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
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    {geneTargets.map((gene) => {
                      const result = geneResults.find(
                        (entry) => entry.gene_symbol === gene.symbol,
                      );

                      return (
                        <div key={gene.symbol} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] p-3 text-sm">
                          <dt className="font-bold text-slate-800">{gene.label}</dt>
                          <dd className="text-right text-slate-600"><span className="mr-1 text-[11px] text-slate-400">Probability</span>{percent(result?.predicted_probability)}</dd>
                          <dd className="col-span-2 mt-1 font-semibold text-slate-700"><span className="mr-2 text-[11px] font-normal text-slate-400">결과</span>{geneStatus(result?.predicted_status)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                  )}
                </div>
              ) : null}
            </div>

            <footer className="m-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#DDE2F7] bg-[#F7F8FC] px-5 py-4 sm:m-6">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {item.workflow_status === "REVIEW_COMPLETED"
                    ? "의사 판독 완료"
                    : alreadySubmitted
                      ? "의사에게 제출 완료"
                      : "AI 분석 결과를 의사 판독 대상으로 제출합니다."}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {reviewSubmissionError ||
                    (alreadySubmitted
                      ? "동일한 판독 작업은 중복 생성되지 않습니다."
                      : "완료된 현재 검사 결과만 제출할 수 있습니다.")}
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
                      ? "의사에게 제출 완료"
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

    void fetchPathologyCaseWorkflow(selectedId, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setSelectedWorkflow(data); setSelectedItem(current => current?.case_id === selectedId ? current : data.orders[0] ?? null); } })
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
        if (!controller.signal.aborted) setDetailLoading(false);
      });

    return () => controller.abort();
  }, [selectedId]);

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

    if (tab === "ai") {
      return nonCancelled.filter((item) =>
        [
          "AI_READY",
          "AI_RUNNING",
          "AI_COMPLETED",
        ].includes(item.workflow_status),
      );
    }

    return items.filter(
      (item) => workflowStatusFilter === "ALL" || workflowStatusGroups[workflowStatusFilter]?.includes(item.workflow_status),
    );
  }, [items, tab, workflowStatusFilter]);

  const selected =
    items.find(
      (item) => item.case_id === selectedId,
    ) ?? (selectedItem?.case_id === selectedId ? selectedItem : null);

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
    setSelectedId(null);
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
    setSelectedId(null);
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
                ["ai", "AI 작업"],
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
                          조직·유전자 검사
                        </option>

                        <option value="PDL1">
                          PD-L1 검사
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

              {loading ? (
                <WorklistSkeleton />
              ) : error ? (
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
                          key={item.case_id}
                          tabIndex={0}
                          onClick={() =>
                            (() => {
                              setDetailLoading(true);
                              setDetailError("");
                              setSelectedWorkflow(null);
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
                              setDetailLoading(true);
                              setDetailError("");
                              setSelectedWorkflow(null);
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
                            병리검사
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

              {!loading &&
              !error &&
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
            ) : (
              <StateMessage
                variant="empty"
                title="환자를 선택하세요."
                className="m-4"
              />
            )}
          </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#DDE2F7] bg-white shadow-sm">
          {detailLoading ? (
            <StateMessage
              variant="loading"
              title="병리 검사 상세를 불러오는 중입니다."
              className="m-6 self-start"
            />
          ) : detailError ? (
            <StateMessage
              variant="error"
              title={detailError}
              className="m-6 self-start"
            />
          ) : selectedId && selectedWorkflow ? (
            <main className="min-h-0 flex-1 overflow-y-auto bg-[#F7F8FC] p-4">
              <SelectedCaseOverview
                workflow={selectedWorkflow}
                item={selected ?? selectedWorkflow.orders[0] ?? null}
              />
              {selectedWorkflow.orders.map((order, index) => (
                <WorkArea
                  key={order.examination_order?.id ?? order.id}
                  item={order}
                  sectionNumber={index + 1}
                />
              ))}
              {selectedWorkflow.orders.length === 0 ? (
                <StateMessage
                  variant="empty"
                  title="표시할 병리 검사 오더가 없습니다."
                  className="m-6"
                />
              ) : null}
            </main>
          ) : (
            <StateMessage
              variant="empty"
              title="병리 작업을 선택하세요."
              className="m-6 self-start"
            />
          )}
          </section>
        </div>
      </div>
    </div>
  );
}
