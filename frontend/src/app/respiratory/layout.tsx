"use client";

import Image from "next/image";
import { ReactNode } from "react";
import { useRouter } from "next/navigation";

export default function RespiratoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-20 items-center justify-between border-b border-emerald-100 bg-white pl-2 pr-8">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => router.push("/respiratory/dashboard")}
            className="flex items-center"
          >
            <Image
              src="/logo2.png"
              alt="숨잇 로고"
              width={120}
              height={60}
              priority
              className="w-[120px] object-contain"
            />
          </button>

          <div className="h-8 w-px bg-slate-200" />

          <div>
            <p className="text-base font-bold text-slate-800">
              호흡기내과
            </p>

            <p className="mt-0.5 text-xs text-slate-400">
              Respiratory Medicine
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => router.push("/respiratory/dashboard")}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700"
          >
            홈
          </button>

          <div className="h-7 w-px bg-slate-200" />

          <div className="text-right">
            <p className="text-sm font-semibold text-slate-700">
              담당의
            </p>

            <p className="mt-0.5 text-xs text-slate-400">
              SoomIT CDSS
            </p>
          </div>

          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700"
          >
            <span aria-hidden="true">⚙</span> 설정
          </button>

          <button
            type="button"
            className="rounded-xl border border-emerald-100 px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700"
          >
            로그아웃
          </button>
        </div>
      </header>

      <main className="min-h-[calc(100vh-80px)]">
        {children}
      </main>
    </div>
  );
}
