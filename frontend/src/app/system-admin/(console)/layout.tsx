import type { ReactNode } from "react";
import { SystemAdminShell } from "../_components/system-admin-shell";

export default function SystemAdminConsoleLayout({ children }: { children: ReactNode }) {
  return <SystemAdminShell>{children}</SystemAdminShell>;
}
