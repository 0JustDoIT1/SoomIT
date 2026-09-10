import type { ButtonHTMLAttributes, ReactNode } from "react";

export function SystemAdminActionButton({
  children, className = "", disabled, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={`rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 ${className}`}
    >
      {children}
    </button>
  );
}
