import { Suspense } from "react";
import { HospitalAdminManagement } from "../../_components/hospital-admin-management";

export default function HospitalAdminsPage() { return <div className="mx-auto max-w-7xl"><h1 className="text-2xl font-bold">병원 관리자 관리</h1><p className="mb-6 mt-1 text-sm text-slate-500">병원별 HospitalAdmin 계정을 조회하고 생성합니다.</p><Suspense fallback={<p className="text-sm text-slate-500">화면을 준비하는 중입니다.</p>}><HospitalAdminManagement /></Suspense></div>; }
