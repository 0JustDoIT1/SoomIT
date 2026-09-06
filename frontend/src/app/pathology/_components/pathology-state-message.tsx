import type { ReactNode } from "react";

type PathologyStateMessageProps = {
  variant: "error" | "info" | "loading" | "empty";
  title: ReactNode;
  description?: ReactNode;
  className?: string;
};

const variantStyle = {
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-slate-300 bg-slate-50 text-slate-700",
  loading: "border-blue-200 bg-blue-50 text-blue-700",
  empty: "border-slate-200 bg-slate-50 text-slate-600",
};

export function PathologyStateMessage({
  variant,
  title,
  description,
  className = "",
}: PathologyStateMessageProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`border px-5 py-4 text-sm ${variantStyle[variant]} ${className}`}
    >
      <p className="font-semibold">{title}</p>
      {description && (
        <p className="mt-1 text-xs leading-5 opacity-80">{description}</p>
      )}
    </div>
  );
}
