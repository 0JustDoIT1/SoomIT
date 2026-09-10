import { HospitalCreateForm } from "../../../_components/hospital-create-form";

export default function NewHospitalPage() { return <div className="mx-auto max-w-7xl"><h1 className="text-2xl font-bold">병원 추가</h1><p className="mb-6 mt-1 text-sm text-slate-500">병원 생성 시 기본 부서와 역할이 자동 생성됩니다.</p><HospitalCreateForm /></div>; }
