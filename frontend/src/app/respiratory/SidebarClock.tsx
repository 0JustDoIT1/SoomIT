"use client";

import { useEffect, useState } from "react";

export default function SidebarClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setNow(new Date()), 0);

    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, []);

  if (!now) return null;

  const hour = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    hour12: true,
  }).split(" ")[0];

  const minute = String(now.getMinutes()).padStart(2, "0");

  const period = now.getHours() >= 12 ? "PM" : "AM";

  const date = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  return (
    <div className="mx-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4 shadow-sm">
      <div className="flex items-center justify-center gap-2">
        <div className="rounded-lg border border-emerald-200 bg-white px-2.5 py-2">
          <span className="text-xl font-bold text-emerald-600">
            {hour}
          </span>
        </div>

        <span className="text-lg font-bold text-emerald-400">:</span>

        <div className="rounded-lg border border-emerald-200 bg-white px-2.5 py-2">
          <span className="text-xl font-bold text-emerald-600">
            {minute}
          </span>
        </div>

        <div className="rounded-lg border border-emerald-100 bg-white px-2 py-2">
          <span className="text-[10px] font-semibold text-emerald-500">
            {period}
          </span>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-slate-400">
        {date}
      </p>

      <p className="mt-2 text-center text-[11px] font-medium text-emerald-500">
        오늘도 좋은 하루 되세요!
      </p>
    </div>
  );
}
