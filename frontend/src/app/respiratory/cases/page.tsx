"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useRespiratoryAuth } from "../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../_lib/respiratory-api";
import { getCaseListFetchError, getCaseListHttpError } from "./case-list-errors";
import { getCaseListEmptyState } from "./case-list-empty-state";
import { CASES_PER_PAGE, getVisiblePageNumbers, paginateCases } from "./case-pagination";

type CaseItem = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  current_stage: string;
  case_status: string;
  updated_at: string;
};

type StaffNotification = { id: string; title: string; message: string; case_id: string | null; case_code: string | null; created_at: string; read_at: string | null };
type NotificationResponse = { unread_count: number; results: StaffNotification[] };

const STAGE_LABELS: Record<string, string> = {
  XRAY: "흉부 X선",
  CT: "흉부 CT",
  PATHOLOGY_GENE: "조직/유전자",
  PET_CT_TNM: "PET-CT / TNM 병기",
  PDL1: "PD-L1",
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
  const [currentPage, setCurrentPage] = useState(1);
  const [notifications, setNotifications] = useState<NotificationResponse>({ unread_count: 0, results: [] });

  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/notifications/me/?limit=5`, { signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setNotifications({
        unread_count: Number(data.unread_count) || 0,
        results: Array.isArray(data.results) ? data.results : [],
      });
    } catch {
      // The notification center in the common layout exposes its own error state.
    }
  }, [authorizedFetch]);

  const fetchCases = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");

    try {
      const response = await authorizedFetch(
        `${API_BASE_URL}/api/doctor/cases/`,
        { signal },
      );
      if (!response.ok) {
        throw new Error(getCaseListHttpError(response.status));
      }
      setCases(readCaseList(await response.json()));
      setCurrentPage(1);
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
        return;
      }
      setError(getCaseListFetchError(fetchError));
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

  useEffect(() => {
    const controller = new AbortController();
    const requestTimer = window.setTimeout(() => void fetchNotifications(controller.signal), 0);
    const interval = window.setInterval(() => void fetchNotifications(), 30_000);
    return () => {
      window.clearTimeout(requestTimer);
      window.clearInterval(interval);
      controller.abort();
    };
  }, [fetchNotifications]);

  const openNotification = useCallback(async (notification: StaffNotification) => {
    if (!notification.read_at) {
      const response = await authorizedFetch(
        `${API_BASE_URL}/api/notifications/me/${notification.id}/read/`,
        { method: "PATCH" },
      );
      if (response.ok) {
        setNotifications((current) => ({
          unread_count: Math.max(current.unread_count - 1, 0),
          results: current.results.map((item) => item.id === notification.id
            ? { ...item, read_at: new Date().toISOString() }
            : item),
        }));
      }
    }
    if (notification.case_id) router.push(`/respiratory/cases/${notification.case_id}`);
  }, [authorizedFetch, router]);

  const filteredCases = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return cases;

    return cases.filter((item) =>
      [item.patient_name, item.patient_code, item.case_code].some((value) =>
        value?.toLowerCase().includes(keyword),
      ),
    );
  }, [cases, search]);

  const pagination = useMemo(() => paginateCases(filteredCases, currentPage), [filteredCases, currentPage]);
  const visiblePages = getVisiblePageNumbers(pagination.page, pagination.pageCount);
  const emptyState = getCaseListEmptyState(search);
  const activeCases = cases.filter((item) => item.case_status === "ACTIVE");
  const today = new Date().toLocaleDateString("en-CA");
  const updatedToday = cases.filter((item) => item.updated_at && new Date(item.updated_at).toLocaleDateString("en-CA") === today).length;
  const currentStageCount = cases.filter((item) => item.current_stage === "XRAY" || item.current_stage === "CT").length;
  const recentCases = [...filteredCases].sort((left, right) => Date.parse(right.updated_at || "") - Date.parse(left.updated_at || ""));

  return (
    <div className="h-full overflow-auto bg-slate-50 px-6 py-5">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-5 flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold text-blue-600">호흡기내과 진료 업무</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">오늘의 진료 업무</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              우선 처리할 업무를 확인하고, 필요한 Case를 바로 여세요.
            </p>
          </div>
          <div className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            조회된 Case <strong className="ml-2 text-slate-900">{cases.length}건</strong>
          </div>
        </header>

        {!loading && !error && <>
          <section className="mb-5 grid grid-cols-4 gap-3">
            <DashboardMetric label="진행 중 Case" value={activeCases.length} description="현재 담당 중" />
            <DashboardMetric label="검사 진행 단계" value={currentStageCount} description="X-ray 또는 CT 단계" tone="blue" />
            <DashboardMetric label="새 알림" value={notifications.unread_count} description="미읽음 알림" tone="amber" />
            <DashboardMetric label="오늘 업데이트" value={updatedToday} description="Case 최근 변경" tone="emerald" />
          </section>

          <section className="mb-5 grid grid-cols-[minmax(0,1fr)_280px] gap-4">
            <div className="rounded-xl border border-blue-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-blue-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">지금 확인할 일</h2><p className="mt-1 text-xs text-slate-500">새 알림과 우선 확인이 필요한 업무입니다.</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{notifications.unread_count}건</span></div>
              {notifications.results.length ? <div className="divide-y divide-slate-100">{notifications.results.map((notification) => <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className={`flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition hover:bg-blue-50 ${notification.read_at ? "" : "bg-blue-50/40"}`}><div><p className="text-sm font-semibold text-slate-800">{notification.title}</p><p className="mt-1 text-xs text-slate-500">{notification.message}</p></div><span className="shrink-0 text-xs font-semibold text-blue-700">{notification.case_id ? "Case 확인 →" : "읽음 처리"}</span></button>)}</div> : <p className="px-5 py-7 text-center text-sm text-slate-400">새로 확인할 알림이 없습니다.</p>}
            </div>
            <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">빠른 이동</h2><div className="mt-3 space-y-2"><button type="button" onClick={() => router.push("/respiratory/schedules")} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">진료 일정 관리</button><button type="button" onClick={() => router.push("/respiratory/settings")} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">내 프로필·알림 설정</button></div></aside>
          </section>
        </>}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-900">최근 업데이트 Case</h2>
              <p className="mt-1 text-xs text-slate-500">현재 로그인한 담당의에게 배정된 Case를 최근 변경 순으로 확인합니다.</p>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }}
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
                  {paginateCases(recentCases, currentPage).items.map((caseItem) => (
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
                    <tr><td colSpan={6}><EmptyState title={emptyState.title} description={emptyState.description} /></td></tr>
                  )}
                </tbody>
              </table>
              {filteredCases.length > 0 && (
                <nav aria-label="Case 목록 페이지" className="flex items-center justify-between gap-4 border-t border-slate-200 px-5 py-3">
                  <p className="whitespace-nowrap text-xs text-slate-500">
                    총 {filteredCases.length}건 · {(pagination.page - 1) * CASES_PER_PAGE + 1}–{Math.min(pagination.page * CASES_PER_PAGE, filteredCases.length)}건 표시
                  </p>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={pagination.page === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">이전</button>
                    {visiblePages.map((page) => (
                      <button key={page} type="button" aria-label={`${page}페이지`} aria-current={pagination.page === page ? "page" : undefined} onClick={() => setCurrentPage(page)} className={`h-8 min-w-8 rounded-md px-2 text-xs font-semibold ${pagination.page === page ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{page}</button>
                    ))}
                    <button type="button" disabled={pagination.page === pagination.pageCount} onClick={() => setCurrentPage((page) => Math.min(pagination.pageCount, page + 1))} className="whitespace-nowrap rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">다음</button>
                  </div>
                </nav>
              )}
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

function DashboardMetric({ label, value, description, tone = "slate" }: { label: string; value: number; description: string; tone?: "slate" | "blue" | "amber" | "emerald" }) {
  const styles = { slate: "border-slate-200", blue: "border-blue-200 bg-blue-50/40", amber: "border-amber-200 bg-amber-50/40", emerald: "border-emerald-200 bg-emerald-50/40" };
  return <div className={`rounded-xl border bg-white p-4 shadow-sm ${styles[tone]}`}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}<span className="ml-1 text-sm font-medium text-slate-500">건</span></p><p className="mt-1 text-[11px] text-slate-400">{description}</p></div>;
}

function EmptyState({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return <div className="flex min-h-56 flex-col items-center justify-center px-6 py-12 text-center text-sm text-slate-500"><p className="font-semibold text-slate-700">{title}</p>{description && <p className="mt-2 text-xs text-slate-400">{description}</p>}{children}</div>;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
