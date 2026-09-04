import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import SidebarClock from "./SidebarClock";

export default function CoordinatorLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
        <div className="px-3 pb-5 pt-6">
          <Image src="/soomit_logo.png" alt="숨잇 로고" width={220} height={120} priority className="-ml-5 h-auto w-[180px] object-contain" />

          <div className="mt-4 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pink-300" />
            <p className="text-sm font-semibold text-slate-600">원무과</p>
          </div>
        </div>

        <div className="mx-5 border-t border-slate-100" />

        <nav className="mt-3 flex-1 space-y-1 px-3">
          <Link href="/coordinator/dashboard" className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-pink-50 hover:text-pink-600">
            대시보드
          </Link>

          <Link href="/coordinator/patients" className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-pink-50 hover:text-pink-600">
            환자 관리
          </Link>

          <Link href="/coordinator/cases" className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-pink-50 hover:text-pink-600">
            Case 목록
          </Link>

          <Link href="/coordinator/appointments" className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-pink-50 hover:text-pink-600">
            예약 관리
          </Link>
        </nav>

        <div className="mt-auto pb-3">
          <SidebarClock />
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-white px-6">
          <span className="text-sm text-gray-500">원무과</span>
          <span className="text-sm text-gray-600">Case Coordinator</span>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}