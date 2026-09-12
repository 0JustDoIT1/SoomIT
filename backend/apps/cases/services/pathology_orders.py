from django.db import transaction

from apps.clinical.models import ClinicalResult
from apps.pathology.models import PathologyWorkItem

from ..models import ExaminationOrder, LungCancerCase


class PathologyOrderCreationError(Exception):
    pass


ACTIVE_ORDER_STATUSES = {
    value
    for value, _label in ExaminationOrder.Status.choices
    if value not in {
        ExaminationOrder.Status.COMPLETED,
        ExaminationOrder.Status.CANCELLED,
    }
}


def has_confirmed_subtype_result(case):
    return ClinicalResult.objects.filter(
        case=case,
        examination_order__case=case,
        examination_order__exam_type=ExaminationOrder.ExamType.WSI,
        examination_order__pathology_test_type=ExaminationOrder.PathologyTestType.SUBTYPE,
        stage="PATHOLOGY",
        result_status=ClinicalResult.ResultStatus.CONFIRMED,
    ).exists()


def has_active_pathology_order(case, pathology_test_type):
    return ExaminationOrder.objects.filter(
        case=case,
        exam_type=ExaminationOrder.ExamType.WSI,
        pathology_test_type=pathology_test_type,
        status__in=ACTIVE_ORDER_STATUSES,
    ).exists()


@transaction.atomic
def create_follow_up_pathology_order(
    *, case, requesting_doctor, pathology_test_type, priority, purpose, clinical_note
):
    locked_case = LungCancerCase.objects.select_for_update().get(pk=case.pk)

    if not has_confirmed_subtype_result(locked_case):
        raise PathologyOrderCreationError(
            "SUBTYPE 판독이 완료된 후 추가 병리 검사를 처방할 수 있습니다."
        )

    if has_active_pathology_order(locked_case, pathology_test_type):
        raise PathologyOrderCreationError(
            "동일한 종류의 미완료 병리 검사 오더가 이미 존재합니다."
        )

    examination_order = ExaminationOrder.objects.create(
        case=locked_case,
        exam_type=ExaminationOrder.ExamType.WSI,
        pathology_test_type=pathology_test_type,
        requesting_doctor=requesting_doctor,
        priority=priority,
        purpose=purpose,
        clinical_note=clinical_note,
    )
    work_item = PathologyWorkItem.objects.create(
        case=locked_case,
        examination_order=examination_order,
        task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
        status=PathologyWorkItem.Status.PENDING,
        priority=(
            PathologyWorkItem.Priority.CRITICAL
            if priority == ExaminationOrder.Priority.URGENT
            else PathologyWorkItem.Priority.NORMAL
        ),
        specimen=None,
        wsi=None,
        assigned_to=None,
    )
    return examination_order, work_item
