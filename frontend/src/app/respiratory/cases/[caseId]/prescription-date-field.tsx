"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { ko } from "react-day-picker/locale";

type PrescriptionDateFieldProps = {
  label: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value: string) {
  const date = parseDate(value);
  return date
    ? `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, "0")}. ${String(date.getDate()).padStart(2, "0")}.`
    : "날짜 선택";
}

export function PrescriptionDateField({
  label,
  name,
  value,
  defaultValue = "",
  onChange,
  required = false,
  disabled = false,
  className = "",
}: PrescriptionDateFieldProps) {
  const id = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const currentValue = value ?? internalValue;
  const selected = parseDate(currentValue);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(selected ?? new Date());
  const [position, setPosition] = useState({ left: 12, top: 12 });

  const updateValue = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
  };

  const openPicker = () => {
    if (disabled) return;
    setMonth(selected ?? new Date());
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 304;
      const estimatedHeight = 376;
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      const fitsBelow = window.innerHeight - rect.bottom >= estimatedHeight;
      const top = fitsBelow
        ? rect.bottom + 8
        : Math.max(12, rect.top - estimatedHeight - 8);
      setPosition({ left, top });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
      </label>
      <div ref={anchorRef} className="relative mt-1">
        <input
          id={id}
          role="combobox"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={`${id}-dialog`}
          value={currentValue}
          onChange={(event) => updateValue(event.target.value)}
          onClick={openPicker}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openPicker();
            }
          }}
          readOnly
          disabled={disabled}
          required={required}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        {name && <input type="hidden" name={name} value={currentValue} disabled={disabled} />}
        <button
          type="button"
          disabled={disabled}
          tabIndex={-1}
          onClick={openPicker}
          aria-label={`${label} 달력 열기`}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`flex h-9 w-full items-center justify-between rounded-lg border bg-white px-3 text-left text-xs transition disabled:cursor-not-allowed disabled:bg-slate-50 ${
            open
              ? "border-blue-500 ring-2 ring-blue-100"
              : "border-slate-200 hover:border-slate-300"
          }`}
        >
          <span className={currentValue ? "font-medium text-slate-700" : "text-slate-400"}>
            {displayDate(currentValue)}
          </span>
          <CalendarIcon />
        </button>
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <div
          id={`${id}-dialog`}
          ref={popoverRef}
          role="dialog"
          aria-label={`${label} 선택`}
          style={{ left: position.left, top: position.top }}
          className="fixed z-[100] w-[304px] rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
        >
          <DayPicker
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={(date) => {
              if (!date) return;
              updateValue(formatDate(date));
              setOpen(false);
            }}
            locale={ko}
            showOutsideDays
            formatters={{
              formatCaption: (date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`,
              formatWeekdayName: (date) => ["일", "월", "화", "수", "목", "금", "토"][date.getDay()],
            }}
            classNames={{
              root: "relative text-sm text-slate-700",
              months: "flex",
              month: "w-full space-y-3",
              month_caption: "flex h-9 items-center justify-center",
              caption_label: "text-sm font-bold text-slate-800",
              nav: "absolute inset-x-0 top-0 flex h-9 items-center justify-between",
              button_previous: "flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800",
              button_next: "flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800",
              chevron: "h-4 w-4 fill-current",
              month_grid: "w-full border-collapse",
              weekdays: "border-b border-slate-100",
              weekday: "h-9 text-center text-[11px] font-semibold text-slate-400 first:text-rose-400 last:text-blue-500",
              week: "",
              day: "h-9 w-10 p-0 text-center",
              day_button: "mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
              selected: "[&>button]:bg-blue-600 [&>button]:font-bold [&>button]:text-white [&>button]:shadow-sm [&>button]:hover:bg-blue-600 [&>button]:hover:text-white",
              today: "[&>button]:font-bold [&>button]:text-blue-600 [&>button]:ring-1 [&>button]:ring-blue-200",
              outside: "[&>button]:text-slate-300",
            }}
          />
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              disabled={required || !currentValue}
              onClick={() => {
                updateValue("");
                setOpen(false);
              }}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 disabled:invisible"
            >
              선택 해제
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                updateValue(formatDate(today));
                setOpen(false);
              }}
              className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-100"
            >
              오늘
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
