"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./admin-login.module.css";

type AdminLoginButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  children: ReactNode;
};

export function AdminLoginButton({
  loading = false,
  children,
  disabled,
  ...props
}: AdminLoginButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={styles.loginButton}
    >
      <span>{loading ? "로그인 중..." : children}</span>
      {!loading && <span className={styles.loginArrow}>→</span>}
    </button>
  );
}