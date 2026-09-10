"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Alert from "@/components/common/Alert";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { loginHospitalAdmin } from "../_lib/hospital-admin-api";
import { saveHospitalAdminSession } from "../_lib/hospital-admin-session";

export function HospitalAdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) { setError("아이디와 비밀번호를 입력해 주세요."); return; }
    setLoading(true); setError("");
    try {
      const result = await loginHospitalAdmin(username.trim(), password);
      saveHospitalAdminSession(result.access, result.refresh, result.user);
      router.replace("/hospital-admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "로그인 처리 중 오류가 발생했습니다.");
    } finally { setLoading(false); }
  }

  return <form onSubmit={submit} className="space-y-5"><Input id="hospital-admin-username" label="아이디" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /><Input id="hospital-admin-password" label="비밀번호" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /><Alert message={error} /><Button type="submit" loading={loading}>로그인</Button><p className="text-center text-xs text-slate-500">등록된 병원 관리자 계정으로 접속할 수 있습니다.</p></form>;
}
