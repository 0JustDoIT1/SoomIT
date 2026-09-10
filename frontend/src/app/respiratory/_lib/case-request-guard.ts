export function canApplyCaseResponse(requestCaseId: string, activeCaseId: string, aborted: boolean) {
  return !aborted && requestCaseId === activeCaseId;
}
