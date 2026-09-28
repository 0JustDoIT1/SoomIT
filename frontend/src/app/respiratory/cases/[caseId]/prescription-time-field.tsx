"use client";

import { useState } from "react";

type PrescriptionTimeFieldProps = {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
};

function formatTimeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isValidTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match !== null && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

export function PrescriptionTimeField({ name, label, defaultValue = "", required = false }: PrescriptionTimeFieldProps) {
  const [time, setTime] = useState(() => formatTimeInput(defaultValue));
  const validTime = isValidTime(time);
  const helpId = `${name}-format-help`;

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-xs font-medium text-slate-700">
        {label}{required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
      </legend>
      <div className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 shrink-0 text-slate-400">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <input
          aria-label={label}
          aria-describedby={helpId}
          autoComplete="off"
          inputMode="numeric"
          maxLength={5}
          placeholder="09:00"
          value={time}
          onChange={(event) => setTime(formatTimeInput(event.target.value))}
          className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-center text-sm font-semibold tabular-nums text-slate-700 outline-none placeholder:font-medium placeholder:text-slate-300"
        />
        <span className="shrink-0 text-[10px] font-semibold text-slate-400">24시간</span>
      </div>
      <p id={helpId} className="mt-1 text-[10px] text-slate-400">예: 09:00</p>
      <input type="hidden" name={name} value={validTime ? time : ""} readOnly />
    </fieldset>
  );
}
