"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type RailItem = {
  label: string;
  shortLabel?: string;
  href: string;
  icon: ReactNode;
  matchPrefix?: boolean;
};

type ExpandableRailProps = {
  items: RailItem[];
  brand: string;
  userName: string;
  userRole: string;
  onLogout: () => void;
};

export function ExpandableRail({
  items,
  brand,
  userName,
  userRole,
  onLogout,
}: ExpandableRailProps) {
  const pathname = usePathname();

  const rail = (
    <div className="flex h-full w-[76px] flex-col items-center overflow-hidden bg-[#123f4a] px-1 py-3 text-white shadow-[inset_-1px_0_0_rgba(148,210,210,0.16)]">
      <div
        className="mb-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 shadow-sm"
        title={brand}
      >
        <svg
          role="img"
          aria-label={brand}
          viewBox="0 0 40 40"
          className="h-10 w-10 drop-shadow-[0_4px_8px_rgba(0,0,0,0.18)]"
        >
          <defs>
            <linearGradient id="admin-soomit-mark-bg" x1="7" y1="5" x2="33" y2="35" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1b7883" />
              <stop offset="1" stopColor="#0d4d59" />
            </linearGradient>
            <linearGradient id="admin-soomit-breath-line" x1="6" y1="0" x2="34" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#73e1d5" stopOpacity=".45" />
              <stop offset=".5" stopColor="#a7fff3" />
              <stop offset="1" stopColor="#73e1d5" stopOpacity=".45" />
            </linearGradient>
          </defs>
          <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="url(#admin-soomit-mark-bg)" stroke="#8ee9df" strokeOpacity=".3" />
          <circle cx="20" cy="19" r="12.5" fill="none" stroke="#b9fff7" strokeOpacity=".1" />
          <text x="20" y="24.3" textAnchor="middle" fill="#f4fffd" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="700" letterSpacing="-.8">S</text>
          <path d="M6.5 28c3.1 0 3.3-3.3 5.7-3.3s2.8 3.3 5.3 3.3 2.8-3.3 5.3-3.3 2.8 3.3 5.3 3.3 2.7-3.3 5.4-3.3" fill="none" stroke="url(#admin-soomit-breath-line)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>

      <nav className="flex w-full flex-1 flex-col items-center gap-1" aria-label={`${brand} 주요 메뉴`}>
        {items.map((item) => {
          const active = pathname === item.href || Boolean(
            item.matchPrefix && pathname.startsWith(`${item.href}/`),
          );
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className={`group relative flex min-h-[58px] w-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-medium transition-all duration-150 ${
                active
                  ? "bg-[#14b8a6] font-semibold text-white shadow-[0_5px_14px_rgba(3,25,31,0.24)]"
                  : "text-cyan-50/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? "bg-white/10" : "group-hover:bg-white/5"}`}>
                {item.icon}
              </span>
              <span className="max-w-full truncate leading-none tracking-[-0.01em]">
                {item.shortLabel ?? item.label}
              </span>
              <span role="tooltip" className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex w-full flex-col items-center gap-1 border-t border-white/15 pt-3">
        <div className="flex min-h-[58px] w-14 flex-col items-center justify-center gap-1 text-cyan-50/80" title={`${userName} · ${userRole}`}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-50 text-[11px] font-bold text-[#123f4a]">
            {userName.slice(0, 1) || "사"}
          </span>
          <span className="text-[10px] leading-none">내 정보</span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="로그아웃"
          aria-label="로그아웃"
          className="group relative flex min-h-[58px] w-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-medium text-cyan-50/80 transition-all duration-150 hover:bg-white/10 hover:text-white"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg group-hover:bg-white/5">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[22px] w-[22px]">
              <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
            </svg>
          </span>
          <span className="leading-none">로그아웃</span>
        </button>
      </div>
    </div>
  );

  return <aside className="sticky top-0 h-screen w-[76px] shrink-0">{rail}</aside>;
}
