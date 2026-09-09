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
    user.role === "TECHNOLOGIST" &&
    user.department.code === "PATHOLOGY"
  ) {
    return "/pathology";
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
