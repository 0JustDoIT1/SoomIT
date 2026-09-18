"use client";

export type FailureDetailField = { label: string; value: string };

export function FailureDetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  fields,
  message,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  fields: FailureDetailField[];
  message: string | null;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-700">실패 상세</p>
            <h2 className="mt-1 truncate text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="닫기"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-2.5">
              <dt className="text-[11px] font-medium text-slate-500">{field.label}</dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-slate-800" title={field.value}>{field.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3">
          <p className="text-[11px] font-medium text-red-600">오류 메시지</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-red-800">
            {message || "오류 메시지가 기록되지 않았습니다."}
          </p>
        </div>
      </div>
    </div>
  );
}
