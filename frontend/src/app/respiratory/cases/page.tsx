"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useRespiratoryAuth } from "../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../_lib/respiratory-api";
import { getCaseListFetchError, getCaseListHttpError } from "./case-list-errors";
import { getCaseListEmptyState } from "./case-list-empty-state";
import { CASES_PER_PAGE, getVisiblePageNumbers, paginateCases } from "./case-pagination";
import { isSameLocalCalendarDay, sortByUpdatedAtDesc } from "./case-date";
import { filterWorklistCases, type WorklistFilter } from "./case-worklist-filter";

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
  const [worklistFilter, setWorklistFilter] = useState<WorklistFilter>("ALL");
  const [notifications, setNotifications] = useState<NotificationResponse>({ unread_count: 0, results: [] });
  const [lastCasesSyncAt, setLastCasesSyncAt] = useState<Date | null>(null);
  const [casesSyncing, setCasesSyncing] = useState(false);
  const [lastCaseId, setLastCaseId] = useState("");

  const openCase = useCallback((id: string) => {
    window.localStorage.setItem("respiratory-last-case-id", id);
    setLastCaseId(id);
    router.push(`/respiratory/cases/${id}`);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLastCaseId(window.localStorage.getItem("respiratory-last-case-id") ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/notifications/me/?limit=100`, { signal });
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

  const fetchCases = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!silent) setLoading(true);
    if (silent) setCasesSyncing(true);
    if (!silent) setError("");

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
      setLastCasesSyncAt(new Date());
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
        return;
      }
      // Keep the already visible worklist usable if a background refresh has a
      // transient network failure. Initial load and explicit retries still
      // expose the error state and its retry action.
      if (!silent) setError(getCaseListFetchError(fetchError));
    } finally {
      if (!signal?.aborted) {
        if (!silent) setLoading(false);
        if (silent) setCasesSyncing(false);
      }
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
    let disposed = false;
    let polling = false;
    const pollCases = async () => {
      if (disposed || polling || document.hidden) return;
      polling = true;
      try {
        await fetchCases(undefined, true);
      } finally {
        polling = false;
      }
    };
    const interval = window.setInterval(() => void pollCases(), 30_000);
    const refreshWhenVisible = () => {
      if (!document.hidden) void pollCases();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [fetchCases]);

  useEffect(() => {
    const controller = new AbortController();
    const requestTimer = window.setTimeout(() => void fetchNotifications(controller.signal), 0);
    let disposed = false;
    let polling = false;
    const pollNotifications = async () => {
      if (disposed || polling || document.hidden) return;
      polling = true;
      try {
        await fetchNotifications();
      } finally {
        polling = false;
      }
    };
    const interval = window.setInterval(() => void pollNotifications(), 30_000);
    const refreshWhenVisible = () => {
      if (!document.hidden) void pollNotifications();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      window.clearTimeout(requestTimer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      controller.abort();
    };
  }, [fetchNotifications]);

  const openNotification = useCallback(async (notification: StaffNotification) => {
    if (!notification.read_at) {
      try {
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
      } catch {
        // Preserve access to the referenced Case even if the read receipt is offline.
      }
    }
    if (notification.case_id) openCase(notification.case_id);
  }, [authorizedFetch, openCase]);

  const unreadNotificationCaseIds = useMemo(() => new Set(notifications.results.filter((item) => !item.read_at && item.case_id).map((item) => item.case_id as string)), [notifications.results]);

  const filteredCases = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const searchedCases = keyword ? cases.filter((item) =>
      [item.patient_name, item.patient_code, item.case_code].some((value) =>
        value?.toLowerCase().includes(keyword),
      ),
    ) : cases;

    return filterWorklistCases(searchedCases, worklistFilter, unreadNotificationCaseIds);
  }, [cases, search, unreadNotificationCaseIds, worklistFilter]);

  const pagination = useMemo(() => paginateCases(filteredCases, currentPage), [filteredCases, currentPage]);
  const visiblePages = getVisiblePageNumbers(pagination.page, pagination.pageCount);
  const emptyState = getCaseListEmptyState(search, worklistFilter);
  const activeCases = cases.filter((item) => item.case_status === "ACTIVE");
  const updatedToday = cases.filter((item) => isSameLocalCalendarDay(item.updated_at)).length;
  const currentStageCount = filterWorklistCases(cases, "IMAGING").length;
  const recentCases = sortByUpdatedAtDesc(filteredCases);
  const lastWorkedCase = cases.find((item) => item.id === lastCaseId);
  const visibleNotifications = notifications.results.filter((item) => !item.read_at).slice(0, 5);

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

        <div className="mb-4 flex items-center justify-end gap-3 text-xs text-slate-500">
          <span>{casesSyncing ? "업무함을 갱신하는 중입니다." : lastCasesSyncAt ? `마지막 갱신 ${lastCasesSyncAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : "자동 갱신: 30초"}</span>
          <button type="button" onClick={() => void fetchCases(undefined, true)} disabled={casesSyncing} className="rounded border border-blue-200 bg-white px-2.5 py-1.5 font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{casesSyncing ? "갱신 중" : "업무함 새로고침"}</button>
        </div>

        {!loading && !error && <>
          <section className="mb-5 grid grid-cols-4 gap-3">
            <DashboardMetric label="진행 중 Case" value={activeCases.length} description="현재 담당 중" />
            <DashboardMetric label="검사 진행 단계" value={currentStageCount} description="X-ray 또는 CT 단계" tone="blue" />
            <DashboardMetric label="새 알림" value={notifications.unread_count} description="미읽음 알림" tone="amber" />
            <DashboardMetric label="오늘 업데이트" value={updatedToday} description="Case 최근 변경" tone="emerald" />
          </section>

          <section className="mb-5 grid grid-cols-[minmax(0,1fr)_280px] gap-4">
            <div className="rounded-xl border border-blue-100 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b border-blue-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">지금 확인할 일</h2><p className="mt-1 text-xs text-slate-500">새 알림과 우선 확인이 필요한 업무입니다.</p></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{notifications.unread_count}건</span>{unreadNotificationCaseIds.size > 0 && <button type="button" onClick={() => { setWorklistFilter("NOTIFIED"); setCurrentPage(1); }} className="text-xs font-semibold text-blue-700 hover:text-blue-900">Case 보기 →</button>}</div></div>
              {visibleNotifications.length ? <div className="divide-y divide-slate-100">{visibleNotifications.map((notification) => <button key={notification.id} type="button" onClick={() => void openNotification(notification)} className="flex w-full items-center justify-between gap-4 bg-blue-50/40 px-5 py-3 text-left transition hover:bg-blue-50"><div><p className="text-sm font-semibold text-slate-800">{notification.title}</p><p className="mt-1 text-xs text-slate-500">{notification.message}</p></div><span className="shrink-0 text-xs font-semibold text-blue-700">{notification.case_id ? "Case 확인 →" : "읽음 처리"}</span></button>)}</div> : <p className="px-5 py-7 text-center text-sm text-slate-400">새로 확인할 알림이 없습니다.</p>}
            </div>
            <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-900">빠른 이동</h2><div className="mt-3 space-y-2">{lastWorkedCase && <button type="button" onClick={() => openCase(lastWorkedCase.id)} className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-left text-sm font-semibold text-blue-800 hover:bg-blue-100"><span className="block text-[11px] font-medium text-blue-600">최근 작업 Case 재개</span><span className="mt-1 block truncate">{lastWorkedCase.patient_name || lastWorkedCase.patient_code} · {lastWorkedCase.case_code}</span></button>}<button type="button" onClick={() => router.push("/respiratory/schedules")} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">진료 일정 관리</button><button type="button" onClick={() => router.push("/respiratory/settings")} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">내 프로필·알림 설정</button></div></aside>
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

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3" aria-label="업무함 필터">
            <WorklistFilterButton active={worklistFilter === "ALL"} onClick={() => { setWorklistFilter("ALL"); setCurrentPage(1); }}>전체 {cases.length}</WorklistFilterButton>
            <WorklistFilterButton active={worklistFilter === "ACTIVE"} onClick={() => { setWorklistFilter("ACTIVE"); setCurrentPage(1); }}>진행 중 {activeCases.length}</WorklistFilterButton>
            <WorklistFilterButton active={worklistFilter === "IMAGING"} onClick={() => { setWorklistFilter("IMAGING"); setCurrentPage(1); }}>X-ray · CT {currentStageCount}</WorklistFilterButton>
            <WorklistFilterButton active={worklistFilter === "NOTIFIED"} onClick={() => { setWorklistFilter("NOTIFIED"); setCurrentPage(1); }}>새 알림 {unreadNotificationCaseIds.size}</WorklistFilterButton>
            <p className="ml-auto text-xs text-slate-500">현재 API의 Case 상태·검사 단계·미읽음 알림을 기준으로 표시합니다.</p>
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
                      onClick={() => openCase(caseItem.id)}
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
                            openCase(caseItem.id);
                          }}
                          className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          통합 진료 열기
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredCases.length === 0 && (
                    <tr><td colSpan={6}><EmptyState title={emptyState.title} description={emptyState.description}>{worklistFilter !== "ALL" && <button type="button" onClick={() => { setWorklistFilter("ALL"); setCurrentPage(1); }} className="mt-4 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">전체 Case 보기</button>}</EmptyState></td></tr>
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

function WorklistFilterButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"}`}>{children}</button>;
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
