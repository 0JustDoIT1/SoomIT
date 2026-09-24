"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { showToast } from "@/components/ui/toast/toast";

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

function getTodayLabel() {
  const today = new Date();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")} (${weekdays[today.getDay()]})`;
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
    showToast.dismiss();
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("user");
    router.replace("/login");
  }

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="coordinator-cursor min-h-screen bg-slate-50">
      {/* 상단 고정 영역 */}
      <header className="sticky top-0 z-50 bg-white">
        {/* 1. Header */}
        <div className="relative isolate overflow-hidden border-b border-[#F1E5EA] bg-[linear-gradient(105deg,#FFF9FB_0%,#FDEEF3_52%,#F8DFE8_100%)]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-[2%] z-0 hidden w-[32%] max-w-[560px] opacity-[0.12] lg:block">
            <svg viewBox="0 0 450 100" className="h-full w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g stroke="#D96B91" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="56" y="13" width="164" height="74" rx="10" />
                <path d="M56 37h164M91 7v14M185 7v14" />
                <path d="M86 52h17M126 52h17M166 52h17M86 72h17M126 72h17" />
              </g>
              <g stroke="#98A2B3" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M239 70h35c16 0 27-10 27-24V28" strokeDasharray="7 8" />
                <circle cx="360" cy="25" r="11" fill="#98A2B3" stroke="none" />
                <path d="M326 84c3-18 14-28 34-28s31 10 34 28M335 84h50" />
              </g>
              <g stroke="#D96B91" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="220" cy="78" r="17" fill="#FDF4F7" />
                <path d="m212 78 6 6 11-12" />
              </g>
            </svg>
          </div>
          <div className="relative z-10 mx-auto flex min-h-24 w-full max-w-[1760px] items-center px-4 py-5 sm:px-6">
            {/* Logo + Department */}
            <div>
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-[#D96B91]">
                  원무과
                </p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-[#243653]">
                  Patient Coordination
                </p>
              </div>
            </div>

            {/* 우측 */}
            <div className="ml-auto flex items-center gap-3 sm:gap-4">
              <span className="text-xs text-slate-400">{getTodayLabel()}</span>

              <div className="text-right">
                <p className="text-sm font-bold text-[#243653]">
                  {userName}
                </p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-[#E5DDE2] bg-white/80 px-3 py-2 text-xs font-semibold text-[#6B7280] shadow-sm transition hover:border-[#E8C9D5] hover:bg-white hover:text-[#D96B91]"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>

        {/* 2. 1차 탭 */}
        <div className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex h-[53px] w-full max-w-[1760px] items-end gap-8 px-4 sm:px-6">
            {tabs.map((tab) => {
              const active = isActive(tab.href);

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`relative flex h-full items-center px-0.5 text-sm font-semibold transition ${
                    active
                      ? "text-[#D96B91]"
                      : "text-[#7A8595] hover:text-[#243653]"
                  }`}
                >
                  {tab.label}

                  {active && (
                    <span className="absolute bottom-0 left-0 h-[2px] w-full rounded-full bg-[#D96B91]" />
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
