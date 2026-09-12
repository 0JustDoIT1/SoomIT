"use client";

import Link from "next/link";
import Script from "next/script";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Alert from "@/components/common/Alert";
import Input from "@/components/common/Input";
import { createHospital, type HospitalCreateResponse } from "../_lib/system-admin-api";
import { getSystemAdminAccessToken } from "../_lib/system-admin-session";
import { SystemAdminActionButton } from "./system-admin-action-button";

const initialForm = { name: "", code: "", address: "", address_detail: "", postal_code: "", phone: "" };
type DaumPostcodeData = { roadAddress: string; zonecode: string };

declare global {
  interface Window {
    daum?: { Postcode: new (options: { oncomplete: (data: DaumPostcodeData) => void }) => { open: () => void } };
  }
}

export function HospitalCreateForm() {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [postcodeReady, setPostcodeReady] = useState(false);
  const [postcodeError, setPostcodeError] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<HospitalCreateResponse | null>(null);
  const addressDetailRef = useRef<HTMLInputElement>(null);
  const field = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  function openPostcodeSearch() {
    if (!window.daum?.Postcode) {
      setPostcodeError("주소 검색 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setPostcodeError("");
    new window.daum.Postcode({
      oncomplete: (data) => {
        if (!data.roadAddress) {
          setPostcodeError("도로명 주소를 선택해주세요.");
          return;
        }
        setForm((current) => ({ ...current, address: data.roadAddress, address_detail: "", postal_code: data.zonecode }));
        window.setTimeout(() => addressDetailRef.current?.focus(), 0);
      },
    }).open();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const token = getSystemAdminAccessToken();
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      setResult(await createHospital(token, {
        name: form.name.trim(), code: form.code.trim(), address: form.address.trim(),
        address_detail: form.address_detail.trim() || null,
        postal_code: form.postal_code.trim(), phone: form.phone.trim() || null,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "병원을 생성하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (result) return (
    <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">{result.hospital.name}</h2>
      <p className="mt-1 text-sm text-slate-500">{result.hospital.code}</p>
      <h3 className="mt-6 font-bold">생성된 기본 부서 및 역할</h3>
      <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
        {result.departments.map((department) => (
          <div key={department.id} className="flex flex-wrap justify-between gap-2 py-3">
            <span className="font-semibold">{department.name} <small className="text-slate-500">{department.code}</small></span>
            <span className="text-sm text-slate-600">{department.roles.map((role) => role.display_name).join(", ")}</span>
          </div>
        ))}
      </div>
      <Link href={`/system-admin/hospital-admins?hospital_id=${result.hospital.id}`} className="mt-6 inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white">HospitalAdmin 생성</Link>
    </div>
  );

  return (
    <form onSubmit={submit} className="max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <Script id="daum-postcode-script" src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" strategy="afterInteractive"
        onLoad={() => { setPostcodeReady(Boolean(window.daum?.Postcode)); setPostcodeError(""); }}
        onError={() => { setPostcodeReady(false); setPostcodeError("주소 검색 서비스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."); }} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="병원명" required value={form.name} onChange={field("name")} />
        <Input label="병원 코드" required value={form.code} onChange={field("code")} />
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="hospital-address">주소</label>
          <div className="flex gap-2">
            <input id="hospital-address" required readOnly value={form.address} placeholder="도로명 주소" className="h-[46px] min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 outline-none" />
            <button type="button" disabled={!postcodeReady} onClick={openPostcodeSearch} className="h-[46px] shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-4 text-sm font-semibold text-sky-700 disabled:cursor-not-allowed disabled:opacity-70">주소 검색</button>
          </div>
          {postcodeError ? <p className="mt-1.5 text-xs text-red-600">{postcodeError}</p> : null}
        </div>
        <div className="sm:col-span-2">
          <Input ref={addressDetailRef} label="상세 주소" maxLength={255} placeholder="상세 주소를 입력하세요" value={form.address_detail} onChange={field("address_detail")} />
        </div>
        <Input label="우편번호" required maxLength={10} readOnly placeholder="우편번호" value={form.postal_code} onChange={field("postal_code")} />
        <Input label="전화번호" value={form.phone} onChange={field("phone")} />
      </div>
      <p className="mt-4 text-xs text-slate-500">병원 코드는 영문, 숫자, 하이픈을 사용할 수 있으며 Backend에서 대문자로 정규화됩니다.</p>
      <div className="mt-5"><Alert message={error} /></div>
      <div className="mt-5 flex justify-end"><SystemAdminActionButton type="submit" disabled={saving}>{saving ? "생성 중..." : "병원 생성"}</SystemAdminActionButton></div>
    </form>
  );
}
