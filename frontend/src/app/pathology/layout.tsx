import type { ReactNode } from "react";

import { PathologyAuthProvider } from "./_components/pathology-auth-provider";
import { PathologyShell } from "./_components/pathology-shell";

export default function PathologyLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PathologyAuthProvider>
      <PathologyShell>{children}</PathologyShell>
    </PathologyAuthProvider>
  );
}
