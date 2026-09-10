"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";
import Alert from "@/components/common/Alert";
import Input from "@/components/common/Input";
import { createHospital, type HospitalCreateResponse } from "../_lib/system-admin-api";
import { getSystemAdminAccessToken } from "../_lib/system-admin-session";
import { SystemAdminActionButton } from "./system-admin-action-button";

export function HospitalCreateForm() {
  const [form, setForm] = useState({ name: "", code: "", address: "", latitude: "", longitude: "", phone: "" });
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [result, setResult] = useState<HospitalCreateResponse | null>(null);
  const field = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  async function submit(event: FormEvent) { event.preventDefault(); const token = getSystemAdminAccessToken(); if (!token) return; setSaving(true); setError(""); try { setResult(await createHospital(token, { name: form.name.trim(), code: form.code.trim(), address: form.address.trim() || null, latitude: form.latitude || null, longitude: form.longitude || null, phone: form.phone.trim() || null })); } catch (caught) { setError(caught instanceof Error ? caught.message : "병원을 생성하지 못했습니다."); } finally { setSaving(false); } }
  if (result) return <div className="border-y border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">{result.hospital.name}</h2><p className="mt-1 text-sm text-slate-500">{result.hospital.code}</p><h3 className="mt-6 font-bold">생성된 기본 부서 및 역할</h3><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{result.departments.map((department) => <div key={department.id} className="flex flex-wrap justify-between gap-2 py-3"><span className="font-semibold">{department.name} <small className="text-slate-500">{department.code}</small></span><span className="text-sm text-slate-600">{department.roles.map((role) => role.display_name).join(", ")}</span></div>)}</div><Link href={`/system-admin/hospital-admins?hospital_id=${result.hospital.id}`} className="mt-6 inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white">HospitalAdmin 생성</Link></div>;
  return <form onSubmit={submit} className="max-w-3xl border-y border-slate-200 bg-white p-6"><div className="grid gap-5 sm:grid-cols-2"><Input label="병원명" required value={form.name} onChange={field("name")} /><Input label="병원 코드" required value={form.code} onChange={field("code")} /><div className="sm:col-span-2"><Input label="주소" value={form.address} onChange={field("address")} /></div><Input label="위도" type="number" step="0.000001" value={form.latitude} onChange={field("latitude")} /><Input label="경도" type="number" step="0.000001" value={form.longitude} onChange={field("longitude")} /><Input label="전화번호" value={form.phone} onChange={field("phone")} /></div><p className="mt-3 text-xs text-slate-500">병원 코드는 영문, 숫자, 하이픈을 사용할 수 있으며 Backend에서 대문자로 정규화됩니다.</p><div className="mt-5"><Alert message={error} /></div><div className="mt-5 flex justify-end"><SystemAdminActionButton type="submit" disabled={saving}>{saving ? "생성 중..." : "병원 생성"}</SystemAdminActionButton></div></form>;
}
