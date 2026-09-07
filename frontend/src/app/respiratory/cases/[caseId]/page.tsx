"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type CaseDetail = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  current_stage: string;
  case_status: string;
  created_at: string;
  updated_at: string;
};

export default function RespiratoryCaseDetailPage() {
  const params = useParams();
  const router = useRouter();

  const caseId = params.caseId as string;

  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchCaseDetail = async () => {
      try {
        setLoading(true);
        setError("");

        const loginResponse = await fetch(
          "http://127.0.0.1:8000/api/auth/staff/login/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              hospital_code: "SUMIT001",
              username: "doctor01",
              password: "test1234",
            }),
          }
        );

        if (!loginResponse.ok) {
          throw new Error("의료진 로그인에 실패했습니다.");
        }

        const loginData = await loginResponse.json();

        const response = await fetch(
          `http://127.0.0.1:8000/api/doctor/cases/${caseId}/`,
          {
            headers: {
              Authorization: `Bearer ${loginData.access}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Case 정보를 불러오지 못했습니다.");
        }

        const data = await response.json();
        setCaseDetail(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Case 조회 중 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    };

    if (caseId) {
      fetchCaseDetail();
    }
  }, [caseId]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
        Case 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (error || !caseDetail) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600">
        {error || "Case를 찾을 수 없습니다."}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.push("/respiratory/cases")}
            className="mb-3 text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            ← 담당 Case 목록
          </button>

          <h1 className="text-2xl font-bold text-slate-800">
            {caseDetail.patient_name}
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {caseDetail.patient_code} · {caseDetail.case_code}
          </p>
        </div>

        <StageBadge stage={caseDetail.current_stage} />
      </div>

      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800">
          Case 기본 정보
        </h2>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <InfoCard
            label="환자"
            value={caseDetail.patient_name}
          />

          <InfoCard
            label="환자번호"
            value={caseDetail.patient_code}
          />

          <InfoCard
            label="Case 번호"
            value={caseDetail.case_code}
          />

          <InfoCard
            label="현재 단계"
            value={getStageLabel(caseDetail.current_stage)}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          진료 업무
        </h2>

        <div className="grid grid-cols-4 gap-4">
          <ActionCard
            title="검사 결과"
            description="확정된 임상 결과 조회"
            onClick={() =>
              router.push(`/respiratory/results?caseId=${caseId}`)
            }
          />

          <ActionCard
            title="AI 분석"
            description="AI 예측 및 임상 결과 비교"
            onClick={() =>
              router.push(`/respiratory/ai-analysis?caseId=${caseId}`)
            }
          />

          <ActionCard
            title="치료 결정"
            description="Regimen 후보 및 치료계획 검토"
            onClick={() =>
              router.push(`/respiratory/treatment?caseId=${caseId}`)
            }
          />

          <ActionCard
            title="처방 관리"
            description="처방 및 Safety Check"
            onClick={() =>
              router.push(`/respiratory/prescriptions?caseId=${caseId}`)
            }
          />
        </div>
      </section>
    </div>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-emerald-50/50 px-5 py-4">
      <p className="text-xs font-medium text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-slate-700">
        {value}
      </p>
    </div>
  );
}

function ActionCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-emerald-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/40"
    >
      <p className="font-bold text-slate-800">
        {title}
      </p>

      <p className="mt-2 text-xs leading-5 text-slate-400">
        {description}
      </p>

      <p className="mt-5 text-xs font-semibold text-emerald-600">
        바로가기 →
      </p>
    </button>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">
      {getStageLabel(stage)}
    </span>
  );
}

function getStageLabel(stage: string) {
  if (stage === "XRAY") return "X-ray";
  if (stage === "CT") return "CT";
  if (stage === "PATHOLOGY") return "병리";
  if (stage === "STAGING") return "TNM";
  if (stage === "GENE") return "유전자";
  if (stage === "TREATMENT") return "치료 결정";
  if (stage === "PRESCRIPTION") return "처방";
  return stage;
}