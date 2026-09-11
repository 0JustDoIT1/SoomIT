export function getCaseListHttpError(status: number): string {
  if (status === 401) return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  if (status === 403) return "호흡기내과 Case 조회 권한이 없습니다.";
  return "담당 Case 목록을 불러오지 못했습니다.";
}

export function getCaseListFetchError(error: unknown): string {
  if (error instanceof TypeError) {
    return "백엔드 API에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Case 목록 조회 중 오류가 발생했습니다.";
}
