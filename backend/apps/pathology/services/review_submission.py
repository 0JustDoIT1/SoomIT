from django.db import transaction

from apps.cases.models import LungCancerCase

from ..models import PathologyWorkItem


ACTIVE_REVIEW_STATUSES = {
    PathologyWorkItem.Status.PENDING,
    PathologyWorkItem.Status.IN_PROGRESS,
}


class ReviewSubmissionError(Exception):
    pass


@transaction.atomic
def submit_for_review(source_work_item):
    """Create one active diagnostic review task for a case, idempotently."""
    LungCancerCase.objects.select_for_update().get(pk=source_work_item.case_id)

    order_ids = {source_work_item.examination_order_id}
    if source_work_item.specimen_id:
        order_ids.add(source_work_item.specimen.examination_order_id)
    if source_work_item.wsi_id:
        order_ids.add(source_work_item.wsi.specimen.examination_order_id)
    order_ids.discard(None)
    if len(order_ids) != 1:
        raise ReviewSubmissionError("현재 병리 오더를 확인할 수 없어 제출할 수 없습니다.")
    examination_order_id = order_ids.pop()

    existing = (
        PathologyWorkItem.objects.filter(
            case_id=source_work_item.case_id,
            examination_order_id=examination_order_id,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            status__in=ACTIVE_REVIEW_STATUSES,
        )
        .order_by("-created_at")
        .first()
    )
    if existing:
        return existing, False

    review_work_item = PathologyWorkItem.objects.create(
        case_id=source_work_item.case_id,
        examination_order_id=examination_order_id,
        specimen_id=source_work_item.specimen_id,
        wsi_id=source_work_item.wsi_id,
        task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
        status=PathologyWorkItem.Status.PENDING,
        priority=source_work_item.priority,
        assigned_to=None,
    )
    return review_work_item, True
