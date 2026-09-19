import type { ReactNode } from "react";
import { toast as sonnerToast } from "sonner";
import type { PromiseToastOptions, ShowToastOptions } from "./toast.types";

type ToastKind = "success" | "info" | "warning" | "error";

// warning/error stay on screen longer since they usually require the user to
// read and act; success/info are quick acknowledgements. Override per-call via
// the `duration` option when a specific screen needs something different.
const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 3000,
  info: 3000,
  warning: 5000,
  error: 5000,
};

function toSonnerOptions(kind: ToastKind, options?: ShowToastOptions) {
  return {
    description: options?.description,
    id: options?.id,
    action: options?.action,
    duration: options?.duration ?? DEFAULT_DURATION[kind],
    dismissible: options?.dismissible ?? true,
  };
}

/**
 * Team-wide toast API. Wraps sonner so every screen calls the same shape
 * instead of importing `sonner` directly with ad-hoc options.
 *
 * Passing the same `id` again (e.g. for a status that can repeat, like
 * "AI 분석 중입니다.") replaces the existing toast instead of stacking a new
 * one - this is sonner's built-in id-based de-duplication, not custom state.
 */
export const showToast = {
  success: (title: ReactNode, options?: ShowToastOptions) =>
    sonnerToast.success(title, toSonnerOptions("success", options)),
  info: (title: ReactNode, options?: ShowToastOptions) =>
    sonnerToast.info(title, toSonnerOptions("info", options)),
  warning: (title: ReactNode, options?: ShowToastOptions) =>
    sonnerToast.warning(title, toSonnerOptions("warning", options)),
  error: (title: ReactNode, options?: ShowToastOptions) =>
    sonnerToast.error(title, toSonnerOptions("error", options)),
  promise: <T,>(promise: Promise<T>, options: PromiseToastOptions<T>) =>
    sonnerToast.promise(promise, options),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};
