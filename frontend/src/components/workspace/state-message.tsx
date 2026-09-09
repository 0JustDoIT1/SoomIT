import type { ReactNode } from "react";

type StateMessageProps = {
  variant: "loading" | "empty" | "error" | "unsupported";
  title: ReactNode;
  description?: ReactNode;
  className?: string;
};

const variantStyles = {
  loading: "border-blue-200 bg-blue-50 text-blue-800",
  empty: "border-slate-200 bg-slate-50 text-slate-700",
  error: "border-red-200 bg-red-50 text-red-700",
  unsupported: "border-amber-200 bg-amber-50 text-amber-800",
};

export function StateMessage({
  variant,
  title,
  description,
  className = "",
}: StateMessageProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`border px-4 py-3 text-sm ${variantStyles[variant]} ${className}`}
    >
      <p className="font-semibold">{title}</p>
      {description ? (
        <p className="mt-1 text-xs leading-5 opacity-80">{description}</p>
      ) : null}
    </div>
  );
}
