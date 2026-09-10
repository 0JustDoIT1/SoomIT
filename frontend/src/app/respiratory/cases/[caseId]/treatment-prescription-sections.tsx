import type { ReactNode } from "react";

type SectionProps = { children: ReactNode; className?: string };

export function TreatmentSection({ children, className }: SectionProps) {
  return <div className={className} data-section="treatment">{children}</div>;
}

export function PrescriptionSection({ children, className }: SectionProps) {
  return <div className={className} data-section="prescription">{children}</div>;
}
