"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

type ToastTone = "success" | "warning" | "error";
type Toast = { id: number; message: string; tone: ToastTone };
type ToastContextValue = { showToast: (message: string, tone?: ToastTone) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

const toneClass: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

export function RespiratoryToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return <ToastContext.Provider value={value}>{children}<section aria-live="polite" aria-label="작업 알림" className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">{toasts.map((toast) => <div key={toast.id} role="status" className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${toneClass[toast.tone]}`}>{toast.message}</div>)}</section></ToastContext.Provider>;
}

export function useRespiratoryToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("RespiratoryToastProvider is required.");
  return value;
}
