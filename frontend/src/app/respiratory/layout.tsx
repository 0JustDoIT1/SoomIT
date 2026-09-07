import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import SidebarClock from "./SidebarClock";

export default function RespiratoryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="px-3 pb-5 pt-6">
          <Image
            src="/soomit_logo.png"
            alt="숨잇 로고"
            width={220}
            height={120}
            priority
            className="-ml-5 h-auto w-[180px] object-contain"
          />

          <div className="mt-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <p className="text-sm font-semibold text-slate-600">
              호흡기내과
            </p>
          </div>
        </div>

        <div className="mx-5 border-t border-slate-100" />

        <nav className="mt-3 flex-1 space-y-1 px-3">
          <Link
            href="/respiratory/dashboard"
            className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-600"
          >
            대시보드
          </Link>

          <Link
            href="/respiratory/cases"
            className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-600"
          >
            담당 Case
          </Link>

          <Link
            href="/respiratory/results"
            className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-600"
          >
            검사 결과
          </Link>

          <Link
            href="/respiratory/ai-analysis"
            className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-600"
          >
            AI 분석
          </Link>

          <Link
            href="/respiratory/treatment"
            className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-600"
          >
            치료 결정
          </Link>

          <Link
            href="/respiratory/prescriptions"
            className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-600"
          >
            처방 관리
          </Link>
        </nav>

        <div className="mt-auto pb-3">
          <SidebarClock />
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-white px-6">
          <span className="text-sm text-gray-500">
            호흡기내과
          </span>

          <span className="text-sm text-gray-600">
            Respiratory Medicine
          </span>
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
