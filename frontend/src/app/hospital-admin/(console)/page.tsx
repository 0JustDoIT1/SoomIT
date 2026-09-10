import Link from "next/link";

export default function HospitalAdminDashboardPage() {
  return <div className="max-w-5xl"><p className="text-sm font-semibold text-blue-700">Hospital Administration</p><h1 className="mt-1 text-2xl font-bold">대시보드</h1><p className="mt-2 text-sm text-slate-500">현재 병원의 부서 역할을 기준으로 직원 계정을 관리합니다.</p><div className="mt-8 border-y border-slate-200 bg-white p-6"><h2 className="font-bold">직원 관리</h2><p className="mt-2 text-sm text-slate-600">직원 목록을 확인하고 부서·역할에 맞는 계정을 생성할 수 있습니다.</p><Link href="/hospital-admin/staff" className="mt-5 inline-flex rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white">직원 관리로 이동</Link></div></div>;
}
