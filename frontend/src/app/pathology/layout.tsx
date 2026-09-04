import Link from "next/link";
import type { ReactNode } from "react";

import { PathologyAuthProvider } from "./_components/pathology-auth-provider";

export default function PathologyLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PathologyAuthProvider>
      <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="w-64 border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-5">
          <h1 className="text-xl font-bold text-blue-950">SoomIT CDSS</h1>
          <p className="mt-1 text-sm text-slate-500">병리과</p>
        </div>

        <nav className="space-y-1 p-3">
          <Link
            href="/pathology/work-items"
            className="block rounded-md bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800"
          >
            병리 작업목록
          </Link>

          <Link
            href="/pathology/specimens"
            className="block rounded-md px-4 py-3 text-sm text-slate-600 hover:bg-slate-100"
          >
            검체 관리
          </Link>

          <Link
            href="/pathology/slides"
            className="block rounded-md px-4 py-3 text-sm text-slate-600 hover:bg-slate-100"
          >
            WSI 슬라이드
          </Link>

          <Link
            href="/pathology/reports"
            className="block rounded-md px-4 py-3 text-sm text-slate-600 hover:bg-slate-100"
          >
            병리 보고서
          </Link>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
          <span className="text-sm font-medium">병리과 업무 시스템</span>

          <div className="text-right">
            <p className="text-sm font-medium">병리과 의료진</p>
            <p className="text-xs text-slate-500">Pathology Department</p>
          </div>
        </header>

        <main className="flex-1 p-8">{children}</main>
      </div>
      </div>
    </PathologyAuthProvider>
  );
}
