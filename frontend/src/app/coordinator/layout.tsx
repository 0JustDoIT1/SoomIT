"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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

export default function CoordinatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 상단 고정 영역 */}
      <header className="sticky top-0 z-50 bg-white">
        {/* 1. Header */}
        <div className="border-b border-slate-200">
          <div className="mx-auto flex h-[72px] w-full max-w-[1760px] items-center justify-between px-4 sm:px-6">
            {/* Logo + Department */}
            <div className="flex items-center gap-6">
              <Link
                href="/coordinator/dashboard"
                className="flex items-center"
                aria-label="원무과 대시보드로 이동"
              >
                <Image
                  src="/logo2.png"
                  alt="숨잇 로고"
                  width={150}
                  height={70}
                  priority
                  className="h-auto w-[125px] object-contain"
                />
              </Link>

              <div className="h-7 w-px bg-slate-200" />

              <div>
                <p className="text-[15px] font-bold text-slate-800">
                  원무과
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Patient Coordination
                </p>
              </div>
            </div>

            {/* 우측 */}
            <div className="flex items-center gap-4">
              {/* 알림 - 기능은 추후 연결 */}
              <button
                type="button"
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-pink-50 hover:text-pink-500"
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

              <div className="h-7 w-px bg-slate-200" />

              <div className="text-right">
                <p className="text-sm font-semibold text-slate-700">
                  원무과
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  원무과 담당자
                </p>
              </div>
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
      <main className="mx-auto w-full max-w-[1760px] px-4 py-5 sm:px-6 sm:py-6">
        {children}
      </main>
    </div>
  );
}