"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

type NavigationItem = {
  label: string;
  href?: string;
  icon: "home" | "queue" | "case" | "slide" | "analysis" | "report" | "bell" | "timeline" | "users" | "handoff";
};

const primaryNavigation: NavigationItem[] = [
  { label: "대시보드", href: "/pathology", icon: "home" },
  { label: "업무 대기열", href: "/pathology/work-items", icon: "queue" },
  { label: "케이스·검체", href: "/pathology/specimens", icon: "case" },
  { label: "WSI 등록", href: "/pathology/slides", icon: "slide" },
  {
    label: "검체 적정성 분석",
    href: "/pathology/adequacy",
    icon: "analysis",
  },
  { label: "병리 AI", href: "/pathology/ai-analysis", icon: "analysis" },
  { label: "PD-L1·경로 분석", icon: "analysis" },
  { label: "병리 보고서", icon: "report" },
  { label: "알림", icon: "bell" },
  { label: "임상 타임라인", icon: "timeline" },
];

const collaborationNavigation: NavigationItem[] = [
  { label: "케이스 협업", icon: "users" },
  { label: "업무 인계", icon: "handoff" },
];

function NavigationIcon({ icon }: { icon: NavigationItem["icon"] }) {
  const paths: Record<NavigationItem["icon"], ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6" />,
    queue: <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />,
    case: <path d="M4 7h16v13H4zM8 7V4h8v3M8 12h8M8 16h5" />,
    slide: <path d="M5 3h14v18H5zM8 7h8M8 11h5M15.5 15.5l3 3M16.5 13.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
    analysis: <path d="M12 3v4M12 17v4M4.2 7.5l3.4 2M16.4 14.5l3.4 2M4.2 16.5l3.4-2M16.4 9.5l3.4-2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />,
    report: <path d="M6 3h9l3 3v15H6zM14 3v4h4M9 11h6M9 15h6" />,
    bell: <path d="M6 16h12l-1.5-2v-4.5a4.5 4.5 0 0 0-9 0V14L6 16ZM10 19h4" />,
    timeline: <path d="M7 3v4M17 3v4M4 7h16v13H4zM8 11h3M8 15h3M14 11h2M14 15h2" />,
    users: <path d="M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M16 15a5 5 0 0 1 5 5" />,
    handoff: <path d="M4 7h12M12 3l4 4-4 4M20 17H8M12 13l-4 4 4 4" />,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      {paths[icon]}
    </svg>
  );
}

function SidebarNavigation({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();

  function renderItem(item: NavigationItem) {
    const active = Boolean(
      item.href &&
        (pathname === item.href ||
          (item.href !== "/pathology" &&
            pathname.startsWith(`${item.href}/`))),
    );
    const content = (
      <>
        <NavigationIcon icon={item.icon} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {!item.href && (
          <span className="text-[10px] font-medium text-blue-200/70">준비 중</span>
        )}
      </>
    );
    const className = `flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
      active
        ? "bg-blue-600 text-white shadow-sm"
        : item.href
          ? "text-blue-50 hover:bg-white/10"
          : "cursor-default text-blue-100/55"
    }`;

    return item.href ? (
      <Link key={item.label} href={item.href} onClick={onNavigate} className={className}>
        {content}
      </Link>
    ) : (
      <div key={item.label} className={className} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <nav aria-label="병리과 주요 메뉴" className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-0.5 px-3 py-4">
        {primaryNavigation.map(renderItem)}
      </div>
      <div className="mx-4 mt-auto border-t border-blue-800/80 pt-3">
        <div className="space-y-0.5">{collaborationNavigation.map(renderItem)}</div>
      </div>
    </nav>
  );
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-blue-950 to-[#062d61] text-white">
      <div className="border-b border-blue-800/80 px-5 py-5">
        <p className="text-xl font-bold tracking-tight">LUNG-CDSS</p>
        <p className="mt-1 text-xs text-blue-100/75">폐암 진단·치료 지원 시스템</p>
      </div>

      <SidebarNavigation onNavigate={onNavigate} />

      <div className="mx-4 mt-3 border-t border-blue-800/80 px-1 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-semibold">
            병
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">병리과 의료진</p>
            <p className="mt-0.5 truncate text-xs text-blue-100/70">병리과</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PathologyShell({ children }: { children: ReactNode }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [search, setSearch] = useState("");

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  const today = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">
        <Sidebar onNavigate={() => undefined} />
      </aside>

      {mobileNavigationOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setMobileNavigationOpen(false)}
            className="absolute inset-0 bg-slate-950/45"
          />
          <aside className="relative h-full w-72 max-w-[85vw] shadow-2xl">
            <Sidebar onNavigate={() => setMobileNavigationOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-16 items-center gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 xl:px-8">
          <button
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setMobileNavigationOpen(true)}
            className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <p suppressHydrationWarning className="hidden whitespace-nowrap text-sm font-medium text-slate-600 xl:block">
            {today}
          </p>

          <form onSubmit={handleSearch} role="search" className="ml-auto w-full max-w-md">
            <label className="relative block">
              <span className="sr-only">병리과 통합 검색</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">
                <circle cx="11" cy="11" r="6" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="환자명 · 케이스 번호 · 검체 번호 검색"
                className="w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </form>

          <button
            type="button"
            aria-label="알림"
            title="알림 화면 준비 중"
            className="relative shrink-0 rounded-md p-2 text-slate-600 hover:bg-slate-100"
          >
            <NavigationIcon icon="bell" />
          </button>

          <div className="hidden shrink-0 border-l border-slate-200 pl-4 text-right sm:block">
            <p className="text-sm font-semibold text-slate-800">병리과 의료진</p>
            <p className="mt-0.5 text-xs text-slate-500">Pathology Department</p>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8">{children}</main>
      </div>
    </div>
  );
}
