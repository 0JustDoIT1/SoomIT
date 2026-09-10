import Link from "next/link";
import { HospitalManagement } from "../../_components/hospital-management";

export default function HospitalsPage() { return <div className="mx-auto max-w-7xl"><div className="mb-5 flex items-end justify-between"><div><h1 className="text-2xl font-bold">병원 관리</h1><p className="mt-1 text-sm text-slate-500">등록 병원과 부서·역할을 확인합니다.</p></div><Link href="/system-admin/hospitals/new" className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white">병원 추가</Link></div><HospitalManagement /></div>; }
