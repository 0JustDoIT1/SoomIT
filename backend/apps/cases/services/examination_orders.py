from django.db import transaction

from apps.clinical.models import ClinicalResult

from ..models import ExaminationOrder, WorkflowStage


class ExaminationOrderCreationError(ValueError):
    pass


PREREQUISITE_STAGE = {
    ExaminationOrder.OrderType.CT: WorkflowStage.XRAY,
    ExaminationOrder.OrderType.PET_CT_TNM: WorkflowStage.CT,
    ExaminationOrder.OrderType.PATHOLOGY_GENE: WorkflowStage.PET_CT_TNM,
    ExaminationOrder.OrderType.PDL1: WorkflowStage.PATHOLOGY_GENE,
}


@transaction.atomic
def create_examination_order(*, case, requesting_doctor, order_type, priority, purpose, clinical_note=""):
    from apps.pathology.models import PathologyWorkItem

    locked_case = type(case).objects.select_for_update().get(pk=case.pk)
    prerequisite = PREREQUISITE_STAGE.get(order_type)
    if prerequisite is None:
        raise ExaminationOrderCreationError("지원하지 않는 검사 오더 유형입니다.")
    if not ClinicalResult.objects.filter(
        case=locked_case,
        workflow_stage=prerequisite,
        result_status=ClinicalResult.ResultStatus.CONFIRMED,
    ).exists():
        raise ExaminationOrderCreationError("선행 검사의 전문의 확정 결과가 필요합니다.")
    if ExaminationOrder.objects.filter(
        case=locked_case,
        order_type=order_type,
        status__in=[ExaminationOrder.Status.ORDERED, ExaminationOrder.Status.SCHEDULED],
    ).exists():
        raise ExaminationOrderCreationError("동일한 활성 검사 오더가 이미 존재합니다.")

    order = ExaminationOrder.objects.create(
        case=locked_case,
        order_type=order_type,
        requesting_doctor=requesting_doctor,
        priority=priority,
        purpose=purpose,
        clinical_note=clinical_note,
        status=ExaminationOrder.Status.ORDERED,
    )
    work_item = None
    if order_type in {ExaminationOrder.OrderType.PATHOLOGY_GENE, ExaminationOrder.OrderType.PDL1}:
        work_item = PathologyWorkItem.objects.create(
            case=locked_case,
            examination_order=order,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
            status=PathologyWorkItem.Status.PENDING,
            priority=priority,
        )
    return order, work_item
