"use client";

import { useState } from "react";
import { SystemAdminLoginForm } from "../system-admin/_components/system-admin-login-form";
import { HospitalAdminLoginForm } from "../hospital-admin/_components/hospital-admin-login-form";

export function AdminLoginPanel() {
  const [type, setType] = useState<"system" | "hospital">("system");

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="관리자 유형">
        <button type="button" role="tab" aria-selected={type === "system"} onClick={() => setType("system")} className={`px-3 py-2 text-sm font-semibold ${type === "system" ? "bg-white text-blue-800 shadow-sm" : "text-slate-500"}`}>시스템 관리자</button>
        <button type="button" role="tab" aria-selected={type === "hospital"} onClick={() => setType("hospital")} className={`px-3 py-2 text-sm font-semibold ${type === "hospital" ? "bg-white text-blue-800 shadow-sm" : "text-slate-500"}`}>병원 관리자</button>
      </div>
      {type === "system" ? <SystemAdminLoginForm /> : <HospitalAdminLoginForm />}
    </div>
  );
}
