"use client";

import {
  FormEvent,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import Input from "@/components/common/Input";
import Button from "@/components/common/Button";
import Alert from "@/components/common/Alert";
import { login } from "@/lib/api";
import type { LoginUser } from "@/types/auth";
import styles from "./LoginForm.module.css";

function getRedirectPath(
  user: LoginUser
): string {
  if (user.role === "MEDICAL_STAFF") {
    return "/coordinator/dashboard";
  }

  if (
    (user.role === "TECHNOLOGIST" || user.role === "DOCTOR") &&
    user.department.code === "PATHOLOGY"
  ) {
    return "/pathology";
  }

  if (
    user.role === "TECHNOLOGIST" &&
    user.department.code === "RADIOLOGY"
  ) {
    return "/radiology";
  }

  if (
    user.role === "DOCTOR" &&
    user.department.code === "PULMONOLOGY"
  ) {
    return "/respiratory/dashboard";
  }

  throw new Error(
    "현재 지원되지 않는 소속 또는 권한입니다."
  );
}

export default function LoginForm() {
  const router = useRouter();

  const [hospitalCode, setHospitalCode] =
    useState("");

  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!hospitalCode.trim()) {
      setError("병원 코드를 입력해주세요.");
      return;
    }

    if (!username.trim()) {
      setError("아이디를 입력해주세요.");
      return;
    }

    if (!password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await login({
        hospital_code: hospitalCode.trim(),
        username: username.trim(),
        password,
      });

      sessionStorage.setItem(
        "accessToken",
        response.access
      );

      sessionStorage.setItem(
        "refreshToken",
        response.refresh
      );

      sessionStorage.setItem(
        "user",
        JSON.stringify(response.user)
      );

      const redirectPath =
        getRedirectPath(response.user);

      router.replace(redirectPath);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(
          "로그인 처리 중 오류가 발생했습니다."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={styles.form}
    >
      <div className={styles.fieldWithIcon}>
        <span className={styles.fieldIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 21h16M6 21V6.5L12 3l6 3.5V21M9 8h1m4 0h1M9 12h1m4 0h1M9 16h1m4 0h1" />
          </svg>
        </span>
        <Input
          id="hospital-code"
          label="병원 코드"
          type="text"
          value={hospitalCode}
          onChange={(event) =>
            setHospitalCode(event.target.value)
          }
          autoComplete="organization"
          placeholder="병원 코드를 입력해주세요"
        />
      </div>

      <div className={styles.fieldWithIcon}>
        <span className={styles.fieldIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5.5 20c.6-4 2.8-6 6.5-6s5.9 2 6.5 6" />
          </svg>
        </span>
        <Input
          id="username"
          label="아이디"
          type="text"
          value={username}
          onChange={(event) =>
            setUsername(event.target.value)
          }
          autoComplete="username"
          placeholder="아이디를 입력해주세요"
        />
      </div>

      <div className={styles.fieldWithIcon}>
        <span className={styles.fieldIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </span>
        <Input
          id="password"
          label="비밀번호"
          type="password"
          value={password}
          onChange={(event) =>
            setPassword(event.target.value)
          }
          autoComplete="current-password"
          placeholder="비밀번호를 입력해주세요"
        />
      </div>

      <Alert message={error} />

      <Button
        type="submit"
        loading={loading}
      >
        로그인
      </Button>

      <p className={styles.notice}>
        승인된 병원 직원 계정으로만 접속할 수 있습니다.
      </p>
    </form>
  );
}
