"use client";

import type { ChangeEvent, HTMLInputTypeAttribute } from "react";
import styles from "./admin-login.module.css";

type AdminLoginInputProps = {
  id: string;
  type?: HTMLInputTypeAttribute;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  autoComplete?: string;
  icon: "user" | "lock";
  rightSlot?: React.ReactNode;
};

export function AdminLoginInput({
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  icon,
  rightSlot,
}: AdminLoginInputProps) {
  return (
    <div className={styles.inputWrap}>
      <span className={styles.inputIcon} aria-hidden="true">
        {icon === "user" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="8" r="3" />
            <path d="M5 20c.8-4 3.2-6 7-6s6.2 2 7 6" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        )}
      </span>

      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={styles.input}
      />

      {rightSlot ? <span className={styles.inputRight}>{rightSlot}</span> : null}
    </div>
  );
}