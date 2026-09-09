import type { ReactNode } from "react";

import { RadiologyShell } from "./_components/radiology-shell";

export default function RadiologyLayout({ children }: { children: ReactNode }) {
  return <RadiologyShell>{children}</RadiologyShell>;
}
