"use client";

import Image from "next/image";
import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RespiratoryAuthProvider, useRespiratoryAuth } from "./_components/respiratory-auth-provider";

export default function RespiratoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <RespiratoryAuthProvider><AuthenticatedLayout>{children}</AuthenticatedLayout></RespiratoryAuthProvider>;
}

function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isReady, logout } = useRespiratoryAuth();
  const [isDark, setIsDark] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const enabled = window.localStorage.getItem("respiratory-dark-mode") === "true";
      setIsDark(enabled);
      document.documentElement.dataset.respiratoryTheme = enabled ? "dark" : "light";
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
          <button
            type="button"
            onClick={() => router.push("/respiratory/schedules")}
            className="rounded-md px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
          >
            진료 일정
          </button>

          <button
            type="button"
            onClick={() => router.push("/respiratory/dashboard")}
            className="rounded-md px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700"
          >
            홈
          </button>

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
            </button>
            {showNotifications && <section className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
              <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-800">알림</h2><button type="button" onClick={() => setShowNotifications(false)} aria-label="알림 닫기" className="text-slate-400">×</button></div>
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">검사 오더 수신 알림 API를 연결하면 새 오더와 결과 알림이 이곳에 표시됩니다.</p>
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
