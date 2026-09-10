"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Alert from "@/components/common/Alert";
import Input from "@/components/common/Input";
import { StateMessage } from "@/components/workspace/state-message";
import { createStaff, fetchDepartments, fetchStaff, HospitalAdminApiError, type Department, type Staff } from "../_lib/hospital-admin-api";
import { getHospitalAdminAccessToken } from "../_lib/hospital-admin-session";

const apiMessage = (caught: unknown) => caught instanceof HospitalAdminApiError && caught.status === 401 ? "인증이 만료되었습니다. 다시 로그인해 주세요." : caught instanceof HospitalAdminApiError && caught.status === 403 ? "병원 관리자 권한이 없습니다." : caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다.";

export function StaffManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({ department_role_id: "", login_id: "", name: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async (signal: AbortSignal) => {
    await Promise.resolve();
    const token = getHospitalAdminAccessToken();
    if (!token) return;
    setState("loading"); setError("");
    try {
      const [departmentRows, staffRows] = await Promise.all([fetchDepartments(token, signal), fetchStaff(token, signal)]);
      setDepartments(departmentRows); setStaff(staffRows); setState(staffRows.length ? "ready" : "empty");
    } catch (caught) {
      if (signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
      setError(apiMessage(caught)); setState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timeoutId); controller.abort(); };
  }, [load, reloadKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const token = getHospitalAdminAccessToken(); if (!token) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      await createStaff(token, form);
      setForm((current) => ({ ...current, login_id: "", name: "", password: "" }));
      setSuccess("직원 계정을 생성했습니다."); setReloadKey((current) => current + 1);
    } catch (caught) { setError(apiMessage(caught)); } finally { setSaving(false); }
  }

  const roles = departments.flatMap((department) => department.roles.map((role) => ({ ...role, department })));
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]"><section className="min-w-0 border-y border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold">직원 목록</h2><p className="mt-1 text-xs text-slate-500">현재 병원에 소속된 직원만 표시됩니다.</p></div>{state === "loading" ? <StateMessage variant="loading" title="직원 정보를 조회하고 있습니다." className="m-5" /> : state === "error" ? <StateMessage variant="error" title={error} className="m-5" /> : state === "empty" ? <StateMessage variant="empty" title="등록된 직원이 없습니다." className="m-5" /> : <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">이름</th><th className="px-4 py-3">로그인 ID</th><th className="px-4 py-3">부서</th><th className="px-4 py-3">역할</th><th className="px-4 py-3">상태</th></tr></thead><tbody>{staff.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold">{item.name}</td><td className="px-4 py-3 text-slate-600">{item.login_id}</td><td className="px-4 py-3">{item.department.name}</td><td className="px-4 py-3">{item.role_display_name}</td><td className="px-4 py-3 text-slate-600">{item.account_status}</td></tr>)}</tbody></table></div>}</section><form onSubmit={submit} className="h-fit border-y border-slate-200 bg-white p-5"><h2 className="font-bold">직원 생성</h2><div className="mt-5 space-y-4"><label className="block text-sm font-semibold text-slate-700">부서 · 역할<select required value={form.department_role_id} onChange={(event) => setForm((current) => ({ ...current, department_role_id: event.target.value }))} className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3"><option value="">선택</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.department.name} · {role.display_name}</option>)}</select></label><Input required label="로그인 ID" value={form.login_id} onChange={(event) => setForm((current) => ({ ...current, login_id: event.target.value }))} /><Input required label="이름" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /><Input required label="비밀번호" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" /></div><div className="mt-4"><Alert message={error} />{success ? <p role="status" className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}</div><button type="submit" disabled={saving || roles.length === 0} className="mt-5 w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400">{saving ? "생성 중..." : "직원 생성"}</button></form></div>;
}
