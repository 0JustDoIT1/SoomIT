export type CaseListFilter = "ALL" | "ACTIVE" | "IMAGING" | "NOTIFIED";

export function getCaseListEmptyState(search: string, filter: CaseListFilter = "ALL") {
  if (search.trim()) {
    return {
      title: "검색 조건에 맞는 Case가 없습니다.",
      description: "현재 조회된 담당 Case 안에서 환자명, 환자번호, Case 번호를 검색합니다.",
    };
  }

  if (filter === "ACTIVE") {
    return {
      title: "진행 중인 담당 Case가 없습니다.",
      description: "현재 API 응답에서 진행 상태(ACTIVE)인 담당 Case가 없습니다. 전체 Case로 전환해 다른 상태를 확인할 수 있습니다.",
    };
  }

  if (filter === "IMAGING") {
    return {
      title: "진행 중인 X-ray 또는 흉부 CT Case가 없습니다.",
      description: "현재 API 응답에서 진행 상태(ACTIVE)이면서 X-ray·CT 검사 단계인 담당 Case가 없습니다. 전체 Case로 전환해 다른 진료 단계를 확인할 수 있습니다.",
    };
  }

  if (filter === "NOTIFIED") {
    return {
      title: "새 알림이 연결된 담당 Case가 없습니다.",
      description: "현재 미읽음 알림 중 담당 Case와 연결된 항목이 없습니다. 전체 Case로 전환해 업무를 확인할 수 있습니다.",
    };
  }

  return {
    title: "현재 배정된 진행 중 Case가 없습니다.",
    description: "이 목록에는 현재 로그인한 담당의에게 배정된 진행 중 Case만 표시됩니다.",
  };
}
