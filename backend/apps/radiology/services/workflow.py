from apps.ai_results.models import AiAnalysis
from apps.cases.models import CaseImageAsset, ExaminationOrder


WORKFLOW_STATUS_LABELS = {
    "CANCELLED": "취소됨",
    "REVIEW_COMPLETED": "판독 완료",
    "REVIEW_PENDING": "의사 판독 대기",
    "AI_FAILED": "AI 실패",
    "AI_RUNNING": "AI 분석 중",
    "AI_READY": "AI 실행 대기",
    "IMAGE_PENDING": "영상 연결 대기",
    "EXAM_PENDING": "검사 대기",
}


def calculate_workflow_status(order, image_assets, latest_ai_analysis):
    """기존 상태를 조합해 UI용 상태만 반환하며 어떤 모델도 변경하지 않는다."""
    if order.status == ExaminationOrder.Status.CANCELLED:
        return "CANCELLED"

    if latest_ai_analysis is not None:
        if latest_ai_analysis.status == AiAnalysis.Status.SUCCEEDED:
            ai_result = getattr(latest_ai_analysis, "ai_result", None)
            if ai_result is None:
                # 저장된 SUCCEEDED 값은 유지하고, 비정상 조합을 표시상 실패로만 계산한다.
                return "AI_FAILED"
            if getattr(latest_ai_analysis, "has_confirmed_review", False):
                return "REVIEW_COMPLETED"
            return "REVIEW_PENDING"

        if latest_ai_analysis.status == AiAnalysis.Status.FAILED:
            return "AI_FAILED"

        if latest_ai_analysis.status in {
            AiAnalysis.Status.PENDING,
            AiAnalysis.Status.RUNNING,
        }:
            return "AI_RUNNING"

    if any(asset.status == CaseImageAsset.Status.READY for asset in image_assets):
        return "AI_READY"

    if order.status == ExaminationOrder.Status.COMPLETED:
        return "IMAGE_PENDING"

    return "EXAM_PENDING"


def get_workflow_status_label(status):
    return WORKFLOW_STATUS_LABELS[status]
