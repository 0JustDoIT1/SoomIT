"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useRespiratoryAuth } from "../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../_lib/respiratory-api";
import { DashboardWorkQueues, buildDashboardReviewQueue, type DashboardCaseSnapshot, type DashboardConsultation } from "../dashboard/dashboard-work-queues";
import { getCaseListFetchError, getCaseListHttpError } from "./case-list-errors";
import { CASES_PER_PAGE, getVisiblePageNumbers, paginateCases } from "./case-pagination";
import { sortByUpdatedAtDesc } from "./case-date";

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
  const pathname = usePathname();
  const isDashboard = pathname === "/respiratory/dashboard";
  const { authorizedFetch } = useRespiratoryAuth();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [notifications, setNotifications] = useState<NotificationResponse>({ unread_count: 0, results: [] });
  const [caseSnapshots, setCaseSnapshots] = useState<Record<string, DashboardCaseSnapshot>>({});
  const [consultations, setConsultations] = useState<DashboardConsultation[]>([]);
  const [lastCasesSyncAt, setLastCasesSyncAt] = useState<Date | null>(null);
  const [casesSyncing, setCasesSyncing] = useState(false);
  const [lastCaseId, setLastCaseId] = useState("");
  const snapshotVersionsRef = useRef<Record<string, string>>({});

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
    if (isDashboard || loading || error || !cases.length) return;
    const lastOpenedCaseId = window.localStorage.getItem("respiratory-last-case-id");
    const target = cases.find((item) => item.id === lastOpenedCaseId) ?? cases[0];
    if (target) router.replace(`/respiratory/cases/${target.id}`);
  }, [cases, error, isDashboard, loading, router]);

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

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/consultations/me/`, { signal: controller.signal });
        const data: unknown = await response.json().catch(() => []);
        if (response.ok && Array.isArray(data)) setConsultations(data as DashboardConsultation[]);
      } catch {
        // The dashboard remains usable with Case and notification data.
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [authorizedFetch]);

  useEffect(() => {
    const targets = cases.filter((item) => item.case_status === "ACTIVE" && snapshotVersionsRef.current[item.id] !== item.updated_at);
    if (!targets.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const results = await Promise.all(targets.map(async (caseItem) => {
        try {
          const [clinicalResponse, aiResponse, orderResponse] = await Promise.all([
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseItem.id}/clinical-results/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseItem.id}/ai-results/`, { signal: controller.signal }),
            authorizedFetch(`${API_BASE_URL}/api/doctor/cases/${caseItem.id}/orders/`, { signal: controller.signal }),
          ]);
          if (!clinicalResponse.ok || !aiResponse.ok || !orderResponse.ok) return null;
          const [clinicalResults, aiResults, orders] = await Promise.all([clinicalResponse.json(), aiResponse.json(), orderResponse.json()]);
          if (!Array.isArray(clinicalResults) || !Array.isArray(aiResults) || !Array.isArray(orders)) return null;
          return { caseItem, snapshot: { clinicalResults, aiResults, orders } as DashboardCaseSnapshot };
        } catch {
          return null;
        }
      }));
      if (controller.signal.aborted) return;
      setCaseSnapshots((current) => {
        const next = { ...current };
        results.forEach((result) => {
          if (!result) return;
          next[result.caseItem.id] = result.snapshot;
          snapshotVersionsRef.current[result.caseItem.id] = result.caseItem.updated_at;
        });
        return next;
      });
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [authorizedFetch, cases]);

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

  const recentCases = useMemo(() => sortByUpdatedAtDesc(cases), [cases]);
  const pagination = useMemo(() => paginateCases(recentCases, currentPage), [recentCases, currentPage]);
  const visiblePages = getVisiblePageNumbers(pagination.page, pagination.pageCount);
  const activeCases = cases.filter((item) => item.case_status === "ACTIVE");
  const reviewQueue = useMemo(() => buildDashboardReviewQueue(cases, caseSnapshots, consultations), [caseSnapshots, cases, consultations]);
  const lastWorkedCase = cases.find((item) => item.id === lastCaseId);
  const firstUnreadNotification = notifications.results.find((item) => !item.read_at);

  if (!isDashboard) {
    return <div className="flex h-full items-center justify-center bg-slate-50 px-6 text-sm text-slate-500">
      {error ? error : loading ? "Case Workspace를 여는 중입니다." : cases.length ? "Case Workspace로 이동 중입니다." : "열 수 있는 ACTIVE Case가 없습니다."}
    </div>;
  }

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
          <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DashboardMetric label="진행 중 Case" value={activeCases.length} description="담당 ACTIVE Case" />
            <DashboardMetric label="검토 대기" value={reviewQueue.length} description="결과·오더·협진 확인" tone="blue" />
            <DashboardMetric label="새 알림" value={notifications.unread_count} description="읽지 않은 알림" tone="amber" />
          </section>

          <DashboardWorkQueues
            cases={cases}
            snapshots={caseSnapshots}
            consultations={consultations}
            lastWorkedCase={lastWorkedCase}
            unreadNotificationCount={notifications.unread_count}
            onOpenCase={openCase}
            onOpenSchedules={() => router.push("/respiratory/schedules")}
            onOpenConsultation={() => lastWorkedCase ? openCase(lastWorkedCase.id) : router.push("/respiratory/cases")}
            onOpenNotifications={() => { if (firstUnreadNotification) void openNotification(firstUnreadNotification); }}
          />
        </>}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-900">최근 업데이트 Case</h2>
              <p className="mt-1 text-xs text-slate-500">현재 로그인한 담당의에게 배정된 Case를 최근 변경 순으로 확인합니다.</p>
            </div>
            <span className="text-xs text-slate-400">글로벌 검색에서 환자명·환자번호·Case 번호 검색 가능</span>
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
              <table className="min-w-[820px] w-full table-fixed">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="w-[25%] whitespace-nowrap px-5 py-3">환자</th>
                    <th className="w-[20%] whitespace-nowrap px-5 py-3">현재 단계</th>
                    <th className="w-[25%] whitespace-nowrap px-5 py-3">최근 상태</th>
                    <th className="w-[20%] whitespace-nowrap px-5 py-3">최근 업데이트</th>
                    <th className="w-[10%] px-5 py-3 text-right">바로가기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagination.items.map((caseItem) => (
                    <tr
                      key={caseItem.id}
                      className="cursor-pointer transition hover:bg-blue-50/60"
                      onClick={() => openCase(caseItem.id)}
                    >
                      <td className="px-5 py-4">
                        <p className="truncate text-sm font-semibold text-slate-800">{caseItem.patient_name || "-"}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{caseItem.patient_code || "-"} · {caseItem.case_code || "-"}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4"><Badge label={STAGE_LABELS[caseItem.current_stage] ?? caseItem.current_stage ?? "-"} tone="blue" /></td>
                      <td className="px-5 py-4"><span className="text-xs font-semibold text-slate-700">{reviewQueue.find((item) => item.caseId === caseItem.id)?.action || STATUS_LABELS[caseItem.case_status] || caseItem.case_status || "-"}</span></td>
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
                  {recentCases.length === 0 && (
                    <tr><td colSpan={5}><EmptyState title="현재 배정된 진행 중 Case가 없습니다." /></td></tr>
                  )}
                </tbody>
              </table>
              {recentCases.length > 0 && (
                <nav aria-label="Case 목록 페이지" className="flex items-center justify-between gap-4 border-t border-slate-200 px-5 py-3">
                  <p className="whitespace-nowrap text-xs text-slate-500">
                    총 {recentCases.length}건 · {(pagination.page - 1) * CASES_PER_PAGE + 1}–{Math.min(pagination.page * CASES_PER_PAGE, recentCases.length)}건 표시
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
