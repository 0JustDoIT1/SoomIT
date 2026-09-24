"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { showToast } from "@/components/ui/toast/toast";

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

export function PathologyShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const userName = useSyncExternalStore(
    subscribeToSessionStorage,
    getStoredUserName,
    () => "사용자",
  );

  function handleLogout() {
    showToast.dismiss();
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("user");
    router.replace("/login");
  }

  return (
    <div className="pathology-cursor flex min-h-screen min-w-0 flex-col bg-[#F7F8FC] text-slate-950">
      <header className="relative shrink-0 overflow-hidden border-b border-[#CDD3EE] bg-gradient-to-r from-[#F8F7FF] via-[#F1F3FF] to-white">
        <Image src="/pathology/pathology-tissue-decor.png" alt="" aria-hidden="true" fill sizes="42vw" className="pointer-events-none !left-auto right-0 top-0 !w-[42%] object-cover opacity-[0.3]" />
        <div className="relative z-10 mx-auto flex min-h-24 w-full max-w-[1760px] items-center px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[#5364C7]">
              병리과
            </p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Pathology Workstation
            </p>
          </div>

          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <span className="hidden rounded-full border border-[#CDD3EE] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#3446B8] shadow-sm sm:inline-flex">
              병리검사 업무
            </span>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-800">{userName}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-[#CDD3EE] bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-[#93A0ED] hover:bg-white hover:text-[#3446B8]"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
