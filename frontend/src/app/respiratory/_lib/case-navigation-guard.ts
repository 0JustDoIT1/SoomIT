export const CASE_NAVIGATION_REQUEST_EVENT = "respiratory:request-case-navigation";

export type CaseNavigationRequestDetail = {
  caseId: string;
};

export function requestCaseNavigation(caseId: string): boolean {
  return window.dispatchEvent(
    new CustomEvent<CaseNavigationRequestDetail>(CASE_NAVIGATION_REQUEST_EVENT, {
      cancelable: true,
      detail: { caseId },
    }),
  );
}

export function getRequestedCaseId(event: Event): string | null {
  const detail = (event as CustomEvent<CaseNavigationRequestDetail>).detail;
  return typeof detail?.caseId === "string" && detail.caseId ? detail.caseId : null;
}
