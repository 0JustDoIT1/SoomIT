export function formatPrescriptionDose(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim();
  const match = text.match(/^([+-]?\d+)(?:\.(\d+))?$/);
  if (!match) return text;
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  return fraction ? `${match[1]}.${fraction}` : match[1];
}
