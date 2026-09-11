from apps.ai_results.models import AiAnalysis
from apps.cases.models import CaseImageAsset, ExaminationOrder

from ..models import PathologyWorkItem


class PathologyWorkflowStatus:
    CANCELLED = "CANCELLED"
    SCHEDULED = "SCHEDULED"
    SPECIMEN_COMPLETED = "SPECIMEN_COMPLETED"
    IMAGE_PENDING = "IMAGE_PENDING"
    AI_READY = "AI_READY"
    AI_RUNNING = "AI_RUNNING"
    AI_COMPLETED = "AI_COMPLETED"
    REVIEW_PENDING = "REVIEW_PENDING"
    REVIEW_COMPLETED = "REVIEW_COMPLETED"


WORKFLOW_LABELS = {
    PathologyWorkflowStatus.CANCELLED: "취소됨",
    PathologyWorkflowStatus.SCHEDULED: "예약됨",
    PathologyWorkflowStatus.SPECIMEN_COMPLETED: "검체 처리 완료",
    PathologyWorkflowStatus.IMAGE_PENDING: "영상 연결 대기",
    PathologyWorkflowStatus.AI_READY: "AI 실행 대기",
    PathologyWorkflowStatus.AI_RUNNING: "AI 분석 중",
    PathologyWorkflowStatus.AI_COMPLETED: "AI 분석 완료",
    PathologyWorkflowStatus.REVIEW_PENDING: "의사 판독 대기",
    PathologyWorkflowStatus.REVIEW_COMPLETED: "의사 판독 완료",
}


def calculate_workflow_status(work_item):
    """Return a read-only workflow projection without changing model state."""
    specimen = work_item.specimen
    order = specimen.examination_order if specimen else None
    if work_item.status == PathologyWorkItem.Status.CANCELLED or (
        order and order.status == ExaminationOrder.Status.CANCELLED
    ):
        return PathologyWorkflowStatus.CANCELLED

    confirmed_results = getattr(work_item.case, "workstation_confirmed_results", [])
    review_items = getattr(work_item.case, "workstation_review_items", [])
    if confirmed_results or any(
        item.status == PathologyWorkItem.Status.COMPLETED for item in review_items
    ):
        return PathologyWorkflowStatus.REVIEW_COMPLETED
    if any(
        item.status in {PathologyWorkItem.Status.PENDING, PathologyWorkItem.Status.IN_PROGRESS}
        for item in review_items
    ):
        return PathologyWorkflowStatus.REVIEW_PENDING

    analyses = getattr(work_item.case, "workstation_analyses", [])
    latest_analysis = analyses[0] if analyses else None
    if (
        latest_analysis
        and latest_analysis.status == AiAnalysis.Status.SUCCEEDED
        and hasattr(latest_analysis, "ai_result")
    ):
        return PathologyWorkflowStatus.AI_COMPLETED
    if latest_analysis and latest_analysis.status in {
        AiAnalysis.Status.PENDING,
        AiAnalysis.Status.RUNNING,
    }:
        return PathologyWorkflowStatus.AI_RUNNING

    wsis = getattr(specimen, "workstation_wsis", []) if specimen else []
    if any(
        wsi.is_current and wsi.image_asset.status == CaseImageAsset.Status.READY
        for wsi in wsis
    ):
        return PathologyWorkflowStatus.AI_READY

    if specimen:
        if order and order.status == ExaminationOrder.Status.SCHEDULED and not specimen.received_at:
            return PathologyWorkflowStatus.SCHEDULED
        if specimen.status in {specimen.Status.RECEIVED, specimen.Status.PROCESSING}:
            return PathologyWorkflowStatus.SPECIMEN_COMPLETED
        return PathologyWorkflowStatus.IMAGE_PENDING
    return PathologyWorkflowStatus.SCHEDULED


def workflow_label(status):
    return WORKFLOW_LABELS[status]
