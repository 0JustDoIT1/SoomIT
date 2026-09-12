export function getClinicalResultHttpError(status: number) {
  if (status === 401) return "전문과 결과 인증이 만료되었습니다. 다시 로그인해 주세요.";
  if (status === 403) return "전문과 결과 조회 권한이 없습니다.";
  return "전문과 결과를 불러오지 못했습니다.";
}

export function getClinicalResultNetworkError() {
  return "전문과 결과 서버에 연결할 수 없습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
}
