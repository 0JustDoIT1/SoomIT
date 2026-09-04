"use client";

import { useEffect, useState } from "react";

export default function SidebarClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const delay = 60000 - (new Date().getSeconds() * 1000 + new Date().getMilliseconds());
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60000);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const hour = now.toLocaleTimeString("en-US", { hour: "2-digit", hour12: true }).split(":")[0];
  const minute = now.toLocaleTimeString("en-US", { minute: "2-digit" });
  const ampm = now.getHours() < 12 ? "AM" : "PM";
  const date = now.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });

  return (
    <div className="mx-4 mb-5 rounded-2xl border border-pink-100 bg-gradient-to-br from-pink-50 to-white px-4 py-4 shadow-sm">
      <div className="flex items-center justify-center gap-1.5">
        <div className="flex h-11 min-w-[45px] items-center justify-center rounded-lg border border-pink-200 bg-pink-100/70 px-2 shadow-sm">
          <span className="text-[22px] font-bold tracking-wide text-pink-500">{hour}</span>
        </div>

        <span className="text-lg font-bold text-pink-300">:</span>

        <div className="flex h-11 min-w-[45px] items-center justify-center rounded-lg border border-pink-200 bg-pink-100/70 px-2 shadow-sm">
          <span className="text-[22px] font-bold tracking-wide text-pink-500">{minute}</span>
        </div>

        <div className="ml-1 rounded-md border border-pink-100 bg-white px-1.5 py-1">
          <span className="text-[10px] font-semibold text-pink-400">{ampm}</span>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] font-medium text-slate-400">{date}</p>
      <p className="mt-1.5 text-center text-[11px] text-pink-400">오늘도 좋은 하루 되세요!</p>
    </div>
  );
}

