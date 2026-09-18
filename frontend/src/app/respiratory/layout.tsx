"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RespiratoryAuthProvider, useRespiratoryAuth } from "./_components/respiratory-auth-provider";
import { API_BASE_URL } from "@/lib/api";
import { requestCaseNavigation } from "./_lib/case-navigation-guard";

type StaffNotification = { id: string; title: string; message: string; case_id: string | null; case_code: string | null; created_at: string; read_at: string | null };
type NotificationResponse = { unread_count: number; results: StaffNotification[] };
type SearchCase = { id: string; patient_name: string; patient_code: string; case_code: string };

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
  const { authorizedFetch, isAuthenticated, isReady, logout } = useRespiratoryAuth();
  const [isDark, setIsDark] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationResponse>({ unread_count: 0, results: [] });
  const [notificationError, setNotificationError] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchCase[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [clock, setClock] = useState("");

  const loadNotifications = useCallback(async (silent = false) => {
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/notifications/me/?limit=20`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "알림을 불러오지 못했습니다.");
      setNotifications({ unread_count: Number(data.unread_count) || 0, results: Array.isArray(data.results) ? data.results : [] });
      setNotificationError("");
    } catch (error) {
      // Preserve the last known notification state on a transient background failure.
      if (!silent) setNotificationError(error instanceof Error ? error.message : "알림을 불러오지 못했습니다.");
    }
  }, [authorizedFetch]);

  async function openNotification(notification: StaffNotification) {
    if (notification.case_id && !requestCaseNavigation(notification.case_id)) return;
    if (!notification.read_at) {
      try {
        const response = await authorizedFetch(`${API_BASE_URL}/api/notifications/me/${notification.id}/read/`, { method: "PATCH" });
        if (response.ok) setNotifications((current) => ({
          unread_count: Math.max(current.unread_count - 1, 0),
          results: current.results.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item),
        }));
      } catch {
        // Reading a notification must not prevent the clinician opening its Case.
      }
    }
    setShowNotifications(false);
    if (notification.case_id) router.push(`/respiratory/cases/${notification.case_id}`);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const enabled = window.localStorage.getItem("respiratory-dark-mode") === "true";
      setIsDark(enabled);
      document.documentElement.dataset.respiratoryTheme = enabled ? "dark" : "light";
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isReady || !isAuthenticated) return;
    const initialTimer = window.setTimeout(() => void loadNotifications(), 0);
    let disposed = false;
    let polling = false;
    const pollNotifications = async () => {
      if (disposed || polling || document.hidden) return;
      polling = true;
      try {
        await loadNotifications(true);
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
  }, [isReady, isAuthenticated, loadNotifications]);

  useEffect(() => {
    const update = () => setClock(new Date().toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit" }));
    const initialTimer = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    return () => { window.clearTimeout(initialTimer); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const keyword = search.trim().toLowerCase();
    if (keyword.length < 2 || !isAuthenticated) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await authorizedFetch(`${API_BASE_URL}/api/doctor/cases/`, { signal: controller.signal });
        if (!response.ok) throw new Error("담당 Case를 검색할 수 없습니다.");
        const payload: unknown = await response.json();
        const cases = Array.isArray(payload) ? payload as SearchCase[] : payload && typeof payload === "object" && "results" in payload && Array.isArray(payload.results) ? payload.results as SearchCase[] : [];
        setSearchResults(cases.filter((item) => [item.patient_name, item.patient_code, item.case_code].some((value) => value?.toLowerCase().includes(keyword))).slice(0, 8));
        setSearchError("");
      } catch (error) {
        if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : "검색에 실패했습니다.");
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [authorizedFetch, isAuthenticated, search]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchResults[0]) openSearchCase(searchResults[0].id);
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

  function toggleTheme() {
    setIsDark((current) => {
      const next = !current;
      window.localStorage.setItem("respiratory-dark-mode", String(next));
      document.documentElement.dataset.respiratoryTheme = next ? "dark" : "light";
      return next;
    });
  }

  if (!isReady || !isAuthenticated) return null;

  return (
    <div className="respiratory-app flex h-dvh min-h-0 overflow-hidden bg-[#f3f7fd]">
      <aside className="flex w-[60px] shrink-0 flex-col items-center bg-[#123f4a] py-3 text-white shadow-[inset_-1px_0_0_rgba(148,210,210,0.16)] lg:w-[76px]" aria-label="호흡기내과 주 메뉴">
        <ShellNavButton icon="home" label="홈" active={pathname === "/respiratory/cases" || pathname === "/respiratory/dashboard"} onClick={() => router.push("/respiratory/cases")} />
        <ShellNavButton icon="case" label="Case" active={pathname.startsWith("/respiratory/cases/")} onClick={() => void openCaseWorkspace()} />
        <ShellNavButton icon="calendar" label="일정" active={pathname.startsWith("/respiratory/schedules")} onClick={() => router.push("/respiratory/schedules")} />
        <ShellNavButton icon="bell" label="알림" active={showNotifications} onClick={() => setShowNotifications((open) => !open)} count={notifications.unread_count} />
        <div className="mt-auto"><ShellNavButton icon="settings" label="설정" active={pathname.startsWith("/respiratory/settings")} onClick={() => router.push("/respiratory/settings")} /></div>
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
              <input id="respiratory-case-search" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setSearchResults([]); setSearchError(""); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} placeholder="환자명, 환자번호, Case 번호 검색" className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-500" />
            </div>
          </form>
          {searchOpen && search.trim().length >= 2 && <div className="absolute left-2 right-2 top-11 z-50 overflow-hidden rounded-xl border border-blue-100 bg-white shadow-xl">
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
              {notificationError ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs leading-5 text-rose-700">{notificationError}</p> : notifications.results.length === 0 ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">새 알림이 없습니다.</p> : <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{notifications.results.map((notification) => <button type="button" key={notification.id} onClick={() => void openNotification(notification)} className={`w-full rounded-lg border p-3 text-left text-xs transition hover:border-blue-300 ${notification.read_at ? "border-slate-100 bg-slate-50 text-slate-500" : "border-blue-100 bg-blue-50 text-slate-700"}`}><p className="font-bold">{notification.title}</p><p className="mt-1 leading-5">{notification.message}</p><p className="mt-1 text-[10px] text-slate-400">{notification.case_code || "Case"} · {new Date(notification.created_at).toLocaleString("ko-KR")}</p></button>)}</div>}
            </section>}
          </div>

          <button type="button" onClick={() => router.push("/respiratory/settings")} className="hidden text-right sm:block"><span className="block text-xs font-bold text-slate-800">담당의</span><span className="block text-[10px] text-slate-500">호흡기내과</span></button>
          <button type="button" onClick={toggleTheme} aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"} className="rounded-lg px-2 py-2 text-sm text-slate-500 hover:bg-blue-50">{isDark ? "☀" : "◐"}</button>

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

function ShellNavButton({ icon, label, active, onClick, count }: { icon: "home" | "case" | "calendar" | "bell" | "settings"; label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`${icon === "bell" ? "hidden" : "relative mb-1 flex w-12 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[11px] transition lg:w-14"} ${active ? "bg-[#14b8a6] font-bold text-white shadow-sm shadow-slate-950/30" : "text-cyan-50/80 hover:bg-white/10 hover:text-white"}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
        {icon === "home" && <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>}
        {icon === "case" && <><path d="M3 7h7l2 2h9v11H3z" /><path d="M3 7V5h6l2 2" /></>}
        {icon === "calendar" && <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10h16M8 14h8M8 17h5" /></>}
        {icon === "bell" && <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>}
        {icon === "settings" && <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1l.5 3h5l.5-3a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1Z" /></>}
      </svg>
      <span>{label}</span>
      {Boolean(count) && <span className="absolute right-0 top-0 rounded-full bg-rose-500 px-1 text-[9px] text-white">{count && count > 99 ? "99+" : count}</span>}
    </button>
  );
}
