"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";

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

export function RadiologyShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const userName = useSyncExternalStore(
    subscribeToSessionStorage,
    getStoredUserName,
    () => "사용자",
  );

  function handleLogout() {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("user");
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-slate-50 text-slate-900">
      <header className="relative isolate shrink-0 border-b border-violet-100 bg-gradient-to-r from-violet-100/80 via-blue-50 to-emerald-50/50 before:pointer-events-none before:absolute before:inset-y-0 before:right-[4%] before:z-[-1] before:w-[52%] before:bg-[url('/images/radiology-ct-header.png')] before:bg-cover before:bg-[center_right] before:bg-no-repeat before:opacity-50 before:content-['']">
        <div className="mx-auto flex min-h-24 w-full max-w-[1760px] items-center px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-violet-600">영상의학과</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Radiology Workstation</p>
          </div>
          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <span className="hidden rounded-full border border-violet-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-sm sm:inline-flex">
              영상검사 업무
            </span>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-800">{userName}</p>
            </div>
            <button type="button" onClick={handleLogout} className="rounded-lg border border-violet-200 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-violet-300 hover:bg-white hover:text-violet-700">
              로그아웃
            </button>
          </div>
        </div>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
