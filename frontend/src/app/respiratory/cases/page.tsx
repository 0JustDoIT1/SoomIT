"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRespiratoryAuth } from "../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../_lib/respiratory-api";

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

export default function RespiratoryCasesPage() {
  const router = useRouter();
  const { authorizedFetch } = useRespiratoryAuth();

  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchCases = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/`);

        if (!response.ok) {
          throw new Error("담당 Case 목록을 불러오지 못했습니다.");
        }

        const data = await response.json();
        setCases(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Case 목록 조회 중 오류가 발생했습니다."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchCases();
  }, [authorizedFetch]);

  const filteredCases = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) return cases;

    return cases.filter((item) => {
      return (
        item.patient_name.toLowerCase().includes(keyword) ||
        item.patient_code.toLowerCase().includes(keyword) ||
        item.case_code.toLowerCase().includes(keyword)
      );
    });
  }, [cases, search]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
        담당 Case를 불러오는 중입니다.
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
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            담당 Case
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            담당 환자의 진료 단계와 진행 상태를 확인합니다.
          </p>
        </div>

        <div className="rounded-xl bg-emerald-50 px-4 py-3">
          <span className="text-xs text-slate-500">
            진행 중 Case
          </span>

          <span className="ml-3 text-lg font-bold text-emerald-600">
            {cases.filter((item) => item.case_status === "ACTIVE").length}
          </span>
        </div>
      </div>

      <section className="rounded-2xl border border-emerald-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="font-bold text-slate-800">
              Case 목록
            </h2>

            <p className="mt-1 text-xs text-slate-400">
              환자명, 환자번호 또는 Case 번호로 검색할 수 있습니다.
            </p>
          </div>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="환자명 / 환자번호 / Case 번호"
            className="w-72 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white"
          />
        </div>

        <div className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-emerald-50/50">
              <tr className="text-left text-xs font-semibold text-slate-500">
                <th className="px-5 py-4">
                  환자
                </th>

                <th className="px-5 py-4">
                  환자번호
                </th>

                <th className="px-5 py-4">
                  Case 번호
                </th>

                <th className="px-5 py-4">
                  현재 단계
                </th>

                <th className="px-5 py-4">
                  상태
                </th>

                <th className="px-5 py-4">
                  최근 변경
                </th>

                <th className="px-5 py-4 text-right">
                  상세
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredCases.map((caseItem) => (
                <tr
                  key={caseItem.id}
                  className="transition hover:bg-emerald-50/30"
                >
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-slate-700">
                      {caseItem.patient_name}
                    </p>
                  </td>

                  <td className="px-5 py-4 text-sm text-slate-500">
                    {caseItem.patient_code}
                  </td>

                  <td className="px-5 py-4 text-sm text-slate-500">
                    {caseItem.case_code}
                  </td>

                  <td className="px-5 py-4">
                    <StageBadge stage={caseItem.current_stage} />
                  </td>

                  <td className="px-5 py-4">
                    <CaseStatusBadge status={caseItem.case_status} />
                  </td>

                  <td className="px-5 py-4 text-xs text-slate-400">
                    {formatDateTime(caseItem.updated_at)}
                  </td>

                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/respiratory/cases/${caseItem.id}`
                        )
                      }
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50"
                    >
                      보기
                    </button>
                  </td>
                </tr>
              ))}

              {filteredCases.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-sm text-slate-400"
                  >
                    조건에 맞는 Case가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
      {getStageLabel(stage)}
    </span>
  );
}

function CaseStatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") {
    return (
      <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-600">
        진행중
      </span>
    );
  }

  if (status === "REFERRED_OUT") {
    return (
      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-600">
        전원
      </span>
    );
  }

  if (status === "CLOSED") {
    return (
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
        종결
      </span>
    );
  }

  return (
    <span className="text-xs text-slate-500">
      {status}
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

function formatDateTime(value: string) {
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
}
