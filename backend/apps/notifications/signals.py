from django.db import transaction
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.clinical.models import ClinicalResult
from apps.patients.models import Appointment, PatientAccount

from .models import NotificationLog, PatientNotificationSetting
from .services import send_patient_push


PATIENT_RESULT_STAGES = {
    "XRAY",
    "CT",
    "PET_CT_TNM",
    "PATHOLOGY_GENE",
    "PDL1",
}


@receiver(pre_save, sender=ClinicalResult)
def remember_previous_result_status(sender, instance, **kwargs):
    if not instance.pk:
        instance._previous_result_status = None
        return

    instance._previous_result_status = (
        ClinicalResult.objects
        .filter(pk=instance.pk)
        .values_list("result_status", flat=True)
        .first()
    )


@receiver(post_save, sender=ClinicalResult)
def notify_patient_when_result_confirmed(
    sender,
    instance,
    created,
    **kwargs,
):
    previous_status = getattr(
        instance,
        "_previous_result_status",
        None,
    )

    if instance.workflow_stage not in PATIENT_RESULT_STAGES:
        return

    if instance.result_status != ClinicalResult.ResultStatus.CONFIRMED:
        return

    if previous_status == ClinicalResult.ResultStatus.CONFIRMED:
        return

    clinical_result_id = str(instance.id)

    def send_notification():
        patient_account = (
            PatientAccount.objects
            .filter(
                patient=instance.case.patient,
                link_status=PatientAccount.LinkStatus.LINKED,
            )
            .first()
        )

        if patient_account is None:
            return

        already_sent = NotificationLog.objects.filter(
            recipient_patient_account=patient_account,
            notification_type=(
                PatientNotificationSetting.NotificationType.RESULT
            ),
            payload__clinical_result_id=clinical_result_id,
        ).exists()

        if already_sent:
            return

        send_patient_push(
            patient_account=patient_account,
            notification_type=(
                PatientNotificationSetting.NotificationType.RESULT
            ),
            title="검사 결과가 확인되었습니다.",
            message="앱에서 검사 결과를 확인해주세요.",
            payload={
                "clinical_result_id": clinical_result_id,
                "workflow_stage": instance.workflow_stage,
            },
        )

    transaction.on_commit(send_notification)


@receiver(pre_save, sender=Appointment)
def remember_previous_appointment(sender, instance, **kwargs):
    if not instance.pk:
        instance._previous_appointment_status = None
        instance._previous_scheduled_at = None
        return

    previous = (
        Appointment.objects
        .filter(pk=instance.pk)
        .values("appointment_status", "scheduled_at")
        .first()
    )

    instance._previous_appointment_status = (
        previous["appointment_status"]
        if previous else None
    )
    instance._previous_scheduled_at = (
        previous["scheduled_at"]
        if previous else None
    )


@receiver(post_save, sender=Appointment)
def notify_patient_when_appointment_changes(
    sender,
    instance,
    created,
    **kwargs,
):
    if created:
        return

    if instance.examination_order_id is not None:
        return

    previous_status = getattr(
        instance,
        "_previous_appointment_status",
        None,
    )
    previous_scheduled_at = getattr(
        instance,
        "_previous_scheduled_at",
        None,
    )

    event_type = None
    title = None
    message = None

    if (
        instance.appointment_status
        == Appointment.AppointmentStatus.CONFIRMED
        and previous_status
        != Appointment.AppointmentStatus.CONFIRMED
    ):
        event_type = "CONFIRMED"
        title = "예약이 확정되었습니다."
        message = "앱에서 예약 일정을 확인해주세요."

    elif (
        instance.appointment_status
        == Appointment.AppointmentStatus.CANCELLED
        and previous_status
        != Appointment.AppointmentStatus.CANCELLED
    ):
        event_type = "CANCELLED"
        title = "예약이 취소되었습니다."
        message = "앱에서 예약 정보를 확인해주세요."

    elif (
        previous_scheduled_at is not None
        and previous_scheduled_at != instance.scheduled_at
    ):
        event_type = "CHANGED"
        title = "예약 일정이 변경되었습니다."
        message = "변경된 예약 일정을 확인해주세요."

    if event_type is None:
        return

    appointment_id = str(instance.id)

    def send_notification():
        patient_account = (
            PatientAccount.objects
            .filter(
                patient=instance.patient,
                link_status=PatientAccount.LinkStatus.LINKED,
            )
            .first()
        )

        if patient_account is None:
            return

        already_sent = NotificationLog.objects.filter(
            recipient_patient_account=patient_account,
            notification_type=(
                PatientNotificationSetting.NotificationType.APPOINTMENT
            ),
            payload__appointment_id=appointment_id,
            payload__event_type=event_type,
            payload__scheduled_at=(
                instance.scheduled_at.isoformat()
                if instance.scheduled_at
                else ""
            ),
        ).exists()

        if already_sent:
            return

        send_patient_push(
            patient_account=patient_account,
            notification_type=(
                PatientNotificationSetting.NotificationType.APPOINTMENT
            ),
            title=title,
            message=message,
            payload={
                "appointment_id": appointment_id,
                "event_type": event_type,
                "scheduled_at": (
                    instance.scheduled_at.isoformat()
                    if instance.scheduled_at
                    else ""
                ),
            },
        )

    transaction.on_commit(send_notification)


@receiver(post_save, sender=Appointment)
def notify_patient_when_examination_changes(
    sender,
    instance,
    created,
    **kwargs,
):
    if instance.examination_order_id is None:
        return

    previous_status = getattr(
        instance,
        "_previous_appointment_status",
        None,
    )
    previous_scheduled_at = getattr(
        instance,
        "_previous_scheduled_at",
        None,
    )

    if created:
        event_type = "CREATED"
        title = "검사 일정이 등록되었습니다."
    elif (
        instance.appointment_status
        == Appointment.AppointmentStatus.CANCELLED
        and previous_status
        != Appointment.AppointmentStatus.CANCELLED
    ):
        event_type = "CANCELLED"
        title = "검사 일정이 취소되었습니다."
    elif previous_scheduled_at != instance.scheduled_at:
        event_type = "CHANGED"
        title = "검사 일정이 변경되었습니다."
    else:
        return

    appointment_id = str(instance.id)

    def send_notification():
        patient_account = (
            PatientAccount.objects
            .filter(
                patient=instance.patient,
                link_status=PatientAccount.LinkStatus.LINKED,
            )
            .first()
        )

        if patient_account is None:
            return

        send_patient_push(
            patient_account=patient_account,
            notification_type=(
                PatientNotificationSetting.NotificationType.EXAMINATION
            ),
            title=title,
            message="앱에서 검사 일정을 확인해주세요.",
            payload={
                "appointment_id": appointment_id,
                "event_type": event_type,
                "examination_order_id": str(
                    instance.examination_order_id
                ),
            },
        )

    transaction.on_commit(send_notification)
