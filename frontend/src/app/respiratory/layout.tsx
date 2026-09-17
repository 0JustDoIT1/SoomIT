"use client";

import Image from "next/image";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RespiratoryAuthProvider, useRespiratoryAuth } from "./_components/respiratory-auth-provider";
import { API_BASE_URL } from "@/lib/api";

type StaffNotification = { id: string; title: string; message: string; case_id: string | null; case_code: string | null; created_at: string; read_at: string | null };
type NotificationResponse = { unread_count: number; results: StaffNotification[] };

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

  const loadNotifications = useCallback(async () => {
    try {
      const response = await authorizedFetch(`${API_BASE_URL}/api/notifications/me/?limit=20`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "알림을 불러오지 못했습니다.");
      setNotifications({ unread_count: Number(data.unread_count) || 0, results: Array.isArray(data.results) ? data.results : [] });
      setNotificationError("");
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : "알림을 불러오지 못했습니다.");
    }
  }, [authorizedFetch]);

  async function openNotification(notification: StaffNotification) {
    if (!notification.read_at) {
      const response = await authorizedFetch(`${API_BASE_URL}/api/notifications/me/${notification.id}/read/`, { method: "PATCH" });
      if (response.ok) setNotifications((current) => ({
        unread_count: Math.max(current.unread_count - 1, 0),
        results: current.results.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item),
      }));
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
    const timer = window.setInterval(() => void loadNotifications(), 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [isReady, isAuthenticated, loadNotifications]);

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
    <div className="respiratory-app h-dvh min-h-0 overflow-hidden bg-slate-50">
      <header className="flex h-[54px] items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/respiratory/dashboard")}
            className="flex items-center"
          >
            <Image
              src="/logo2.png"
              alt="숨잇 로고"
              width={102}
              height={42}
              priority
              className="w-[102px] object-contain"
            />
          </button>

          <div className="h-6 w-px bg-slate-200" />

          <div>
            <p className="whitespace-nowrap text-sm font-bold text-slate-800">
              호흡기내과 통합 진료
            </p>

            <p className="text-[10px] text-slate-400">
              Respiratory Medicine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HeaderNavButton
            active={pathname.startsWith("/respiratory/schedules")}
            label="진료 일정"
            onClick={() => router.push("/respiratory/schedules")}
          />

          <HeaderNavButton
            active={pathname === "/respiratory/cases" || pathname === "/respiratory/dashboard"}
            label="업무함"
            onClick={() => router.push("/respiratory/cases")}
          />

          <div className="mx-1 h-6 w-px bg-slate-200" />

          <div className="text-right">
            <p className="text-xs font-semibold text-slate-700">
              담당의
            </p>

            <p className="text-[10px] text-slate-400">
              SoomIT CDSS
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/respiratory/settings")}
            className="rounded-md px-2 py-2 text-xs font-medium text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
          >
            <span aria-hidden="true">⚙</span> 설정
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications((open) => !open)}
              aria-label="알림"
              aria-expanded={showNotifications}
              className="relative rounded-md px-2 py-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
            >
              <span aria-hidden="true" className="text-base">🔔</span>
              {notifications.unread_count > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">{notifications.unread_count > 99 ? "99+" : notifications.unread_count}</span>}
            </button>
            {showNotifications && <section className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-800">알림</h2><button type="button" onClick={() => setShowNotifications(false)} aria-label="알림 닫기" className="text-slate-400">×</button></div>
              {notificationError ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs leading-5 text-rose-700">{notificationError}</p> : notifications.results.length === 0 ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">새 알림이 없습니다.</p> : <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{notifications.results.map((notification) => <button type="button" key={notification.id} onClick={() => void openNotification(notification)} className={`w-full rounded-lg border p-3 text-left text-xs transition hover:border-blue-300 ${notification.read_at ? "border-slate-100 bg-slate-50 text-slate-500" : "border-blue-100 bg-blue-50 text-slate-700"}`}><p className="font-bold">{notification.title}</p><p className="mt-1 leading-5">{notification.message}</p><p className="mt-1 text-[10px] text-slate-400">{notification.case_code || "Case"} · {new Date(notification.created_at).toLocaleString("ko-KR")}</p></button>)}</div>}
            </section>}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
            title={isDark ? "라이트 모드" : "다크 모드"}
            className="rounded-md px-2 py-2 text-base text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
          >
            {isDark ? "☀" : "◐"}
          </button>

          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="h-[calc(100dvh-54px)] min-h-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}

function HeaderNavButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-3 py-2 text-xs font-semibold transition ${active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"}`}
    >
      {label}
    </button>
  );
}
