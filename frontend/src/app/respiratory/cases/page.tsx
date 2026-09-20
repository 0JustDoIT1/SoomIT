"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useRespiratoryAuth } from "../_components/respiratory-auth-provider";
import { API_BASE_URL } from "../_lib/respiratory-api";
import {
  DashboardWorkQueues,
  type DashboardCaseSnapshot,
  type DashboardConsultation,
} from "../dashboard/dashboard-work-queues";
import {
  getCaseListFetchError,
  getCaseListHttpError,
} from "./case-list-errors";

type CaseItem = {
  id: string;
  case_code: string;
  patient_code: string;
  patient_name: string;
  current_stage: string;
  case_status: string;
  updated_at: string;
};

type StaffNotification = {
  id: string;
  title: string;
  message: string;
  case_id: string | null;
  case_code: string | null;
  created_at: string;
  read_at: string | null;
};

type NotificationResponse = {
  unread_count: number;
  results: StaffNotification[];
};

function readCaseList(payload: unknown): CaseItem[] {
  if (Array.isArray(payload)) {
    return payload as CaseItem[];
  }

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

  const [notifications, setNotifications] =
    useState<NotificationResponse>({
      unread_count: 0,
      results: [],
    });

  const [caseSnapshots, setCaseSnapshots] = useState<
    Record<string, DashboardCaseSnapshot>
  >({});

  const [consultations, setConsultations] = useState<
    DashboardConsultation[]
  >([]);

  /*
   * Dashboard 환자 진료 맵에 표시할 Case.
   *
   * 우선순위
   * 1. 현재 Dashboard에서 선택한 ACTIVE Case
   * 2. 마지막으로 열었던 ACTIVE Case
   * 3. 첫 번째 ACTIVE Case
   */
  const [dashboardCaseId, setDashboardCaseId] =
    useState<string | null>(null);

  const [lastCasesSyncAt, setLastCasesSyncAt] =
    useState<Date | null>(null);

  const [casesSyncing, setCasesSyncing] =
    useState(false);

  const snapshotVersionsRef =
    useRef<Record<string, string>>({});

  /* ---------------------------------------------------------------------- */
  /* Case navigation                                                        */
  /* ---------------------------------------------------------------------- */

  const openCase = useCallback(
    (id: string) => {
      window.localStorage.setItem(
        "respiratory-last-case-id",
        id,
      );

      router.push(`/respiratory/cases/${id}`);
    },
    [router],
  );

  /* ---------------------------------------------------------------------- */
  /* Notifications                                                          */
  /* ---------------------------------------------------------------------- */

  const fetchNotifications = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await authorizedFetch(
          `${API_BASE_URL}/api/notifications/me/?limit=100`,
          { signal },
        );

        const data = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          return;
        }

        setNotifications({
          unread_count:
            Number(data.unread_count) || 0,

          results: Array.isArray(data.results)
            ? data.results
            : [],
        });
      } catch {
        /*
         * 공통 Notification Center가 별도의 오류 상태를
         * 제공하므로 Dashboard 자체는 계속 사용한다.
         */
      }
    },
    [authorizedFetch],
  );

  /* ---------------------------------------------------------------------- */
  /* Cases                                                                  */
  /* ---------------------------------------------------------------------- */

  const fetchCases = useCallback(
    async (
      signal?: AbortSignal,
      silent = false,
    ) => {
      if (!silent) {
        setLoading(true);
        setError("");
      }

      if (silent) {
        setCasesSyncing(true);
      }

      try {
        const response = await authorizedFetch(
          `${API_BASE_URL}/api/doctor/cases/`,
          { signal },
        );

        if (!response.ok) {
          throw new Error(
            getCaseListHttpError(
              response.status,
            ),
          );
        }

        const data =
          await response.json();

        setCases(
          readCaseList(data),
        );

        setLastCasesSyncAt(
          new Date(),
        );
      } catch (fetchError) {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
          return;
        }

        /*
         * Background polling 실패 시 이미 화면에 표시된
         * Case 목록을 지우지 않는다.
         */
        if (!silent) {
          setError(
            getCaseListFetchError(
              fetchError,
            ),
          );
        }
      } finally {
        if (!signal?.aborted) {
          if (!silent) {
            setLoading(false);
          }

          if (silent) {
            setCasesSyncing(false);
          }
        }
      }
    },
    [authorizedFetch],
  );

  /* ---------------------------------------------------------------------- */
  /* Initial Case fetch                                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const controller =
      new AbortController();

    const timer =
      window.setTimeout(() => {
        void fetchCases(
          controller.signal,
        );
      }, 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchCases]);

  /* ---------------------------------------------------------------------- */
  /* Case polling                                                           */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let disposed = false;
    let polling = false;

    const pollCases =
      async () => {
        if (
          disposed ||
          polling ||
          document.hidden
        ) {
          return;
        }

        polling = true;

        try {
          await fetchCases(
            undefined,
            true,
          );
        } finally {
          polling = false;
        }
      };

    const interval =
      window.setInterval(
        () => {
          void pollCases();
        },
        30_000,
      );

    const refreshWhenVisible =
      () => {
        if (!document.hidden) {
          void pollCases();
        }
      };

    document.addEventListener(
      "visibilitychange",
      refreshWhenVisible,
    );

    return () => {
      disposed = true;

      window.clearInterval(
        interval,
      );

      document.removeEventListener(
        "visibilitychange",
        refreshWhenVisible,
      );
    };
  }, [fetchCases]);

  /* ---------------------------------------------------------------------- */
  /* Case route redirect                                                    */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (
      isDashboard ||
      loading ||
      error ||
      !cases.length
    ) {
      return;
    }

    const lastOpenedCaseId =
      window.localStorage.getItem(
        "respiratory-last-case-id",
      );

    const target =
      cases.find(
        (item) =>
          item.id ===
          lastOpenedCaseId,
      ) ?? cases[0];

    if (target) {
      router.replace(
        `/respiratory/cases/${target.id}`,
      );
    }
  }, [
    cases,
    error,
    isDashboard,
    loading,
    router,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Dashboard selected Case                                                */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!isDashboard) {
      return;
    }

    const timer = window.setTimeout(() => {
      const activeCases =
        cases.filter(
          (item) =>
            item.case_status ===
            "ACTIVE",
        );

      if (!activeCases.length) {
        setDashboardCaseId(null);
        return;
      }

      const lastOpenedCaseId =
        window.localStorage.getItem(
          "respiratory-last-case-id",
        );

      const lastOpenedCase =
        lastOpenedCaseId
          ? activeCases.find(
              (item) =>
                item.id ===
                lastOpenedCaseId,
            )
          : undefined;

      const fallbackCase =
        lastOpenedCase ??
        activeCases[0];

      setDashboardCaseId(
        (current) => {
          const currentStillAvailable =
            current
              ? activeCases.some(
                  (item) =>
                    item.id ===
                    current,
                )
              : false;

          return currentStillAvailable
            ? current
            : fallbackCase.id;
        },
      );
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    cases,
    isDashboard,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Notification polling                                                   */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const controller =
      new AbortController();

    const requestTimer =
      window.setTimeout(
        () => {
          void fetchNotifications(
            controller.signal,
          );
        },
        0,
      );

    let disposed = false;
    let polling = false;

    const pollNotifications =
      async () => {
        if (
          disposed ||
          polling ||
          document.hidden
        ) {
          return;
        }

        polling = true;

        try {
          await fetchNotifications();
        } finally {
          polling = false;
        }
      };

    const interval =
      window.setInterval(
        () => {
          void pollNotifications();
        },
        30_000,
      );

    const refreshWhenVisible =
      () => {
        if (!document.hidden) {
          void pollNotifications();
        }
      };

    document.addEventListener(
      "visibilitychange",
      refreshWhenVisible,
    );

    return () => {
      disposed = true;

      window.clearTimeout(
        requestTimer,
      );

      window.clearInterval(
        interval,
      );

      document.removeEventListener(
        "visibilitychange",
        refreshWhenVisible,
      );

      controller.abort();
    };
  }, [fetchNotifications]);

  /* ---------------------------------------------------------------------- */
  /* Consultations                                                          */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const controller =
      new AbortController();

    const timer =
      window.setTimeout(
        async () => {
          try {
            const response =
              await authorizedFetch(
                `${API_BASE_URL}/api/doctor/cases/consultations/me/`,
                {
                  signal:
                    controller.signal,
                },
              );

            const data: unknown =
              await response
                .json()
                .catch(() => []);

            if (
              response.ok &&
              Array.isArray(data)
            ) {
              setConsultations(
                data as DashboardConsultation[],
              );
            }
          } catch {
            /*
             * 협진 API 실패가 Dashboard 전체 사용을
             * 방해하지 않도록 기존 상태를 유지한다.
             */
          }
        },
        0,
      );

    return () => {
      window.clearTimeout(
        timer,
      );

      controller.abort();
    };
  }, [authorizedFetch]);

  /* ---------------------------------------------------------------------- */
  /* Active Case snapshots                                                  */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const targets =
      cases.filter(
        (item) =>
          item.case_status ===
            "ACTIVE" &&
          snapshotVersionsRef.current[
            item.id
          ] !== item.updated_at,
      );

    if (!targets.length) {
      return;
    }

    const controller =
      new AbortController();

    const timer =
      window.setTimeout(
        async () => {
          const results =
            await Promise.all(
              targets.map(
                async (
                  caseItem,
                ) => {
                  try {
                    const [
                      clinicalResponse,
                      aiResponse,
                      orderResponse,
                    ] =
                      await Promise.all([
                        authorizedFetch(
                          `${API_BASE_URL}/api/doctor/cases/${caseItem.id}/clinical-results/`,
                          {
                            signal:
                              controller.signal,
                          },
                        ),

                        authorizedFetch(
                          `${API_BASE_URL}/api/doctor/cases/${caseItem.id}/ai-results/`,
                          {
                            signal:
                              controller.signal,
                          },
                        ),

                        authorizedFetch(
                          `${API_BASE_URL}/api/doctor/cases/${caseItem.id}/orders/`,
                          {
                            signal:
                              controller.signal,
                          },
                        ),
                      ]);

                    if (
                      !clinicalResponse.ok ||
                      !aiResponse.ok ||
                      !orderResponse.ok
                    ) {
                      return null;
                    }

                    const [
                      clinicalResults,
                      aiResults,
                      orders,
                    ] =
                      await Promise.all([
                        clinicalResponse.json(),
                        aiResponse.json(),
                        orderResponse.json(),
                      ]);

                    if (
                      !Array.isArray(
                        clinicalResults,
                      ) ||
                      !Array.isArray(
                        aiResults,
                      ) ||
                      !Array.isArray(
                        orders,
                      )
                    ) {
                      return null;
                    }

                    return {
                      caseItem,

                      snapshot: {
                        clinicalResults,
                        aiResults,
                        orders,
                      } as DashboardCaseSnapshot,
                    };
                  } catch {
                    return null;
                  }
                },
              ),
            );

          if (
            controller.signal.aborted
          ) {
            return;
          }

          setCaseSnapshots(
            (current) => {
              const next = {
                ...current,
              };

              results.forEach(
                (result) => {
                  if (!result) {
                    return;
                  }

                  next[
                    result.caseItem.id
                  ] =
                    result.snapshot;

                  snapshotVersionsRef.current[
                    result.caseItem.id
                  ] =
                    result.caseItem.updated_at;
                },
              );

              return next;
            },
          );
        },
        0,
      );

    return () => {
      window.clearTimeout(
        timer,
      );

      controller.abort();
    };
  }, [
    authorizedFetch,
    cases,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Dashboard Notification open                                            */
  /* ---------------------------------------------------------------------- */

  const openDashboardNotification =
    useCallback(
      async (
        notification: StaffNotification,
      ) => {
        if (
          !notification.read_at
        ) {
          try {
            const response =
              await authorizedFetch(
                `${API_BASE_URL}/api/notifications/me/${notification.id}/read/`,
                {
                  method: "PATCH",
                },
              );

            if (response.ok) {
              setNotifications(
                (current) => ({
                  unread_count:
                    Math.max(
                      current.unread_count -
                        1,
                      0,
                    ),

                  results:
                    current.results.map(
                      (item) =>
                        item.id ===
                        notification.id
                          ? {
                              ...item,

                              read_at:
                                new Date().toISOString(),
                            }
                          : item,
                    ),
                }),
              );
            }
          } catch {
            /*
             * 읽음 처리 실패가 관련 Case 이동을
             * 차단하지 않도록 한다.
             */
          }
        }

        if (
          notification.case_id
        ) {
          openCase(
            notification.case_id,
          );

          return;
        }

        router.push(
          "/respiratory/notifications",
        );
      },
      [
        authorizedFetch,
        openCase,
        router,
      ],
    );

  /* ---------------------------------------------------------------------- */
  /* Non-dashboard route placeholder                                        */
  /* ---------------------------------------------------------------------- */

  if (!isDashboard) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 px-6 text-sm text-slate-500">
        {error
          ? error
          : loading
            ? "Case Workspace를 여는 중입니다."
            : cases.length
              ? "Case Workspace로 이동 중입니다."
              : "열 수 있는 ACTIVE Case가 없습니다."}
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Dashboard                                                              */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="h-full overflow-auto bg-slate-50 px-6 py-5">
      <div className="mx-auto max-w-[1440px]">
        {/* Header */}

        <header className="mb-4 flex items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-blue-600">
              호흡기내과 진료 업무
            </p>

            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              오늘의 진료 업무
            </h1>

            <p className="mt-1.5 text-sm text-slate-500">
              현재 담당 Case의 진행 상황과 우선 처리 업무를
              확인합니다.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
            <span>
              {casesSyncing
                ? "업무함을 갱신하는 중입니다."
                : lastCasesSyncAt
                  ? `마지막 갱신 ${lastCasesSyncAt.toLocaleTimeString(
                      "ko-KR",
                      {
                        hour:
                          "2-digit",
                        minute:
                          "2-digit",
                      },
                    )}`
                  : "자동 갱신: 30초"}
            </span>

            <button
              type="button"
              onClick={() =>
                void fetchCases(
                  undefined,
                  true,
                )
              }
              disabled={
                casesSyncing
              }
              className="rounded-lg border border-blue-200 bg-white px-3 py-2 font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {casesSyncing
                ? "갱신 중"
                : "업무 새로고침"}
            </button>
          </div>
        </header>

        {/* Loading */}

        {loading && (
          <section className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
            담당 Case와 업무 현황을 불러오는 중입니다.
          </section>
        )}

        {/* Error */}

        {!loading &&
          error && (
            <section className="rounded-xl border border-rose-200 bg-white px-6 py-16 text-center">
              <p className="text-sm font-semibold text-rose-700">
                {error}
              </p>

              <button
                type="button"
                onClick={() =>
                  void fetchCases()
                }
                className="mt-4 rounded-lg border border-blue-200 px-4 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                다시 시도
              </button>
            </section>
          )}

        {/* Dashboard */}

        {!loading &&
          !error && (
            <DashboardWorkQueues
              cases={cases}
              snapshots={
                caseSnapshots
              }
              consultations={
                consultations
              }
              notifications={
                notifications.results
              }
              unreadNotificationCount={
                notifications.unread_count
              }

              /* 현재 Dashboard에서 보고 있는 환자 */
              selectedCaseId={
                dashboardCaseId
              }

              /* Dashboard에서 환자 선택 변경 */
              onSelectCase={
                setDashboardCaseId
              }

              onOpenCase={
                openCase
              }

              onOpenConsultations={() =>
                router.push(
                  "/respiratory/consultations",
                )
              }

              onOpenNotification={(
                notification,
              ) =>
                void openDashboardNotification(
                  notification,
                )
              }

              onOpenNotifications={() =>
                router.push(
                  "/respiratory/notifications",
                )
              }
            />
          )}
      </div>
    </div>
  );
}