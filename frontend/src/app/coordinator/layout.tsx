"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";

const tabs = [
  {
    label: "대시보드",
    href: "/coordinator/dashboard",
  },
  {
    label: "환자 관리",
    href: "/coordinator/patients",
  },
  {
    label: "예약 관리",
    href: "/coordinator/appointments",
  },
];

function subscribeToSessionStorage() {
  return () => undefined;
}

function getStoredUserName() {
  const storedUser = sessionStorage.getItem("user");
  if (!storedUser) return "사용자";

  try {
    const user = JSON.parse(storedUser) as { name?: string; username?: string };
    return user.name || user.username || "사용자";
  } catch {
    return "사용자";
  }
}

export default function CoordinatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const userName = useSyncExternalStore(
    subscribeToSessionStorage,
    getStoredUserName,
    () => "사용자",
  );

  function handleLogout() {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("user");
    router.replace("/login");
  }

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 상단 고정 영역 */}
      <header className="sticky top-0 z-50 bg-white">
        {/* 1. Header */}
        <div className="relative overflow-hidden border-b border-slate-200/15 bg-gradient-to-r from-[#131D38] to-[#17223F]">
          <span aria-hidden="true" className="pointer-events-none absolute right-8 top-5 h-[2px] w-[2px] rounded-full bg-slate-100/15" />
          <span aria-hidden="true" className="pointer-events-none absolute right-16 top-11 h-[1px] w-[1px] rounded-full bg-slate-100/10" />
          <span aria-hidden="true" className="pointer-events-none absolute right-28 top-7 h-[2px] w-[2px] rounded-full bg-slate-100/10" />
          <div className="relative mx-auto flex h-[72px] w-full max-w-[1760px] items-center justify-between px-4 sm:px-6">
            {/* Logo + Department */}
            <div>
              <div>
                <p className="text-[15px] font-semibold text-white">
                  원무과
                </p>
                <p className="mt-0.5 text-[11px] text-white/60">
                  Patient Coordination
                </p>
              </div>
            </div>

            {/* 우측 */}
            <div className="flex items-center gap-4">
              {/* 알림 - 기능은 추후 연결 */}
              <button
                type="button"
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-200 transition hover:bg-white/10 hover:text-white"
                aria-label="알림"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>

                {/* 알림이 생기면 숫자로 변경 */}
                <span className="absolute right-[7px] top-[7px] h-1.5 w-1.5 rounded-full bg-pink-400" />
              </button>

              <div className="h-7 w-px bg-white/15" />

              <div className="text-right">
                <p className="text-sm font-semibold text-slate-100">
                  {userName}
                </p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-white/20 bg-transparent px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10 hover:text-white"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>

        {/* 2. 1차 탭 */}
        <div className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex h-[53px] w-full max-w-[1760px] items-end gap-9 px-4 sm:px-6">
            {tabs.map((tab) => {
              const active = isActive(tab.href);

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`relative flex h-full items-center px-0.5 text-sm font-semibold transition ${
                    active
                      ? "text-slate-900"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}

                  {active && (
                    <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-pink-400" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* 3. 페이지 본문 */}
      <main className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 sm:py-5">
        {children}
      </main>
    </div>
  );
}
