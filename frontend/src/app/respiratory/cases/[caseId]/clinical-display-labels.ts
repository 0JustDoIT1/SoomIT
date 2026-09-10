const CASE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "진행 중",
  REFERRED_OUT: "전원",
  CLOSED: "종결",
};

const DECISION_TYPE_LABELS: Record<string, string> = {
  PROCEED_NEXT_STAGE: "다음 단계 진행",
  REPEAT_EXAMINATION: "재검사",
  REFERRED_OUT: "전원",
  CLOSE_CASE: "종결",
};

const PRESCRIPTION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "작성 중",
  VALIDATED: "검증 완료",
  FINAL: "최종 확정",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

function displayLabel(value: string | null | undefined, labels: Record<string, string>) {
  if (!value) return "-";
  return labels[value] ?? value;
}

export function getCaseStatusLabel(value?: string | null) {
  return displayLabel(value, CASE_STATUS_LABELS);
}

export function getDecisionTypeLabel(value?: string | null) {
  return displayLabel(value, DECISION_TYPE_LABELS);
}

export function getPrescriptionStatusLabel(value?: string | null) {
  return displayLabel(value, PRESCRIPTION_STATUS_LABELS);
}
