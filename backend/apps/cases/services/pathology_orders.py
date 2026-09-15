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


def has_confirmed_pathology_gene_result(case):
    return ClinicalResult.objects.filter(
        case=case,
        examination_order__case=case,
        examination_order__order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
        workflow_stage="PATHOLOGY_GENE",
        result_status=ClinicalResult.ResultStatus.CONFIRMED,
    ).exists()


def has_active_pathology_order(case, order_type):
    return ExaminationOrder.objects.filter(
        case=case,
        order_type=order_type,
        status__in=ACTIVE_ORDER_STATUSES,
    ).exists()


@transaction.atomic
def create_follow_up_pathology_order(
    *, case, requesting_doctor, pathology_test_type, priority, purpose, clinical_note
):
    locked_case = LungCancerCase.objects.select_for_update().get(pk=case.pk)

    order_type = (
        ExaminationOrder.OrderType.PDL1
        if pathology_test_type == "PDL1"
        else ExaminationOrder.OrderType.PATHOLOGY_GENE
    )

    if order_type == ExaminationOrder.OrderType.PDL1 and not has_confirmed_pathology_gene_result(locked_case):
        raise PathologyOrderCreationError(
            "조직·유전자 판독이 완료된 후 PD-L1 검사를 처방할 수 있습니다."
        )

    if has_active_pathology_order(locked_case, order_type):
        raise PathologyOrderCreationError(
            "동일한 종류의 미완료 병리 검사 오더가 이미 존재합니다."
        )

    examination_order = ExaminationOrder.objects.create(
        case=locked_case,
        order_type=order_type,
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
