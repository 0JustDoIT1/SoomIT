"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExpandableRail, type RailItem } from "@/components/workspace/expandable-rail";
import { clearHospitalAdminSession, getHospitalAdminAccessToken, getHospitalAdminUser } from "../_lib/hospital-admin-session";

const icon = "h-5 w-5";
const navigation: RailItem[] = [
  { label: "대시보드", href: "/hospital-admin", icon: <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={icon}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg> },
  { label: "직원 관리", href: "/hospital-admin/staff", matchPrefix: true, icon: <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" className={icon}><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21a7 7 0 0 1 14 0" /></svg> },
];

export function HospitalAdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState("병원 관리자");
  const [hospitalName, setHospitalName] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      await Promise.resolve();
      if (!getHospitalAdminAccessToken()) { router.replace("/admin"); return; }
      const user = getHospitalAdminUser();
      setUserName(user?.name || "병원 관리자"); setHospitalName(user?.hospital.name || ""); setReady(true);
    }
    void prepare();
  }, [router]);

  function logout() { clearHospitalAdminSession(); router.replace("/admin"); }
  if (!ready) return <div className="min-h-screen bg-slate-50" />;
  return <div className="flex min-h-screen bg-slate-50 text-slate-900"><ExpandableRail items={navigation} brand="SoomIT Hospital" userName={userName} userRole="병원 관리자" onLogout={logout} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} /><div className="flex min-w-0 flex-1 flex-col"><header className="flex h-16 items-center border-b border-slate-200 bg-white px-4 sm:px-6"><button type="button" onClick={() => setMobileOpen(true)} aria-label="메뉴 열기" className="mr-3 rounded-md border border-slate-200 p-2 lg:hidden">☰</button><div><p className="text-sm font-semibold">병원 관리 콘솔</p><p className="text-xs text-slate-500">{hospitalName}</p></div><p className="ml-auto text-sm font-medium text-slate-700">{userName}</p></header><main className="min-w-0 flex-1 p-4 sm:p-6 xl:p-8">{children}</main></div></div>;
}
