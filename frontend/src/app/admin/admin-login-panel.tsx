"use client";

import { useState } from "react";
import { SystemAdminLoginForm } from "../system-admin/_components/system-admin-login-form";
import { HospitalAdminLoginForm } from "../hospital-admin/_components/hospital-admin-login-form";
import styles from "./admin-login.module.css";

export function AdminLoginPanel() {
  const [type, setType] = useState<"system" | "hospital">("system");

  return (
    <div className={styles.panel}>
      <div
        className={styles.adminTypeTabs}
        role="tablist"
        aria-label="관리자 유형"
      >
        <button
          type="button"
          role="tab"
          aria-selected={type === "system"}
          onClick={() => setType("system")}
          className={`${styles.adminTypeButton} ${
            type === "system" ? styles.adminTypeButtonActive : ""
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15.4a1.7 1.7 0 0 0-1.56-1.03H5v-3h.08A1.7 1.7 0 0 0 6.64 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 10.3 6.3a1.7 1.7 0 0 0 1.03-1.56V4h3v.08a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19 9.3a1.7 1.7 0 0 0 1.56 1.03H21v3h-.08A1.7 1.7 0 0 0 19.4 15Z" />
          </svg>
          시스템 관리자
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={type === "hospital"}
          onClick={() => setType("hospital")}
          className={`${styles.adminTypeButton} ${
            type === "hospital" ? styles.adminTypeButtonActive : ""
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="3" />
            <path d="M5 20c.8-4 3.2-6 7-6s6.2 2 7 6" />
          </svg>
          병원 관리자
        </button>
      </div>

      <div className={styles.formArea}>
        {type === "system" ? (
          <SystemAdminLoginForm />
        ) : (
          <HospitalAdminLoginForm />
        )}
      </div>
    </div>
  );
}