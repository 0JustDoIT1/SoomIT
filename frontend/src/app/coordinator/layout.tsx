import Link from "next/link";
import type { ReactNode } from "react";

export default function CoordinatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-white">
        <div className="p-6">
          <h1 className="text-xl font-bold">숨잇 CDSS</h1>
          <p className="mt-1 text-sm text-gray-500">원무과</p>
        </div>

        <nav className="px-3">
          <Link
            href="/coordinator/dashboard"
            className="block rounded-lg px-4 py-3 text-sm hover:bg-gray-100"
          >
            대시보드
          </Link>

          <Link
            href="/coordinator/patients"
            className="block rounded-lg px-4 py-3 text-sm hover:bg-gray-100"
          >
            환자 관리
          </Link>

          <Link
            href="/coordinator/cases"
            className="block rounded-lg px-4 py-3 text-sm hover:bg-gray-100"
          >
            Case 목록
          </Link>

          <Link
            href="/coordinator/appointments"
            className="block rounded-lg px-4 py-3 text-sm hover:bg-gray-100"
          >
            예약 관리
          </Link>
        </nav>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-white px-6">
          <span className="text-sm text-gray-500">원무과</span>
          <span className="text-sm text-gray-600">Case Coordinator</span>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}