"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type LungCancerCase = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  current_stage: string;
  case_status: string;
  created_at: string;
  updated_at: string;
};

export default function CasesPage() {
  const router = useRouter();

  const [cases, setCases] = useState<LungCancerCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");

  useEffect(() => {
    const fetchCases = async () => {
      try {
        setError("");

        const response = await fetch(
          "http://127.0.0.1:8000/api/cases/"
        );

        if (!response.ok) {
          throw new Error("Case 목록을 불러오지 못했습니다.");
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
  }, []);

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

  const filteredCases = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return cases.filter((caseItem) => {
      const matchesSearch =
        keyword === "" ||
        caseItem.case_code.toLowerCase().includes(keyword) ||
        caseItem.patient_name.toLowerCase().includes(keyword) ||
        caseItem.patient_code.toLowerCase().includes(keyword);

      const matchesStatus =
        statusFilter === "ALL" ||
        caseItem.case_status === statusFilter;

      const matchesStage =
        stageFilter === "ALL" ||
        caseItem.current_stage === stageFilter;

      return matchesSearch && matchesStatus && matchesStage;
    });
  }, [cases, searchTerm, statusFilter, stageFilter]);

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setStageFilter("ALL");
  };

  const formatDate = (value: string) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString("ko-KR");
  };

  return (
    <div>
      {/* 페이지 상단 */}
      <div className="mb-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">
                Case 목록
              </h1>

              <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">
                총 {cases.length}건
              </span>
            </div>

            <p className="mt-2 text-sm text-slate-500">
              폐암 Case의 현재 진행 단계와 상태를 조회합니다.
            </p>
          </div>
        </div>

        {/* 검색 / 필터 */}
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="min-w-[260px] flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Case ID, 환자명, 환자번호 검색"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-pink-300 focus:bg-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-pink-300"
          >
            <option value="ALL">상태 전체</option>
            <option value="ACTIVE">진행중</option>
            <option value="REFERRED_OUT">전원</option>
            <option value="CLOSED">종결</option>
          </select>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 outline-none focus:border-pink-300"
          >
            <option value="ALL">단계 전체</option>
            <option value="XRAY">X-ray</option>
            <option value="CT">CT</option>
            <option value="PATHOLOGY">병리</option>
            <option value="STAGING">TNM 병기</option>
            <option value="GENE">유전자 검사</option>
            <option value="TREATMENT">치료 의사결정</option>
            <option value="PRESCRIPTION">처방</option>
          </select>

          <button
            type="button"
            onClick={resetFilters}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-500 transition hover:bg-slate-50"
          >
            초기화
          </button>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl bg-white p-6 text-sm text-slate-500 shadow-sm">
          Case 정보를 불러오는 중입니다.
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 p-6 text-sm text-red-600">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <p className="text-sm font-semibold text-slate-700">
              Case 목록
            </p>

            <p className="mt-1 text-xs text-slate-400">
              검색 결과 {filteredCases.length}건
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-pink-50/70 text-sm text-slate-600">
                <tr>
                  <th className="px-5 py-4 font-semibold">Case ID</th>
                  <th className="px-5 py-4 font-semibold">환자명</th>
                  <th className="px-5 py-4 font-semibold">환자번호</th>
                  <th className="px-5 py-4 font-semibold">현재 단계</th>
                  <th className="px-5 py-4 font-semibold">Case 상태</th>
                  <th className="px-5 py-4 font-semibold">등록일</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCases.map((caseItem) => (
                  <tr
                    key={caseItem.id}
                    onClick={() =>
                      router.push(
                        `/coordinator/cases/${caseItem.id}`
                      )
                    }
                    className="cursor-pointer text-sm text-slate-700 transition hover:bg-pink-50/40"
                  >
                    <td className="px-5 py-4 font-semibold text-slate-800">
                      {caseItem.case_code}
                    </td>

                    <td className="px-5 py-4 font-medium">
                      {caseItem.patient_name}
                    </td>

                    <td className="px-5 py-4">
                      {caseItem.patient_code}
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                        {getStageLabel(caseItem.current_stage)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {getCaseStatusLabel(caseItem.case_status)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {formatDate(caseItem.created_at)}
                    </td>
                  </tr>
                ))}

                {filteredCases.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-sm text-slate-400"
                    >
                      검색 조건에 해당하는 Case가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}