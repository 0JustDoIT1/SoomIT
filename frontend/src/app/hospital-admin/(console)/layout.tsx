import type { ReactNode } from "react";
import { HospitalAdminShell } from "../_components/hospital-admin-shell";

export default function HospitalAdminConsoleLayout({ children }: { children: ReactNode }) {
  return <HospitalAdminShell>{children}</HospitalAdminShell>;
}
