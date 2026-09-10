type StatusBadgeProps = {
  status: string;
  label?: string;
};

const statusStyles: Record<string, string> = {
  ORDERED: "bg-blue-50 text-blue-700 ring-blue-200",
  SCHEDULED: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-600 ring-slate-200",
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  RUNNING: "bg-blue-50 text-blue-700 ring-blue-200",
  SUCCEEDED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FAILED: "bg-red-50 text-red-700 ring-red-200",
  READY: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  UPLOADING: "bg-blue-50 text-blue-700 ring-blue-200",
  VALIDATING: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  INVALID: "bg-red-50 text-red-700 ring-red-200",
  REVIEW_COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REVIEW_PENDING: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  AI_FAILED: "bg-red-50 text-red-700 ring-red-200",
  AI_RUNNING: "bg-blue-50 text-blue-700 ring-blue-200",
  AI_READY: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  IMAGE_PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  EXAM_PENDING: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = statusStyles[status] ?? "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style}`}>
      {label ?? status}
    </span>
  );
}
