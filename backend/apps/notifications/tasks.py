from datetime import datetime

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from apps.patients.models import (
    MedicationIntakeLog,
    MedicationSchedule,
)

from .models import PatientNotificationSetting
from .services import send_patient_push


def is_medication_schedule_due(
    schedule,
    target_date,
):
    if not schedule.enabled:
        return False

    if schedule.start_date is None:
        return False

    if target_date < schedule.start_date:
        return False

    if (
        schedule.end_date is not None
        and target_date > schedule.end_date
    ):
        return False

    if (
        schedule.repeat_type
        == MedicationSchedule.RepeatType.DAILY
    ):
        return True

    if (
        schedule.repeat_type
        == MedicationSchedule.RepeatType.WEEKLY
    ):
        return target_date.weekday() in (
            schedule.repeat_weekdays or []
        )

    if (
        schedule.repeat_type
        == MedicationSchedule.RepeatType.CYCLE_DAY
    ):
        cycle_day = (
            target_date - schedule.start_date
        ).days + 1

        return cycle_day in (
            schedule.cycle_days or []
        )

    return False


def _build_scheduled_at(
    *,
    target_date,
    reminder_time,
):
    current_timezone = timezone.get_current_timezone()

    scheduled_at = datetime.combine(
        target_date,
        reminder_time,
    )

    return timezone.make_aware(
        scheduled_at,
        current_timezone,
    )


def _build_medication_message(schedule):
    drug_names = [
        item.prescription_item.drug.drug_name
        for item in schedule.items.all()
    ]

    if not drug_names:
        return "복약 시간을 확인해 주세요."

    displayed_names = drug_names[:2]
    medication_name = ", ".join(displayed_names)

    remaining_count = len(drug_names) - len(
        displayed_names
    )

    if remaining_count > 0:
        medication_name += (
            f" 외 {remaining_count}개"
        )

    return f"{medication_name} 복용 시간입니다."


@shared_task(
    name=(
        "apps.notifications.tasks."
        "send_due_medication_reminders"
    )
)
def send_due_medication_reminders():
    current_at = timezone.localtime()
    target_date = current_at.date()

    schedules = (
        MedicationSchedule.objects
        .filter(
            enabled=True,
            start_date__isnull=False,
            start_date__lte=target_date,
        )
        .filter(
            Q(end_date__isnull=True)
            | Q(end_date__gte=target_date)
        )
        .select_related(
            "patient_account",
            "prescription",
        )
        .prefetch_related(
            "items__prescription_item__drug"
        )
    )

    checked_count = 0
    created_count = 0
    notification_count = 0

    for schedule in schedules:
        if (
            schedule.reminder_time.hour
            != current_at.hour
            or schedule.reminder_time.minute
            != current_at.minute
        ):
            continue

        checked_count += 1

        if not is_medication_schedule_due(
            schedule,
            target_date,
        ):
            continue

        scheduled_at = _build_scheduled_at(
            target_date=target_date,
            reminder_time=schedule.reminder_time,
        )

        intake_log, created = (
            MedicationIntakeLog.objects
            .get_or_create(
                medication_schedule=schedule,
                scheduled_at=scheduled_at,
                defaults={
                    "status": (
                        MedicationIntakeLog
                        .Status
                        .PENDING
                    ),
                },
            )
        )

        if not created:
            continue

        created_count += 1

        send_result = send_patient_push(
            patient_account=(
                schedule.patient_account
            ),
            notification_type=(
                PatientNotificationSetting
                .NotificationType
                .MEDICATION
            ),
            title="복약 시간입니다.",
            message=_build_medication_message(
                schedule
            ),
            payload={
                "medication_schedule_id": str(
                    schedule.id
                ),
                "medication_intake_log_id": str(
                    intake_log.id
                ),
                "scheduled_at": (
                    scheduled_at.isoformat()
                ),
            },
        )

        if send_result["success_count"] > 0:
            notification_count += 1

    return {
        "checked_count": checked_count,
        "created_count": created_count,
        "notification_count": notification_count,
    }