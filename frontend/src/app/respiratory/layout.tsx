"use client";

import Image from "next/image";
import { ReactNode } from "react";
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

  if (!isReady || !isAuthenticated) return null;

  return (
    <div className="h-dvh min-h-0 overflow-hidden bg-slate-50">
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
            className="rounded-md px-2 py-2 text-xs font-medium text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
          >
            <span aria-hidden="true">⚙</span> 설정
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
