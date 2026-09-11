import type { ReactNode } from "react";

export default function PathologyLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-[1760px] px-4 py-3 sm:px-6">
          <p className="text-xs font-semibold text-blue-700">병리과</p>
          <h1 className="mt-0.5 text-base font-bold tracking-tight">
            Pathology Workstation
          </h1>
        </div>
      </header>
      {children}
    </div>
  );
}
