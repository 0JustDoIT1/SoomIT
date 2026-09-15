export function getCaseListEmptyState(search: string) {
  if (search.trim()) {
    return {
      title: "검색 조건에 맞는 Case가 없습니다.",
      description: "현재 조회된 담당 Case 안에서 환자명, 환자번호, Case 번호를 검색합니다.",
    };
  }

  return {
    title: "현재 배정된 진행 중 Case가 없습니다.",
    description: "이 목록에는 현재 로그인한 담당의에게 배정된 진행 중 Case만 표시됩니다.",
  };
}
