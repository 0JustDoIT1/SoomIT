"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type CaseItem = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  current_stage: string;
  case_status: string;
  created_at: string;
  updated_at: string;
};

export default function RespiratoryDashboardPage() {
  const router = useRouter();

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchCases = async () => {
      try {
        setLoading(true);
        setError("");

        const loginResponse = await fetch("http://127.0.0.1:8000/api/auth/staff/login/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                hospital_code: "SUMIT001",
                username: "doctor01",
                password: "test1234",
            }),
            });

            if (!loginResponse.ok) {
            throw new Error("의료진 로그인에 실패했습니다.");
            }

            const loginData = await loginResponse.json();
            const accessToken = loginData.access;

            const response = await fetch("http://127.0.0.1:8000/api/doctor/cases/", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            });

        if (!response.ok) {
          throw new Error("담당 Case 정보를 불러오지 못했습니다.");
        }

        const data = await response.json();
        setCases(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "대시보드 조회 중 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchCases();
  }, []);

  const activeCases = useMemo(
    () => cases.filter((item) => item.case_status === "ACTIVE"),
    [cases]
  );

  const resultReviewCount = useMemo(
    () =>
      activeCases.filter((item) =>
        ["CT", "PATHOLOGY", "STAGING", "GENE"].includes(item.current_stage)
      ).length,
    [activeCases]
  );

  const treatmentCount = useMemo(
    () =>
      activeCases.filter((item) => item.current_stage === "TREATMENT").length,
    [activeCases]
  );

  const prescriptionCount = useMemo(
    () =>
      activeCases.filter((item) => item.current_stage === "PRESCRIPTION")
        .length,
    [activeCases]
  );

  const recentCases = useMemo(
    () =>
      [...activeCases]
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() -
            new Date(a.updated_at).getTime()
        )
        .slice(0, 6),
    [activeCases]
  );

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
        대시보드 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          호흡기내과 대시보드
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          담당 Case와 진료 의사결정 업무 현황을 확인합니다.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="담당 Case"
          value={activeCases.length}
          description="현재 진행 중"
        />

        <StatCard
          title="검사결과 확인"
          value={resultReviewCount}
          description="결과 검토 필요"
        />

        <StatCard
          title="치료 결정"
          value={treatmentCount}
          description="치료계획 검토"
        />

        <StatCard
          title="처방 진행"
          value={prescriptionCount}
          description="처방 단계"
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-5">
        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">
                최근 담당 Case
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                최근 변경된 담당 환자를 확인합니다.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/respiratory/cases")}
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              전체 보기
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {recentCases.map((caseItem) => (
              <button
                key={caseItem.id}
                type="button"
                onClick={() =>
                  router.push(`/respiratory/cases/${caseItem.id}`)
                }
                className="flex w-full items-center justify-between py-4 text-left hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {caseItem.patient_name}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    {caseItem.patient_code} · {caseItem.case_code}
                  </p>
                </div>

                <StageBadge stage={caseItem.current_stage} />
              </button>
            ))}

            {recentCases.length === 0 && (
              <div className="py-8 text-center text-sm text-slate-400">
                담당 Case가 없습니다.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl bg-emerald-50/60 p-5">
          <h2 className="font-bold text-slate-800">
            업무 Queue
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            현재 단계별 처리 필요 업무입니다.
          </p>

          <div className="mt-5 space-y-3">
            <QueueRow
              label="검사결과 확인"
              value={resultReviewCount}
              onClick={() => router.push("/respiratory/results")}
            />

            <QueueRow
              label="치료 결정"
              value={treatmentCount}
              onClick={() => router.push("/respiratory/treatment")}
            />

            <QueueRow
              label="처방 관리"
              value={prescriptionCount}
              onClick={() => router.push("/respiratory/prescriptions")}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-bold text-slate-800">
          {value}
        </span>

        <span className="pb-1 text-xs text-slate-400">
          건
        </span>
      </div>

      <p className="mt-2 text-xs text-emerald-600">
        {description}
      </p>
    </div>
  );
}

function QueueRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl bg-white px-4 py-4 text-left transition hover:bg-emerald-100/50"
    >
      <span className="text-sm font-medium text-slate-600">
        {label}
      </span>

      <span className="text-sm font-bold text-emerald-600">
        {value}건
      </span>
    </button>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
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