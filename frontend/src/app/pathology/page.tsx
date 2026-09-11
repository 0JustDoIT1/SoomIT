"use client";

import { useEffect, useMemo, useState } from "react";
import { StateMessage } from "@/components/workspace/state-message";

import {
  fetchPathologyAnalyses,
  fetchPathologyWorkstation,
  runPdl1Analysis,
  type PathologyWorkstationItem,
} from "./_lib/pathology-workstation-api";

import type { PathologyAiAnalysis } from "./_lib/pathology-api";

type Tab = "worklist" | "ai" | "completed";

const PAGE_SIZE = 10;

const geneTargets = [
  { symbol: "KRAS", label: "KRAS" },
  { symbol: "TP53", label: "TP53" },
  { symbol: "EGFR", label: "EGFR" },
  { symbol: "KEAP1", label: "KEAP1" },
  { symbol: "STK11", label: "STK11" },
  { symbol: "BRAF", label: "BRAF" },
  { symbol: "MET", label: "MET" },
  { symbol: "ERBB2", label: "HER2 (ERBB2)" },
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

function AiResultButton({
  status,
  onClick,
}: {
  status: string | undefined;
  onClick: () => void;
}) {
  if (status !== "SUCCEEDED") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 rounded-lg bg-[#3446B8] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#29399F]"
    >
      AI 결과 보기
    </button>
  );
}

function PatientSummary({
  item,
}: {
  item: PathologyWorkstationItem;
}) {
  const informationGroups = [
    {
      title: "환자 기본정보",
      rows: [
        ["환자명", item.patient.name],
        ["환자코드", item.patient.patient_code],
        ["생년월일", item.patient.birth_date || "-"],
        ["성별", item.patient.sex || "-"],
      ],
    },
    {
      title: "Case 정보",
      rows: [
        ["Case Code", item.case.case_code || "-"],
        ["현재 단계", item.case.current_stage || "-"],
        ["Case 상태", item.case.case_status || "-"],
      ],
    },
    {
      title: "검체 정보",
      rows: [
        ["검체번호", item.specimen?.specimen_code ?? "-"],
        ["검체 종류", item.specimen?.specimen_type ?? "-"],
        ["채취 부위", item.specimen?.body_site ?? "-"],
        ["검체 상태", item.specimen?.status ?? "-"],
        ["Slide", item.latest_wsi?.slide_code ?? "-"],
        ["연결 WSI", String(item.wsi_count)],
      ],
    },
    {
      title: "현재 검사 / 오더",
      rows: [
        ["검사", item.pathology_test_type_label ?? "-"],
        ["현재 상태", workflowDisplayStatus(item)],
        ["작업 상태", item.status || "-"],
        ["우선순위", item.priority || "-"],
        ["의뢰 의사", item.requesting_doctor?.name ?? "-"],
      ],
    },
  ];

  return (
    <section className="min-h-0 overflow-y-auto bg-[#F9FAFF]">
      <div className="border-b border-[#E2E5F2] bg-white px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          선택 환자 · 검체
        </p>

        <div className="mt-1 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {item.patient.name}
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              {item.patient.patient_code}
            </p>
          </div>

          <span className="whitespace-nowrap rounded-md bg-[#F1F3FF] px-2 py-1 text-[11px] font-semibold text-[#3446B8]">
            {workflowDisplayStatus(item)}
          </span>
        </div>
      </div>

      <div className="divide-y divide-[#E2E5F2] px-4">
        {informationGroups.map((group) => (
          <section key={group.title} className="py-3">
            <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#3446B8] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#6677D8]">
              {group.title}
            </h3>

            <dl className="mt-2 divide-y divide-[#E2E5F2] text-xs">
              {group.rows.map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-1.5"
                >
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="break-words font-medium text-slate-800">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <section className="border-t border-[#E2E5F2] bg-white px-4 py-3">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#3446B8] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#F28A3A]">
          영상 올리기
        </h3>

        {item.latest_wsi ? (
          <div className="mt-2 rounded-r-lg border-l-2 border-[#3446B8] bg-[#F1F3FF] px-3 py-2 text-xs">
            <p className="font-semibold text-[#3446B8]">현재 연결 영상</p>
            <p className="mt-1 break-all text-[#3446B8]">
              {item.latest_wsi.slide_code} · {item.latest_wsi.original_filename}
            </p>
            <p className="mt-1 text-[11px] text-[#6677D8]">
              WSI ID: {item.latest_wsi.id}
            </p>
          </div>
        ) : null}

        <button
          type="button"
          disabled
          className="mt-2 flex w-full cursor-not-allowed flex-col items-center justify-center rounded-lg border border-dashed border-[#AEB8EB] bg-[#F1F3FF] px-3 py-4 text-center disabled:opacity-80"
        >
          <span className="text-xs font-semibold text-[#3446B8]">
            WSI 파일 선택 또는 끌어놓기
          </span>
          <span className="mt-1 text-[11px] text-slate-500">
            WSI 업로드 API 연결 대기
          </span>
        </button>
      </section>
    </section>
  );
}

function WorkArea({
  item,
}: {
  item: PathologyWorkstationItem;
}) {
  const [pathologyAnalyses, setPathologyAnalyses] = useState<
    PathologyAiAnalysis[]
  >([]);

  const [pdl1Analyses, setPdl1Analyses] = useState<
    PathologyAiAnalysis[]
  >([]);

  const [featureFile, setFeatureFile] = useState<File | null>(null);
  const [runningPdl1, setRunningPdl1] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      fetchPathologyAnalyses(
        item.case_id,
        "pathology",
        controller.signal,
      ),
      fetchPathologyAnalyses(
        item.case_id,
        "pdl1",
        controller.signal,
      ),
    ])
      .then(([pathology, pdl1]) => {
        setPathologyAnalyses(pathology);
        setPdl1Analyses(pdl1);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            reason instanceof Error
              ? reason.message
              : "AI 결과를 불러오지 못했습니다.",
          );
        }
      });

    return () => controller.abort();
  }, [item.case_id]);

  const pathology = pathologyAnalyses[0] ?? null;
  const pdl1 = pdl1Analyses[0] ?? null;
  const pdl1Status = runningPdl1 ? "RUNNING" : pdl1?.status;
  const pathologyResult = pathology?.result_detail?.pathology;
  const pdl1Result = pdl1?.result_detail?.pdl1;
  const geneResults =
    item.latest_gene_analysis?.result_detail?.genes ?? [];

  async function handlePdl1Run() {
    if (!featureFile) return;

    setRunningPdl1(true);
    setError("");
    setMessage("");

    try {
      const result = await runPdl1Analysis(
        item.case_id,
        featureFile,
        item.latest_wsi?.id,
      );

      setPdl1Analyses((current) => [
        result,
        ...current,
      ]);

      setFeatureFile(null);
      setMessage("PD-L1 분석이 완료되었습니다.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "PD-L1 분석을 실행하지 못했습니다.",
      );
    } finally {
      setRunningPdl1(false);
    }
  }

  const currentTestType = item.pathology_test_type;
  const isSubtype = currentTestType === "SUBTYPE";
  const isPdl1 = currentTestType === "PDL1";
  const isGene = currentTestType === "GENE";
  const isKnownTestType = isSubtype || isPdl1 || isGene;
  const testTitle = isSubtype
    ? "아형분류 검사"
    : isPdl1
      ? "PD-L1 검사"
      : isGene
        ? "유전자 검사"
        : "검사 종류 미확인";
  const testDescription = isSubtype
    ? "LUAD / LUSC 아형 분류"
    : isPdl1
      ? "PD-L1 TPS 분석"
      : isGene
        ? "8개 유전자 변이 분석"
        : "현재 오더의 검사 종류를 확인할 수 없습니다.";

  return (
    <main className="min-h-0 overflow-y-auto bg-white">
      <header className="sticky top-0 z-10 border-b border-[#E2E5F2] bg-gradient-to-r from-[#F1F3FF] to-white px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          병리 분석 Workstation
        </p>

        <h2 className="mt-1 text-lg font-bold text-[#3446B8]">{testTitle}</h2>

        <p className="mt-1 text-xs text-slate-500">
          {testDescription} · {item.patient.name} ·{" "}
          {item.specimen?.specimen_code ?? "검체 미연결"}
        </p>
      </header>

      <div className="divide-y divide-[#E2E5F2] px-5">
        {!isKnownTestType ? (
          <StateMessage
            variant="empty"
            title="현재 오더의 검사 종류를 확인할 수 없습니다."
            className="my-5"
          />
        ) : null}

        {isKnownTestType ? (
        <section className="py-5">
          <h3 className="text-sm font-bold">
            <span className="mr-2 text-xs text-[#3446B8]">
              01
            </span>
            조직데이터
          </h3>

          {item.latest_wsi ? (
            <>
              <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-3 border-y border-slate-200 py-3 text-xs sm:grid-cols-5">
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

              <div className="mt-3 flex min-h-80 flex-col items-center justify-center border border-slate-300 bg-slate-950 text-slate-200">
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
              className="mt-3 min-h-60"
            />
          )}
        </section>
        ) : null}

        {isSubtype ? (
        <section className="py-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold">
                <span className="mr-2 text-xs text-[#3446B8]">
                  02
                </span>
                LUAD/LUSC 분석
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                현재 상태:{" "}
                {pathology?.status_label ?? "결과 없음"}
              </p>
            </div>

            <button
              disabled
              className="rounded-md bg-slate-300 px-3 py-2 text-xs font-semibold text-white"
            >
              분석 실행
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            아형분류 분석 API 연결 대기
          </p>

          <AnalysisProgress status={pathology?.status} />

          <div className="mt-3">
            <AnalysisStatus status={pathology?.status} />
          </div>

          <AiResultButton
            status={pathology?.status}
            onClick={() => setIsResultOpen(true)}
          />
        </section>
        ) : null}

        {isPdl1 ? (
        <section className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold">
                <span className="mr-2 text-xs text-[#3446B8]">
                  03
                </span>
                PD-L1 분석
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                현재 상태:{" "}
                {pdl1?.status_label ?? "결과 없음"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold">
                .pt feature 선택

                <input
                  type="file"
                  accept=".pt"
                  className="sr-only"
                  onChange={(event) =>
                    setFeatureFile(
                      event.target.files?.[0] ?? null,
                    )
                  }
                />
              </label>

              <button
                type="button"
                disabled={!featureFile || runningPdl1}
                onClick={handlePdl1Run}
                className="rounded-lg bg-[#3446B8] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#29399F] disabled:bg-slate-300"
              >
                {runningPdl1
                  ? "분석 중"
                  : "분석 실행"}
              </button>
            </div>
          </div>

          {featureFile ? (
            <p className="mt-2 text-xs text-slate-500">
              선택 파일: {featureFile.name}
            </p>
          ) : null}

          <AnalysisProgress status={pdl1Status} />

          <div className="mt-3">
            <AnalysisStatus status={pdl1Status} />
          </div>

          <AiResultButton
            status={pdl1Status}
            onClick={() => setIsResultOpen(true)}
          />

          {message ? (
            <p className="mt-3 border-l-2 border-blue-600 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {message}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
        </section>
        ) : null}

        {isGene ? (
        <section className="py-5">
          <div className="flex justify-between">
            <div>
              <h3 className="text-sm font-bold">
                <span className="mr-2 text-xs text-[#3446B8]">
                  04
                </span>
                유전자 분석
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                유전자 분석 API 연결 대기
              </p>
            </div>

            <button
              disabled
              className="rounded-md bg-slate-300 px-3 py-2 text-xs font-semibold text-white"
            >
              분석 실행
            </button>
          </div>

          <AnalysisProgress
            status={
              item.latest_gene_analysis?.status
            }
          />

          <div className="mt-3">
            <AnalysisStatus
              status={
                item.latest_gene_analysis?.status
              }
            />
          </div>

          <AiResultButton
            status={item.latest_gene_analysis?.status}
            onClick={() => setIsResultOpen(true)}
          />
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
                    {isSubtype
                      ? "아형분류 AI 결과"
                      : isPdl1
                        ? "PD-L1 AI 결과"
                        : "유전자 AI 결과"}
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
              {isSubtype ? (
                pathologyResult ? (
                  <>
                    <dl className="grid grid-cols-2 gap-5 border-y border-slate-200 py-4 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-slate-500">예측 아형</dt>
                        <dd className="mt-1 font-bold text-slate-900">
                          {pathologyResult.predicted_subtype ??
                            pathologyResult.predicted_histologic_type ??
                            "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">아형 신뢰도</dt>
                        <dd className="mt-1 font-bold text-slate-900">
                          {percent(pathologyResult.subtype_confidence)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">악성 판정</dt>
                        <dd className="mt-1 font-bold text-slate-900">
                          {pathologyResult.malignancy_assessment_label ?? "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">악성 확률</dt>
                        <dd className="mt-1 font-bold text-slate-900">
                          {percent(pathologyResult.malignancy_probability)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="flex min-h-64 flex-col items-center justify-center border border-slate-300 bg-slate-950 px-4 text-center text-slate-200">
                        <p className="font-semibold">원본 조직영상</p>
                        <p className="mt-2 text-xs text-slate-400">
                          {item.latest_wsi
                            ? `${item.latest_wsi.slide_code} · ${item.latest_wsi.original_filename}`
                            : "연결된 WSI가 없습니다."}
                        </p>
                      </div>
                      <div className="flex min-h-64 items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-500">
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
                  <div className="space-y-5">
                    <dl className="grid grid-cols-2 gap-5 border-y border-slate-200 py-4 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-slate-500">TPS 예측 구간</dt>
                        <dd className="mt-1 text-xl font-bold text-blue-800">
                          {pdl1Result.predicted_tps_range_label ?? "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Confidence</dt>
                        <dd className="mt-1 font-bold text-slate-900">
                          {percent(pdl1Result.confidence)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">모델명</dt>
                        <dd className="mt-1 font-bold text-slate-900">
                          {pdl1?.model_name ?? "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">모델 버전</dt>
                        <dd className="mt-1 font-bold text-slate-900">
                          {pdl1?.model_version_name ?? "-"}
                        </dd>
                      </div>
                    </dl>

                    <div>
                      <h3 className="text-sm font-bold text-slate-800">
                        Probabilities
                      </h3>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                        {Object.entries(pdl1Result.probabilities ?? {}).map(
                          ([key, value]) => (
                            <div
                              key={key}
                              className="flex justify-between border-b border-slate-200 px-2 py-2"
                            >
                              <dt className="text-slate-500">{key}</dt>
                              <dd className="font-semibold text-slate-800">
                                {percent(value)}
                              </dd>
                            </div>
                          ),
                        )}
                      </dl>
                    </div>
                  </div>
                ) : (
                  <StateMessage
                    variant="empty"
                    title="저장된 AI 결과 상세가 없습니다."
                  />
                )
              ) : null}

              {isGene ? (
                geneResults.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Gene</th>
                          <th className="px-4 py-3">결과</th>
                          <th className="px-4 py-3 text-right">Probability</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {geneTargets.map((gene) => {
                          const result = geneResults.find(
                            (entry) => entry.gene_symbol === gene.symbol,
                          );

                          return (
                            <tr key={gene.symbol}>
                              <td className="px-4 py-3 font-bold">
                                {gene.label}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-700">
                                {geneStatus(result?.predicted_status)}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-600">
                                {percent(result?.predicted_probability)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <StateMessage
                    variant="empty"
                    title="저장된 AI 결과 상세가 없습니다."
                  />
                )
              ) : null}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E2E5F2] bg-[#F7F8FC] px-5 py-4 sm:px-6">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {item.workflow_status === "REVIEW_COMPLETED"
                    ? "의사 판독 완료"
                    : "의사 제출 API 연결 대기"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  현재 단계에서는 결과 제출 요청을 전송하지 않습니다.
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
                  disabled
                  className="rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  의사에게 제출
                </button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default function PathologyDashboardPage() {
  const [items, setItems] = useState<
    PathologyWorkstationItem[]
  >([]);

  const [selectedId, setSelectedId] = useState<
    string | null
  >(null);

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

     pathologyTestType:
      tab === "worklist" &&
      examFilter !== "ALL"
        ? examFilter
        : undefined,

      workflowStatus:
        tab === "worklist" &&
        workflowStatusFilter !== "ALL"
          ? workflowStatusFilter
          : undefined,

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

        setSelectedId((current) =>
          nextItems.some(
            (item) => item.id === current,
          )
            ? current
            : null,
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

    return nonCancelled;
  }, [items, tab]);

  const selected =
    items.find(
      (item) => item.id === selectedId,
    ) ?? null;

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
    setSelectedId(null);
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
    <div className="min-w-0">
      <nav className="overflow-x-auto border-b border-[#E2E5F2] bg-white">
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
                className={`rounded-t-lg border-b-2 px-2 py-3 text-sm font-semibold transition ${
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

      <div className="mx-auto w-full max-w-[1760px] px-4 py-3 sm:px-6 sm:py-4">
        <div className="grid overflow-hidden rounded-xl border border-[#E2E5F2] bg-white shadow-sm xl:h-[calc(100vh-141px)] xl:min-h-[620px] xl:grid-cols-[minmax(420px,32fr)_minmax(0,68fr)] xl:divide-x xl:divide-[#E2E5F2]">
          <div className="grid min-h-0 grid-rows-[minmax(0,62fr)_minmax(0,38fr)] divide-y divide-[#E2E5F2]">
            <section className="flex min-h-0 flex-col">
              <div className="flex flex-wrap items-center gap-3 border-b border-[#E2E5F2] bg-[#F9FAFF] px-4 py-3">
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

                        <option value="SUBTYPE">
                          아형분류 검사
                        </option>

                        <option value="PDL1">
                          PD-L1 검사
                        </option>

                        <option value="GENE">
                          유전자 검사
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

                        <option value="SCHEDULED">
                          예약중
                        </option>

                        <option value="SPECIMEN_COMPLETED">
                          조직검사 완료
                        </option>

                        <option value="AI_COMPLETED">
                          AI 분석 완료
                        </option>

                        <option value="REVIEW_COMPLETED">
                          의사 판독 완료
                        </option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>

              {loading ? (
                <StateMessage
                  variant="loading"
                  title="Worklist를 불러오는 중입니다."
                  className="m-4"
                />
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
                          key={item.id}
                          tabIndex={0}
                          onClick={() =>
                            setSelectedId(
                              item.id,
                            )
                          }
                          onKeyDown={(
                            event,
                          ) => {
                            if (
                              event.key ===
                              "Enter"
                            ) {
                              setSelectedId(
                                item.id,
                              );
                            }
                          }}
                          className={`cursor-pointer border-b border-l-[3px] border-[#E8EAF3] transition hover:bg-[#F7F8FF] ${
                            selectedId ===
                            item.id
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
                            {item.pathology_test_type_label ?? "-"}
                          </td>

                          <td className="px-3 py-2.5">
                            <span className="whitespace-nowrap font-semibold">
                              {workflowDisplayStatus(
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
            ) : (
              <StateMessage
                variant="empty"
                title="환자를 선택하세요."
                className="m-4"
              />
            )}
          </div>

          {selected ? (
            <WorkArea
              key={selected.id}
              item={selected}
            />
          ) : (
            <StateMessage
              variant="empty"
              title="병리 작업을 선택하세요."
              className="m-6 self-start"
            />
          )}
        </div>
      </div>
    </div>
  );
}
