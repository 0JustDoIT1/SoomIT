type LoadingIndicatorProps = {
  label?: string;
  className?: string;
};

/** A compact, layout-stable loading state for clinician workspaces. */
export function LoadingIndicator({
  label = "정보를 불러오는 중입니다.",
  className = "",
}: LoadingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-20 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-600 ${className}`}
    >
      <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      <span>{label}</span>
    </div>
  );
}
