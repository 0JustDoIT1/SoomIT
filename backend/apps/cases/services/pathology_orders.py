from django.db import transaction

from apps.clinical.models import ClinicalResult
from apps.pathology.models import PathologyWorkItem

from ..models import ExaminationOrder, LungCancerCase, WorkflowStage


class PathologyOrderCreationError(Exception):
    pass


ACTIVE_ORDER_STATUSES = {
    ExaminationOrder.Status.ORDERED,
    ExaminationOrder.Status.SCHEDULED,
}


def has_confirmed_pathology_gene_result(case):
    return ClinicalResult.objects.filter(
        case=case,
        examination_order__case=case,
        examination_order__order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
        workflow_stage="PATHOLOGY_GENE",
        result_status=ClinicalResult.ResultStatus.CONFIRMED,
    ).exists()


def has_submitted_pathology_gene_review(case):
    """A diagnostic review work item is created by the pathologist submit action."""
    return PathologyWorkItem.objects.filter(
        case=case,
        examination_order__case=case,
        examination_order__order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
        task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
        status__in=[
            PathologyWorkItem.Status.PENDING,
            PathologyWorkItem.Status.IN_PROGRESS,
            PathologyWorkItem.Status.BLOCKED,
            PathologyWorkItem.Status.COMPLETED,
        ],
    ).exists()


def has_pathology_gene_review_completed(case):
    return has_confirmed_pathology_gene_result(case) or has_submitted_pathology_gene_review(case)


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

    if order_type == ExaminationOrder.OrderType.PDL1:
        if locked_case.current_stage == WorkflowStage.PATHOLOGY_GENE:
            if not has_pathology_gene_review_completed(locked_case):
                raise PathologyOrderCreationError(
                    "조직·유전자 검사 결과를 병리사가 의사에게 제출한 뒤 PD-L1 검사를 처방할 수 있습니다."
                )
        elif locked_case.current_stage == WorkflowStage.PDL1:
            if ClinicalResult.objects.filter(
                case=locked_case,
                workflow_stage=WorkflowStage.PDL1,
            ).exists():
                raise PathologyOrderCreationError(
                    "PD-L1 결과가 이미 생성되어 재오더할 수 없습니다."
                )
            if ExaminationOrder.objects.filter(
                case=locked_case,
                order_type=ExaminationOrder.OrderType.PDL1,
                status=ExaminationOrder.Status.COMPLETED,
            ).exists():
                raise PathologyOrderCreationError(
                    "완료된 PD-L1 검사의 분석 또는 병리과 검토가 끝날 때까지 재오더할 수 없습니다."
                )
            if not ExaminationOrder.objects.filter(
                case=locked_case,
                order_type=ExaminationOrder.OrderType.PDL1,
                status=ExaminationOrder.Status.CANCELLED,
            ).exists():
                raise PathologyOrderCreationError(
                    "취소된 PD-L1 오더가 있을 때만 재오더할 수 있습니다."
                )
        else:
            raise PathologyOrderCreationError("현재 진료 단계에서는 PD-L1 오더를 생성할 수 없습니다.")

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
