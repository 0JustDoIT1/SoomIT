"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { RespiratoryAuthProvider, useRespiratoryAuth } from "./_components/respiratory-auth-provider";
import { API_BASE_URL } from "@/lib/api";
import { requestCaseNavigation } from "./_lib/case-navigation-guard";
import { ClinicianThemeToggle } from "@/components/theme/clinician-theme-toggle";
import {
  markNotificationRead,
  mergeNotificationSnapshot,
  publishNotificationRead,
  publishNotificationSnapshot,
  readNotificationPayload,
  subscribeNotificationRead,
  type NotificationState,
  type StaffNotification,
} from "./_lib/notification-state";

type SearchCase = { id: string; patient_name: string; patient_code: string; case_code: string };
type ConsultationSummary = { id: string; status: string };

function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && "results" in value && Array.isArray(value.results)) return value.results as T[];
  return [];
}

export default function RespiratoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <RespiratoryAuthProvider><AuthenticatedLayout>{children}</AuthenticatedLayout></RespiratoryAuthProvider>;
}

function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, authorizedFetch, isAuthenticated, isReady, logout } = useRespiratoryAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationState>({ unread_count: 0, results: [] });
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [consultationWaitingCount, setConsultationWaitingCount] = useState(0);
  const [notificationError, setNotificationError] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchCase[]>([]);
  const [caseSearchCache, setCaseSearchCache] = useState<SearchCase[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [clock, setClock] = useState("");
  const pendingNotificationReadsRef = useRef(new Set<string>());

  const loadNotifications = useCallback(async (silent = false) => {
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/notifications/me/?limit=100`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "알림을 불러오지 못했습니다.");
      const incoming = readNotificationPayload(data);
      setNotifications((current) => mergeNotificationSnapshot(current, incoming));
      publishNotificationSnapshot(incoming);
      setNotificationError("");
    } catch (error) {
      // Preserve the last known notification state on a transient background failure.
      if (!silent) setNotificationError(error instanceof Error ? error.message : "알림을 불러오지 못했습니다.");
    } finally {
      if (!silent) setNotificationsLoading(false);
    }
  }, [authorizedFetch]);

  const loadConsultationWaitingCount = useCallback(async () => {
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/consultations/me/`);
      if (!response.ok) return;
      const consultations = asList<ConsultationSummary>(await response.json());
      setConsultationWaitingCount(consultations.filter((item) => item.status === "REQUESTED").length);
    } catch {
      // Keep the last known count when the optional navigation badge cannot refresh.
    }
  }, [authorizedFetch]);

  async function openNotification(notification: StaffNotification) {
    if (!notification.read_at) {
      if (pendingNotificationReadsRef.current.has(notification.id)) return;
      pendingNotificationReadsRef.current.add(notification.id);
      try {
        const response = await authorizedFetch(`${API_BASE_URL}/api/notifications/me/${notification.id}/read/`, { method: "PATCH" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : "알림을 읽음 처리하지 못했습니다.");
        const readAt = typeof payload.read_at === "string" ? payload.read_at : new Date().toISOString();
        setNotifications((current) => markNotificationRead(current, notification.id, readAt));
        publishNotificationRead(notification.id, readAt);
        setNotificationError("");
      } catch (error) {
        setNotificationError(error instanceof Error ? error.message : "알림을 읽음 처리하지 못했습니다.");
        return;
      } finally {
        pendingNotificationReadsRef.current.delete(notification.id);
      }
    }
    if (notification.case_id && !requestCaseNavigation(notification.case_id)) return;
    setShowNotifications(false);
    const chatMessageId = notification.notification_type === "CASE_CHAT" && typeof notification.payload?.chat_message_id === "string" ? notification.payload.chat_message_id : "";
    if (notification.case_id) router.push(`/respiratory/cases/${notification.case_id}${notification.notification_type === "CASE_CHAT" ? `?openChat=1${chatMessageId ? `&chatMessage=${encodeURIComponent(chatMessageId)}` : ""}` : ""}`);
  }

  useEffect(() => {
    return subscribeNotificationRead((id, readAt) => {
      setNotifications((current) => markNotificationRead(current, id, readAt));
    });
  }, []);

  useEffect(() => {
    if (!isReady || !isAuthenticated) return;
    const initialTimer = window.setTimeout(() => void Promise.all([loadNotifications(), loadConsultationWaitingCount()]), 0);
    let disposed = false;
    let polling = false;
    const pollNotifications = async () => {
      if (disposed || polling || document.hidden) return;
      polling = true;
      try {
        await Promise.all([loadNotifications(true), loadConsultationWaitingCount()]);
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(() => void pollNotifications(), 30_000);
    const refreshWhenVisible = () => {
      if (!document.hidden) void pollNotifications();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isReady, isAuthenticated, loadConsultationWaitingCount, loadNotifications]);

  useEffect(() => {
    if (!isReady || !isAuthenticated) return;
    const controller = new AbortController();
    const loadSearchCache = async () => {
      try {
        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/`, { signal: controller.signal });
        if (!response.ok) return;
        const payload: unknown = await response.json();
        const cases = Array.isArray(payload) ? payload as SearchCase[] : payload && typeof payload === "object" && "results" in payload && Array.isArray(payload.results) ? payload.results as SearchCase[] : [];
        if (!controller.signal.aborted) setCaseSearchCache(cases);
      } catch {
        // The server search remains available if the optional warm cache cannot load.
      }
    };
    void loadSearchCache();
    return () => controller.abort();
  }, [authorizedFetch, isAuthenticated, isReady]);

  useEffect(() => {
    const update = () => setClock(new Date().toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit" }));
    const initialTimer = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword || !isAuthenticated) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/?search=${encodeURIComponent(keyword)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("담당 Case를 검색할 수 없습니다.");
        const payload: unknown = await response.json();
        const cases = Array.isArray(payload) ? payload as SearchCase[] : payload && typeof payload === "object" && "results" in payload && Array.isArray(payload.results) ? payload.results as SearchCase[] : [];
        setSearchResults(cases.slice(0, 8));
        setSearchError("");
      } catch (error) {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : "검색에 실패했습니다.");
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [authorizedFetch, isAuthenticated, search]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchResults[0]) openSearchCase(searchResults[0].id);
  }

  function updateSearch(value: string) {
    const keyword = value.trim().toLowerCase();
    setSearch(value);
    setSearchError("");
    setSearchOpen(true);
    setSearchResults(keyword ? caseSearchCache.filter((item) => [item.patient_name, item.patient_code, item.case_code].some((field) => field?.toLowerCase().includes(keyword))).slice(0, 8) : []);
  }

  function openSearchCase(id: string) {
    if (!requestCaseNavigation(id)) return;
    setSearchOpen(false);
    setSearch("");
    window.localStorage.setItem("respiratory-last-case-id", id);
    router.push(`/respiratory/cases/${id}`);
  }

  async function openCaseWorkspace() {
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/`);
      if (!response.ok) throw new Error("담당 Case를 불러오지 못했습니다.");
      const payload: unknown = await response.json();
      const cases = Array.isArray(payload) ? payload as SearchCase[] : payload && typeof payload === "object" && "results" in payload && Array.isArray(payload.results) ? payload.results as SearchCase[] : [];
      const lastCaseId = window.localStorage.getItem("respiratory-last-case-id");
      const target = cases.find((item) => item.id === lastCaseId) ?? cases[0];
      if (target) {
        openSearchCase(target.id);
        return;
      }
      router.push("/respiratory/cases");
    } catch {
      router.push("/respiratory/cases");
    }
  }

  if (!isReady || !isAuthenticated) return null;

  return (
    <div className="clinical-app clinical-app-respiratory respiratory-app flex h-dvh min-h-0 overflow-hidden bg-[#f3f7fd]">
      <aside className="flex w-[60px] shrink-0 flex-col items-center bg-[#123f4a] px-1 py-3 text-white shadow-[inset_-1px_0_0_rgba(148,210,210,0.16)] lg:w-[76px]" aria-label="호흡기내과 주 메뉴">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 shadow-sm lg:h-11 lg:w-11" title="SoomIT">
          <Image src="/images/logo_small.png" alt="SoomIT" width={34} height={34} priority className="h-8 w-8 object-contain lg:h-9 lg:w-9" />
        </div>
        <nav className="flex w-full flex-col items-center gap-1" aria-label="업무 메뉴">
          <ShellNavButton icon="home" label="홈" active={pathname === "/respiratory/dashboard"} onClick={() => router.push("/respiratory/dashboard")} />
          <ShellNavButton icon="case" label="Case" active={pathname.startsWith("/respiratory/cases")} onClick={() => void openCaseWorkspace()} />
          <ShellNavButton icon="calendar" label="일정" active={pathname.startsWith("/respiratory/schedules")} onClick={() => router.push("/respiratory/schedules")} />
          <ShellNavButton icon="consultation" label="협진" active={pathname.startsWith("/respiratory/consultations")} onClick={() => router.push("/respiratory/consultations")} count={consultationWaitingCount} />
          <ShellNavButton icon="notification" label="알림" active={pathname.startsWith("/respiratory/notifications")} onClick={() => router.push("/respiratory/notifications")} count={notifications.unread_count} />
        </nav>
        <nav className="mt-auto flex w-full flex-col items-center gap-1 border-t border-white/15 pt-3" aria-label="유틸리티 메뉴">
          <ShellNavButton icon="help" label="도움말" active={false} onClick={() => undefined} disabled />
          <ShellNavButton icon="settings" label="설정" active={pathname.startsWith("/respiratory/settings")} onClick={() => router.push("/respiratory/settings")} />
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
      <header className="relative z-30 flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-blue-100 bg-white px-3 shadow-sm xl:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden lg:block">
            <p className="whitespace-nowrap text-[13px] font-bold text-slate-900">
              호흡기내과 통합 진료
            </p>

            <p className="text-[10px] text-slate-500">
              Respiratory Medicine CDSS
            </p>
          </div>
        </div>

        <div className="relative min-w-0 flex-1 px-2 xl:max-w-[430px]">
          <form onSubmit={submitSearch} role="search">
            <label htmlFor="respiratory-case-search" className="sr-only">담당 Case 검색</label>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-blue-100 bg-[#f3f7fd] px-3 text-slate-500 focus-within:border-blue-400 focus-within:bg-white">
              <span aria-hidden="true">⌕</span>
              <input id="respiratory-case-search" type="search" value={search} onChange={(event) => updateSearch(event.target.value)} onFocus={() => setSearchOpen(true)} placeholder="환자명, 환자번호, Case 번호 검색" className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-500" />
            </div>
          </form>
          {searchOpen && search.trim().length >= 1 && <div className="absolute left-2 right-2 top-11 z-50 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-xl">
            {searchError ? <p role="alert" className="p-3 text-xs text-rose-700">{searchError}</p> : searchResults.length ? searchResults.map((item) => <button key={item.id} type="button" onClick={() => openSearchCase(item.id)} className="block w-full border-b border-slate-100 px-3 py-2.5 text-left text-xs hover:bg-blue-50"><span className="font-bold text-slate-800">{item.patient_name}</span><span className="ml-2 text-slate-500">{item.patient_code} · {item.case_code}</span></button>) : <p className="p-3 text-xs text-slate-500">일치하는 담당 Case가 없습니다.</p>}
          </div>}
        </div>

        <div className="flex shrink-0 items-center gap-2 xl:gap-4">
          <span className="hidden text-xs font-medium text-slate-500 xl:block">{clock}</span>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications((open) => !open)}
              aria-label="알림"
              aria-expanded={showNotifications}
              className="relative rounded-lg px-2 py-2 text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
            >
              <span aria-hidden="true" className="text-base">🔔</span>
              {notifications.unread_count > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">{notifications.unread_count > 99 ? "99+" : notifications.unread_count}</span>}
            </button>
            {showNotifications && <section className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-800">알림</h2><button type="button" onClick={() => setShowNotifications(false)} aria-label="알림 닫기" className="text-slate-400">×</button></div>
              {notificationError && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs leading-5 text-rose-700">{notificationError}</p>}
              {notificationsLoading ? <p role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">알림을 불러오는 중입니다.</p> : notifications.results.length === 0 ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">새 알림이 없습니다.</p> : <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{notifications.results.slice(0, 20).map((notification) => <button type="button" key={notification.id} onClick={() => void openNotification(notification)} disabled={pendingNotificationReadsRef.current.has(notification.id)} className={`w-full rounded-lg border p-3 text-left text-xs transition hover:border-blue-300 disabled:cursor-wait ${notification.read_at ? "border-slate-100 bg-slate-50 text-slate-500" : "border-blue-100 bg-blue-50 text-slate-700"}`}><p className={notification.read_at ? "font-semibold" : "font-bold"}>{notification.title}{!notification.read_at && <span className="ml-2 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">읽지 않음</span>}</p><p className="mt-1 leading-5">{notification.message}</p><p className="mt-1 text-[10px] text-slate-400">{notification.case_code || "Case"} · {new Date(notification.created_at).toLocaleString("ko-KR")}</p></button>)}</div>}
            </section>}
          </div>

          <button
            type="button"
            onClick={() => router.push("/respiratory/settings")}
            className="hidden text-right sm:block"
            aria-label="로그인 의료진 정보"
          >
            <span className="block max-w-[120px] truncate text-xs font-bold text-slate-800">
              {user?.name || "의료진"}
            </span>
            <span className="block text-[10px] text-slate-500">
              호흡기내과
            </span>
          </button>
          <ClinicianThemeToggle />

          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-blue-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {children}
      </main>
      </div>
    </div>
  );
}

function ShellNavButton({ icon, label, active, onClick, count, disabled = false }: { icon: "home" | "case" | "calendar" | "consultation" | "notification" | "help" | "settings"; label: string; active: boolean; onClick: () => void; count?: number; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled || undefined}
      aria-label={label}
      title={disabled ? `${label} 준비 중` : label}
      className={`group relative flex w-12 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium transition lg:w-14 ${disabled ? "cursor-not-allowed text-cyan-50/35" : active ? "bg-[#14b8a6] font-semibold text-white shadow-sm shadow-slate-950/30" : "text-cyan-50/80 hover:bg-white/10 hover:text-white"}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        {icon === "home" && <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>}
        {icon === "case" && <><path d="M3 7h7l2 2h9v11H3z" /><path d="M3 7V5h6l2 2" /></>}
        {icon === "calendar" && <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h8M8 17h5" /></>}
        {icon === "consultation" && <><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8M8 12h5" /></>}
        {icon === "notification" && <><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 22h4" /></>}
        {icon === "help" && <><circle cx="12" cy="12" r="8" /><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-1.2 1-1.7 1.4-1.7 2.7" /><path d="M12 17h.01" /></>}
        {icon === "settings" && <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1l.5 3h5l.5-3a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1Z" /></>}
      </svg>
      <span>{label}</span>
      <span role="tooltip" className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">{disabled ? `${label} 준비 중` : label}</span>
      {Boolean(count) && <span className="absolute right-0 top-0 rounded-full bg-rose-500 px-1 text-[9px] text-white">{count && count > 99 ? "99+" : count}</span>}
    </button>
  );
}
