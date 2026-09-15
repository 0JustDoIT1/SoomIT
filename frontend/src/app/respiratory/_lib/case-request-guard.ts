export function canApplyCaseResponse(requestCaseId: string, activeCaseId: string, aborted: boolean) {
  return !aborted && requestCaseId === activeCaseId;
}

export function applyCaseResponse(requestCaseId: string, activeCaseId: string, aborted: boolean, apply: () => void) {
  if (!canApplyCaseResponse(requestCaseId, activeCaseId, aborted)) return false;
  apply();
  return true;
}
