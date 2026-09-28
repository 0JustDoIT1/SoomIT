"use client";

import { useState } from "react";

type PrescriptionTimeFieldProps = {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
};

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export function PrescriptionTimeField({ name, label, defaultValue = "", required = false }: PrescriptionTimeFieldProps) {
  const [initialHour = "", initialMinute = ""] = defaultValue.slice(0, 5).split(":");
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  const value = hour && minute ? `${hour}:${minute}` : "";

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-medium text-slate-700">
        {label}{required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
      </legend>
      <div className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 shrink-0 text-slate-400">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <select aria-label={`${label} 시`} value={hour} onChange={(event) => setHour(event.target.value)} className="min-w-0 flex-1 appearance-none bg-transparent px-1 py-1.5 text-center text-sm font-semibold text-slate-700 outline-none">
          <option value="">시</option>
          {hours.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <span aria-hidden="true" className="font-bold text-slate-400">:</span>
        <select aria-label={`${label} 분`} value={minute} onChange={(event) => setMinute(event.target.value)} className="min-w-0 flex-1 appearance-none bg-transparent px-1 py-1.5 text-center text-sm font-semibold text-slate-700 outline-none">
          <option value="">분</option>
          {minutes.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <span className="shrink-0 text-[10px] font-semibold text-slate-400">24시간</span>
      </div>
      <input type="hidden" name={name} value={value} readOnly />
    </fieldset>
  );
}
