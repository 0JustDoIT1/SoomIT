import type { ReactNode } from "react";

export default function PathologyLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F8FC] text-slate-950">
      <header className="relative overflow-hidden border-b border-[#29399F] bg-[#3446B8] text-white">
        <div className="relative mx-auto w-full max-w-[1760px] px-4 py-3 sm:px-6">
          <span aria-hidden="true" className="absolute right-24 top-2 text-xs text-[#F28A3A]">✦</span>
          <span aria-hidden="true" className="absolute right-14 top-7 text-[8px] text-[#93A0ED]">●</span>
          <span aria-hidden="true" className="absolute right-7 top-2 text-[10px] text-white/50">✧</span>
          <p className="text-xs font-semibold text-[#DDE2FF]">병리과</p>
          <h1 className="mt-0.5 text-base font-bold tracking-tight text-white">
            Pathology Workstation
          </h1>
        </div>
      </header>
      {children}
    </div>
  );
}
