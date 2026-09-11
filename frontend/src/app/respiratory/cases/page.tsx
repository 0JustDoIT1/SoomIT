"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  updated_at: string;
};

const STAGE_LABELS: Record<string, string> = {
  XRAY: "흉부 X선",
  CT: "흉부 CT",
  PATHOLOGY: "병리",
  STAGING: "TNM 병기",
  GENE: "바이오마커",
  TREATMENT: "치료 결정",
  PRESCRIPTION: "처방",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "진행 중",
  REFERRED_OUT: "전원",
  CLOSED: "종결",
};

function readCaseList(payload: unknown): CaseItem[] {
  if (Array.isArray(payload)) return payload as CaseItem[];
  if (
    payload &&
    typeof payload === "object" &&
    "results" in payload &&
    Array.isArray(payload.results)
  ) {
    return payload.results as CaseItem[];
  }
  return [];
}

export default function RespiratoryCasesPage() {
  const router = useRouter();
  const { authorizedFetch } = useRespiratoryAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const fetchCases = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/`,
        { signal },
      );
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("호흡기내과 Case 조회 권한이 없습니다.");
        }
        throw new Error("담당 Case 목록을 불러오지 못했습니다.");
      }
      setCases(readCaseList(await response.json()));
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
        return;
      }
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Case 목록 조회 중 오류가 발생했습니다.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const controller = new AbortController();
    const requestTimer = window.setTimeout(() => {
      void fetchCases(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(requestTimer);
      controller.abort();
    };
  }, [fetchCases]);

  const filteredCases = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return cases;

    return cases.filter((item) =>
      [item.patient_name, item.patient_code, item.case_code].some((value) =>
        value?.toLowerCase().includes(keyword),
      ),
    );
  }, [cases, search]);

  return (
    <div className="h-full overflow-auto bg-slate-50 px-6 py-5">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-5 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-blue-600">호흡기내과 진료 업무</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">담당 Case 선택</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              환자와 Case를 확인한 뒤 통합 진료 화면을 여세요.
            </p>
          </div>
          <div className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            조회된 Case <strong className="ml-2 text-slate-900">{cases.length}건</strong>
          </div>
        </header>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-900">담당 Case 목록</h2>
              <p className="mt-1 text-xs text-slate-500">실제 API에서 조회된 Case만 표시합니다.</p>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="환자명, 환자번호, Case 검색"
              aria-label="담당 Case 검색"
              className="w-80 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {loading ? (
            <EmptyState title="담당 Case를 불러오는 중입니다." />
          ) : error ? (
            <EmptyState title={error}>
              <button
                type="button"
                onClick={() => void fetchCases()}
                className="mt-4 rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                다시 시도
              </button>
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full table-fixed">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="w-[22%] whitespace-nowrap px-5 py-3">환자</th>
                    <th className="w-[18%] whitespace-nowrap px-5 py-3">Case 번호</th>
                    <th className="w-[17%] whitespace-nowrap px-5 py-3">현재 단계</th>
                    <th className="w-[15%] whitespace-nowrap px-5 py-3">Case 상태</th>
                    <th className="w-[18%] whitespace-nowrap px-5 py-3">최근 업데이트</th>
                    <th className="w-[10%] px-5 py-3 text-right">업무</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCases.map((caseItem) => (
                    <tr
                      key={caseItem.id}
                      className="cursor-pointer transition hover:bg-blue-50/60"
                      onClick={() => router.push(`/respiratory/cases/${caseItem.id}`)}
                    >
                      <td className="px-5 py-4">
                        <p className="truncate text-sm font-semibold text-slate-800">{caseItem.patient_name || "-"}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{caseItem.patient_code || "-"}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">{caseItem.case_code || "-"}</td>
                      <td className="whitespace-nowrap px-5 py-4"><Badge label={STAGE_LABELS[caseItem.current_stage] ?? caseItem.current_stage ?? "-"} tone="blue" /></td>
                      <td className="whitespace-nowrap px-5 py-4"><Badge label={STATUS_LABELS[caseItem.case_status] ?? caseItem.case_status ?? "-"} tone="slate" /></td>
                      <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{formatDateTime(caseItem.updated_at)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/respiratory/cases/${caseItem.id}`);
                          }}
                          className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          통합 진료 열기
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredCases.length === 0 && (
                    <tr><td colSpan={6}><EmptyState title={search ? "검색 조건에 맞는 Case가 없습니다." : "현재 배정된 Case가 없습니다."} /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: "blue" | "slate" }) {
  const color = tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>{label}</span>;
}

function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center text-sm text-slate-500"><p>{title}</p>{children}</div>;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
