"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type RailItem = {
  label: string;
  href: string;
  icon: ReactNode;
};

type ExpandableRailProps = {
  items: RailItem[];
  brand: string;
  userName: string;
  userRole: string;
  onLogout: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export function ExpandableRail({
  items,
  brand,
  userName,
  userRole,
  onLogout,
  mobileOpen,
  onMobileClose,
}: ExpandableRailProps) {
  const pathname = usePathname();

  const rail = (
    <div className="group flex h-full w-16 flex-col overflow-hidden border-r border-slate-200 bg-slate-950 text-white transition-[width] duration-200 focus-within:w-56 hover:w-56">
      <div className="flex h-16 shrink-0 items-center border-b border-slate-800 px-5">
        <span className="shrink-0 text-lg font-black text-cyan-300">S</span>
        <span className="ml-3 whitespace-nowrap text-sm font-bold opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {brand}
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4" aria-label={`${brand} 주요 메뉴`}>
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              onClick={onMobileClose}
              className={`flex h-11 items-center rounded-md border-l-2 px-3 text-sm font-medium transition-colors ${
                active
                  ? "border-cyan-300 bg-white/10 text-white"
                  : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">{item.icon}</span>
              <span className="ml-4 whitespace-nowrap opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-2">
        <div className="flex min-h-12 items-center px-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-800">
            {userName.slice(0, 1) || "사"}
          </span>
          <div className="ml-3 min-w-0 whitespace-nowrap opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <p className="truncate text-xs font-semibold">{userName}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">{userRole}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="로그아웃"
          aria-label="로그아웃"
          className="mt-1 flex h-10 w-full items-center rounded-md px-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 shrink-0">
            <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
          </svg>
          <span className="ml-4 whitespace-nowrap opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">로그아웃</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen shrink-0 lg:block">{rail}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="메뉴 닫기" onClick={onMobileClose} className="absolute inset-0 bg-slate-950/45" />
          <aside className="relative h-full w-56 shadow-2xl [&>div]:w-56 [&_span]:opacity-100">{rail}</aside>
        </div>
      ) : null}
    </>
  );
}
