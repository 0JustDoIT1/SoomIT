const RESULT_STATUS: Record<string, string> = {
  CONFIRMED: "완료", SUCCEEDED: "완료", COMPLETED: "완료",
  DRAFT: "입력 중", READY: "확정 가능", candidate_ready: "확정 가능",
  RUNNING: "처리 중", PROCESSING: "처리 중",
  FAILED: "실패", ERROR: "실패",
  PENDING: "결과 대기", QUEUED: "결과 대기", REQUESTED: "결과 대기",
};

export function resultStatusLabel(status?: string | null) {
  if (!status) return "결과 대기";
  return RESULT_STATUS[status] ?? (/[가-힣]/.test(status) ? status : "검토 필요");
}
