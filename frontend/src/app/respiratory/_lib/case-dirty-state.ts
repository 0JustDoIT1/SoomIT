export type StringFields = Record<string, string>;

export function reconcileSavedFields<T extends StringFields>(current: T, submitted: T, saved: T): T {
  return Object.fromEntries(Object.entries(saved).map(([key, value]) =>
    [key, current[key] === submitted[key] ? value : current[key]],
  )) as T;
}

export function hasChangedFields(current: StringFields, baseline: StringFields) {
  return Object.keys(current).some((key) => current[key] !== (baseline[key] ?? ""));
}

export function hasPrescriptionDraftChanges({ cycleNumber, phase, cycleStartDate, itemDirty }: { cycleNumber: string; phase: string; cycleStartDate: string; itemDirty: Record<string, boolean> }) {
  return cycleNumber !== "1" || phase !== "INDUCTION" || cycleStartDate !== "" || Object.values(itemDirty).some(Boolean);
}

export function hasUnsavedCaseChanges(flags: { tnm: boolean; treatment: boolean; prescription: boolean }) {
  return flags.tnm || flags.treatment || flags.prescription;
}
