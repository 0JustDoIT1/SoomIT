"use client";

import { useSyncExternalStore } from "react";

import {
  applyClinicianTheme,
  CLINICIAN_THEME_EVENT,
  CLINICIAN_THEME_STORAGE_KEY,
  getAppliedClinicianTheme,
} from "./clinician-theme";

function subscribe(onStoreChange: () => void) {
  const syncStoredTheme = (event: StorageEvent) => {
    if (event.key === CLINICIAN_THEME_STORAGE_KEY && (event.newValue === "light" || event.newValue === "dark")) {
      applyClinicianTheme(event.newValue, false);
    }
  };
  window.addEventListener(CLINICIAN_THEME_EVENT, onStoreChange);
  window.addEventListener("storage", syncStoredTheme);
  return () => {
    window.removeEventListener(CLINICIAN_THEME_EVENT, onStoreChange);
    window.removeEventListener("storage", syncStoredTheme);
  };
}

export function ClinicianThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getAppliedClinicianTheme, () => "light");
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => applyClinicianTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      aria-pressed={isDark}
      title={isDark ? "라이트 모드" : "다크 모드"}
      className={`clinician-theme-toggle inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-base text-slate-600 shadow-sm transition hover:border-blue-300 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${className}`}
    >
      <span aria-hidden="true">{isDark ? "☀" : "☾"}</span>
    </button>
  );
}
