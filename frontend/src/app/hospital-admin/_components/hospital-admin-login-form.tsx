"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AdminLoginInput } from "@/app/admin/admin-login-input";
import { AdminLoginButton } from "@/app/admin/admin-login-button";
import styles from "@/app/admin/admin-login.module.css";
import { loginHospitalAdmin } from "../_lib/hospital-admin-api";
import { saveHospitalAdminSession } from "../_lib/hospital-admin-session";

export function HospitalAdminLoginForm() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError("아이디와 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await loginHospitalAdmin(username.trim(), password);

      saveHospitalAdminSession(
        result.access,
        result.refresh,
        result.user,
      );

      router.replace("/hospital-admin");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "로그인 처리 중 오류가 발생했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.loginForm}>
      <AdminLoginInput
        id="hospital-admin-username"
        icon="user"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        placeholder="관리자 아이디를 입력해주세요"
        autoComplete="username"
      />

      <AdminLoginInput
        id="hospital-admin-password"
        icon="lock"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="비밀번호를 입력해주세요"
        autoComplete="current-password"
        rightSlot={
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            {showPassword ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                <path d="m3 3 18 18" />
                <path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a17.3 17.3 0 0 1-2.1 2.8" />
                <path d="M6.6 6.7C3.6 8.6 2 12 2 12s3.5 6 10 6a10.5 10.5 0 0 0 4.1-.8" />
              </svg>
            )}
          </button>
        }
      />

      {error ? <div className={styles.errorMessage}>{error}</div> : null}

      <AdminLoginButton type="submit" loading={loading}>
        로그인
      </AdminLoginButton>
    </form>
  );
}