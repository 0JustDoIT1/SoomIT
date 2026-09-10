export type StringFields = Record<string, string>;

export function hasChangedFields(current: StringFields, baseline: StringFields) {
  return Object.keys(current).some((key) => current[key] !== (baseline[key] ?? ""));
}

export function hasPrescriptionDraftChanges({ cycleNumber, phase, cycleStartDate, itemDirty }: { cycleNumber: string; phase: string; cycleStartDate: string; itemDirty: Record<string, boolean> }) {
  return cycleNumber !== "1" || phase !== "INDUCTION" || cycleStartDate !== "" || Object.values(itemDirty).some(Boolean);
}

export function hasUnsavedCaseChanges(flags: { tnm: boolean; treatment: boolean; prescription: boolean; unacknowledgedWarnings: boolean }) {
  return flags.tnm || flags.treatment || flags.prescription || flags.unacknowledgedWarnings;
}
