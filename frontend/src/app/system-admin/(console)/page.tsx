"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateMessage } from "@/components/workspace/state-message";
import { fetchHospitalAdmins, fetchHospitals, SystemAdminApiError, type Hospital } from "../_lib/system-admin-api";
import { getSystemAdminAccessToken } from "../_lib/system-admin-session";

export default function SystemAdminDashboardPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [adminCount, setAdminCount] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      await Promise.resolve();
      const token = getSystemAdminAccessToken(); if (!token) return;
      try {
        const [hospitalRows, admins] = await Promise.all([fetchHospitals(token, controller.signal), fetchHospitalAdmins(token, undefined, controller.signal)]);
        setHospitals(hospitalRows); setAdminCount(admins.length); setState("ready");
      } catch (caught) {
        if (controller.signal.aborted || (caught instanceof Error && caught.name === "AbortError")) return;
        const status = caught instanceof SystemAdminApiError ? caught.status : null;
        setError(status === 401 ? "인증이 만료되었습니다. 다시 로그인해주세요." : status === 403 ? "시스템 관리자 권한이 없습니다." : caught instanceof Error ? caught.message : "관리 정보를 불러오지 못했습니다.");
        setState("error");
      }
    }
    void load(); return () => controller.abort();
  }, []);

  return <div className="mx-auto max-w-7xl"><h1 className="text-2xl font-bold">대시보드</h1><p className="mt-1 text-sm text-slate-500">병원과 병원 관리자 현황을 확인합니다.</p>
    {state === "loading" ? <StateMessage variant="loading" title="관리 정보를 불러오는 중입니다." className="mt-6" /> : null}
    {state === "error" ? <StateMessage variant="error" title="관리 정보를 조회할 수 없습니다." description={error} className="mt-6" /> : null}
    {state === "ready" ? <><dl className="mt-7 grid grid-cols-2 border-y border-slate-200 bg-white"><div className="p-5"><dt className="text-sm text-slate-500">등록 병원</dt><dd className="mt-2 text-3xl font-bold">{hospitals.length}</dd></div><div className="border-l border-slate-200 p-5"><dt className="text-sm text-slate-500">HospitalAdmin</dt><dd className="mt-2 text-3xl font-bold">{adminCount}</dd></div></dl>
      <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">병원 바로가기</h2><Link href="/system-admin/hospitals" className="text-sm font-semibold text-blue-700">전체 보기</Link></div><div className="mt-3 divide-y divide-slate-200 border-y border-slate-200 bg-white">{hospitals.slice(0, 5).map((hospital) => <Link key={hospital.id} href="/system-admin/hospitals" className="flex justify-between px-4 py-3 hover:bg-blue-50"><span className="font-medium">{hospital.name}</span><span className="text-sm text-slate-500">{hospital.code}</span></Link>)}{hospitals.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">등록된 병원이 없습니다.</p> : null}</div></section></> : null}
  </div>;
}
