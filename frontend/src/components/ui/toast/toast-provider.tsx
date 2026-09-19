"use client";

import { Toaster } from "sonner";

// Mounted once at the app root (see src/app/layout.tsx). Position, colors and
// the close button policy are fixed here so every screen gets the same toast
// behavior instead of each page configuring its own <Toaster />.
export function AppToastProvider() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: "rounded-2xl border border-slate-200 shadow-sm",
          title: "font-semibold text-slate-900",
          description: "text-slate-500",
        },
      }}
    />
  );
}
