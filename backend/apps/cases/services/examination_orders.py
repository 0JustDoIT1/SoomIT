from django.db import transaction

from apps.accounts.constants import PATHOLOGY_DEPARTMENT_CODE, RADIOLOGY_DEPARTMENT_CODE
from apps.accounts.models import User
from apps.clinical.models import ClinicalResult
from apps.notifications.services import create_in_app_staff_notifications
from .pathology_orders import has_submitted_pathology_gene_review

from ..models import ExaminationOrder, WorkflowStage


class ExaminationOrderCreationError(ValueError):
    pass


class ExaminationOrderUpdateError(ValueError):
    pass


PREREQUISITE_STAGE = {
    ExaminationOrder.OrderType.XRAY: None,
    ExaminationOrder.OrderType.CT: WorkflowStage.XRAY,
    ExaminationOrder.OrderType.PET_CT_TNM: WorkflowStage.CT,
    ExaminationOrder.OrderType.PATHOLOGY_GENE: WorkflowStage.PET_CT_TNM,
    ExaminationOrder.OrderType.PDL1: WorkflowStage.PATHOLOGY_GENE,
}

ORDER_TARGET_DEPARTMENT = {
    ExaminationOrder.OrderType.XRAY: RADIOLOGY_DEPARTMENT_CODE,
    ExaminationOrder.OrderType.CT: RADIOLOGY_DEPARTMENT_CODE,
    ExaminationOrder.OrderType.PET_CT_TNM: RADIOLOGY_DEPARTMENT_CODE,
    ExaminationOrder.OrderType.PATHOLOGY_GENE: PATHOLOGY_DEPARTMENT_CODE,
    ExaminationOrder.OrderType.PDL1: PATHOLOGY_DEPARTMENT_CODE,
}


def create_order_notifications(*, order, requesting_doctor):
    department_code = ORDER_TARGET_DEPARTMENT[order.order_type]
    hospital_id = getattr(getattr(requesting_doctor, "department_role", None), "department", None)
    hospital_id = getattr(hospital_id, "hospital_id", None)
    recipient_query = User.objects.filter(
        account_status=User.AccountStatus.ACTIVE,
        department_role__department__code=department_code,
    )
    if hospital_id is not None:
        recipient_query = recipient_query.filter(department_role__department__hospital_id=hospital_id)
    recipients = list(recipient_query.select_related("department_role__department"))
    payload = {"examination_order_id": str(order.id), "order_type": order.order_type}
    create_in_app_staff_notifications(
        recipients=recipients,
        case=order.case,
        notification_type="EXAMINATION_ORDER",
        title="새 검사 오더 도착",
        message=f"{order.case.case_code} · {order.get_order_type_display()} 오더가 요청되었습니다.",
        payload=payload,
    )
    create_in_app_staff_notifications(
        recipients=[requesting_doctor],
        case=order.case,
        notification_type="EXAMINATION_ORDER",
        title="검사 오더 접수",
        message=f"{order.get_order_type_display()} 오더를 {department_code} 부서에 전달했습니다.",
        payload=payload,
    )


@transaction.atomic
def create_examination_order(
    *,
    case,
    requesting_doctor,
    order_type,
    priority,
    purpose,
    clinical_note="",
    allow_repeat_current_stage=False,
):
    from apps.pathology.models import PathologyWorkItem

    locked_case = type(case).objects.select_for_update().get(pk=case.pk)
    prerequisite = PREREQUISITE_STAGE.get(order_type)
    if order_type not in PREREQUISITE_STAGE:
        raise ExaminationOrderCreationError("지원하지 않는 검사 오더 유형입니다.")
    if prerequisite is not None:
        has_confirmed_result = ClinicalResult.objects.filter(
            case=locked_case,
            workflow_stage=prerequisite,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
        ).exists()
        has_submitted_pathology_review = (
            order_type == ExaminationOrder.OrderType.PDL1
            and has_submitted_pathology_gene_review(locked_case)
        )
        if not has_confirmed_result and not has_submitted_pathology_review:
            if order_type == ExaminationOrder.OrderType.PDL1:
                raise ExaminationOrderCreationError(
                    "조직·유전자 검사 결과를 병리사가 의사에게 제출해야 합니다."
                )
            raise ExaminationOrderCreationError("선행 검사의 전문의 확정 결과가 필요합니다.")
        is_pathology_repeat = (
            allow_repeat_current_stage
            and order_type == ExaminationOrder.OrderType.PATHOLOGY_GENE
            and locked_case.current_stage == WorkflowStage.PATHOLOGY_GENE
        )
        if locked_case.current_stage != prerequisite and not is_pathology_repeat:
            raise ExaminationOrderCreationError("현재 진료 단계에서 생성할 수 없는 검사 오더입니다.")
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
    transaction.on_commit(lambda: create_order_notifications(order=order, requesting_doctor=requesting_doctor))
    return order, work_item


@transaction.atomic
def update_examination_order(*, order, requesting_doctor, **changes):
    locked_order = ExaminationOrder.objects.select_for_update().get(pk=order.pk)
    if locked_order.requesting_doctor_id != requesting_doctor.id:
        raise ExaminationOrderUpdateError("본인이 요청한 오더만 수정할 수 있습니다.")
    if locked_order.status != ExaminationOrder.Status.ORDERED:
        raise ExaminationOrderUpdateError("요청됨 상태의 오더만 수정할 수 있습니다.")
    for field, value in changes.items():
        setattr(locked_order, field, value)
    locked_order.save(update_fields=[*changes.keys(), "updated_at"])
    return locked_order


@transaction.atomic
def cancel_examination_order(*, order, requesting_doctor):
    from apps.pathology.models import PathologyWorkItem

    locked_order = ExaminationOrder.objects.select_for_update().get(pk=order.pk)
    if locked_order.requesting_doctor_id != requesting_doctor.id:
        raise ExaminationOrderUpdateError("본인이 요청한 오더만 취소할 수 있습니다.")
    if locked_order.status not in {ExaminationOrder.Status.ORDERED, ExaminationOrder.Status.SCHEDULED}:
        raise ExaminationOrderUpdateError("요청됨 또는 예약됨 상태의 오더만 취소할 수 있습니다.")
    work_items = PathologyWorkItem.objects.select_for_update().filter(examination_order=locked_order)
    if work_items.filter(status=PathologyWorkItem.Status.IN_PROGRESS).exists():
        raise ExaminationOrderUpdateError("진행 중인 병리 작업이 있어 이 오더를 취소할 수 없습니다.")
    locked_order.status = ExaminationOrder.Status.CANCELLED
    locked_order.save(update_fields=["status", "updated_at"])
    work_items.filter(
        status__in=[PathologyWorkItem.Status.PENDING, PathologyWorkItem.Status.BLOCKED],
    ).update(status=PathologyWorkItem.Status.CANCELLED)
    return locked_order
