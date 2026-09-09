"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { ExpandableRail, type RailItem } from "@/components/workspace/expandable-rail";

const iconClassName = "h-5 w-5";

const navigation: RailItem[] = [
  {
    label: "Worklist",
    href: "/radiology",
    icon: <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg>,
  },
  {
    label: "전체 환자",
    href: "/radiology/patients",
    icon: <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}><path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M16 15a5 5 0 0 1 5 5" /></svg>,
  },
  {
    label: "AI 작업",
    href: "/radiology/ai",
    icon: <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2M9 9h6v6H9z" /></svg>,
  },
  {
    label: "완료 기록",
    href: "/radiology/history",
    icon: <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName}><path d="M4 7h16v13H4zM8 3v4M16 3v4M8 12h3M8 16h6" /></svg>,
  },
];

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
  const [mobileOpen, setMobileOpen] = useState(false);
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
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <ExpandableRail
        items={navigation}
        brand="영상의학 Workstation"
        userName={userName}
        userRole="방사선사"
        onLogout={handleLogout}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center border-b border-slate-200 bg-white px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="메뉴 열기"
            className="mr-3 rounded-md border border-slate-200 p-2 text-slate-600 lg:hidden"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div>
            <p className="text-sm font-semibold text-slate-800">영상의학과</p>
            <p className="text-xs text-slate-500">Radiology Workstation</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm font-semibold text-slate-700">{userName}</p>
            <p className="text-xs text-slate-500">방사선사</p>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
