import { StaffManagement } from "../../_components/staff-management";

export default function HospitalAdminStaffPage() {
  return <div><p className="text-sm font-semibold text-blue-700">Staff Management</p><h1 className="mt-1 text-2xl font-bold">직원 관리</h1><p className="mb-6 mt-2 text-sm text-slate-500">현재 병원의 부서와 역할을 사용해 직원 계정을 관리합니다.</p><StaffManagement /></div>;
}
