import type { CaseListFilter } from "./case-list-empty-state";

export type WorklistFilter = CaseListFilter;

type FilterableCase = {
  case_status: string;
  current_stage: string;
};

export function filterWorklistCases<T extends FilterableCase & { id: string }>(items: T[], filter: WorklistFilter, unreadNotificationCaseIds: ReadonlySet<string> = new Set()) {
  if (filter === "ACTIVE") return items.filter((item) => item.case_status === "ACTIVE");
  if (filter === "IMAGING") return items.filter((item) => item.case_status === "ACTIVE" && (item.current_stage === "XRAY" || item.current_stage === "CT"));
  if (filter === "NOTIFIED") return items.filter((item) => unreadNotificationCaseIds.has(item.id));
  return items;
}
