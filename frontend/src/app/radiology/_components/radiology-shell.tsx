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
      <header className="h-16 shrink-0 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full w-full max-w-[1760px] items-center px-4 sm:px-6">
          <div>
            <p className="text-sm font-semibold text-slate-800">영상의학과</p>
            <p className="text-xs text-slate-500">Radiology Workstation</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-700">{userName}</p>
              <p className="text-xs text-slate-500">방사선사</p>
            </div>
            <button type="button" onClick={handleLogout} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              로그아웃
            </button>
          </div>
        </div>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
