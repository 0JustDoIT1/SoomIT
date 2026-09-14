import type { ReactNode } from "react";

import { PathologyShell } from "./_components/pathology-shell";

export default function PathologyLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <PathologyShell>{children}</PathologyShell>;
}
