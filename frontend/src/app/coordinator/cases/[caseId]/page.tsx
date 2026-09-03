"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ClinicianDecision = {
  id: string;
  source_stage: string;
  decision_type: string;
  target_stage: string | null;
  reason: string | null;
  decided_by: string;
  decided_at: string;
};

type LungCancerCase = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  current_stage: string;
  case_status: string;
  created_at: string;
  updated_at: string;
  latest_clinician_decision: ClinicianDecision | null;
};

const STAGES = [
  "XRAY",
  "CT",
  "PATHOLOGY",
  "STAGING",
  "GENE",
  "TREATMENT",
  "PRESCRIPTION",
];

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();

  const caseId = params.caseId as string;

  const [caseData, setCaseData] =
    useState<LungCancerCase | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchCaseDetail = async () => {
      try {
        const response = await fetch(
          `http://127.0.0.1:8000/api/cases/${caseId}/`
        );

        if (!response.ok) {
          throw new Error("Case 상세 정보를 불러오지 못했습니다.");
        }

        const data = await response.json();
        setCaseData(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Case 상세 조회 중 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    };

    if (caseId) {
      fetchCaseDetail();
    }
  }, [caseId]);

  const getStageLabel = (stage: string) => {
    if (stage === "XRAY") return "X-ray";
    if (stage === "CT") return "CT";
    if (stage === "PATHOLOGY") return "병리";
    if (stage === "STAGING") return "TNM 병기";
    if (stage === "GENE") return "유전자 검사";
    if (stage === "TREATMENT") return "치료 의사결정";
    if (stage === "PRESCRIPTION") return "처방";

    return stage;
  };

  const getCaseStatusLabel = (status: string) => {
    if (status === "ACTIVE") return "진행중";
    if (status === "REFERRED_OUT") return "전원";
    if (status === "CLOSED") return "종결";

    return status;
  };

  const getDecisionTypeLabel = (type: string) => {
    if (type === "PROCEED_NEXT_STAGE") {
      return "다음 단계 진행";
    }

    if (type === "REPEAT_EXAMINATION") {
      return "재검사";
    }

    if (type === "REFERRED_OUT") {
      return "전원";
    }

    if (type === "CLOSE_CASE") {
      return "Case 종결";
    }

    return type;
  };

  const formatDateTime = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
        Case 상세 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600">
        {error || "Case 정보가 없습니다."}
      </div>
    );
  }

  const currentStageIndex = STAGES.indexOf(
    caseData.current_stage
  );

  const decision = caseData.latest_clinician_decision;

  return (
    <div>
      {/* 상단 */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => router.push("/coordinator/cases")}
          className="mb-4 text-sm font-medium text-slate-500 transition hover:text-pink-500"
        >
          ← Case 목록으로
        </button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">
                {caseData.case_code}
              </h1>

              <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">
                {getCaseStatusLabel(caseData.case_status)}
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              환자의 폐암 진단·치료 진행 현황을 조회합니다.
            </p>
          </div>
        </div>
      </div>

      {/* 기본 정보 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-400">
            환자 정보
          </p>

          <h2 className="mt-2 text-lg font-bold text-slate-800">
            {caseData.patient_name}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {caseData.patient_code}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-400">
            현재 단계
          </p>

          <h2 className="mt-2 text-lg font-bold text-slate-800">
            {getStageLabel(caseData.current_stage)}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            최근 업데이트 {formatDateTime(caseData.updated_at)}
          </p>
        </div>
      </div>

      {/* Case 진행 현황 */}
      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            Case 진행 현황
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            현재 Case 단계 기준 진행 위치입니다.
          </p>
        </div>

        <div className="mt-7">
          {STAGES.map((stage, index) => {
            const isCurrent =
              stage === caseData.current_stage;

            const isPrevious =
              currentStageIndex >= 0 &&
              index < currentStageIndex;

            return (
              <div
                key={stage}
                className="relative flex gap-4 pb-7 last:pb-0"
              >
                {index !== STAGES.length - 1 && (
                  <div className="absolute left-[15px] top-8 h-full w-px bg-slate-200" />
                )}

                <div
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCurrent
                      ? "bg-pink-500 text-white"
                      : isPrevious
                      ? "bg-sky-100 text-sky-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {index + 1}
                </div>

                <div className="pt-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-sm font-semibold ${
                        isCurrent
                          ? "text-pink-600"
                          : isPrevious
                          ? "text-slate-700"
                          : "text-slate-400"
                      }`}
                    >
                      {getStageLabel(stage)}
                    </p>

                    {isCurrent && (
                      <span className="rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-medium text-pink-500">
                        현재 단계
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 의료진 확정 결과 */}
      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              의료진 확정 결과
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              의료진이 확정한 최근 단계 진행 결정을 조회합니다.
            </p>
          </div>

          {decision && (
            <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">
              {getDecisionTypeLabel(decision.decision_type)}
            </span>
          )}
        </div>

        {decision ? (
          <div className="mt-5">
            <div className="rounded-2xl bg-pink-50/50 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <DetailItem
                  label="결정 유형"
                  value={getDecisionTypeLabel(
                    decision.decision_type
                  )}
                />

                <DetailItem
                  label="확정 의료진"
                  value={decision.decided_by}
                />

                <DetailItem
                  label="기준 단계"
                  value={getStageLabel(
                    decision.source_stage
                  )}
                />

                <DetailItem
                  label="이동 단계"
                  value={
                    decision.target_stage
                      ? getStageLabel(
                          decision.target_stage
                        )
                      : "-"
                  }
                />

                <DetailItem
                  label="확정 시각"
                  value={formatDateTime(
                    decision.decided_at
                  )}
                />
              </div>

              <div className="mt-4 rounded-xl bg-white p-4">
                <p className="text-xs font-medium text-slate-400">
                  결정 사유
                </p>

                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {decision.reason || "등록된 사유가 없습니다."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-400">
            아직 등록된 의료진 확정 결과가 없습니다.
          </div>
        )}
      </div>

      {/* Case 기본정보 */}
      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">
          Case 기본정보
        </h2>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <DetailItem
            label="Case ID"
            value={caseData.case_code}
          />

          <DetailItem
            label="Case 상태"
            value={getCaseStatusLabel(caseData.case_status)}
          />

          <DetailItem
            label="생성일"
            value={formatDateTime(caseData.created_at)}
          />

          <DetailItem
            label="최근 수정일"
            value={formatDateTime(caseData.updated_at)}
          />
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <p className="text-xs text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-slate-700">
        {value}
      </p>
    </div>
  );
}