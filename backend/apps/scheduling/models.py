from django.db import models
from django.db.models import Q

from apps.accounts.models import User
from apps.common.models import TimestampedUUIDModel


# ── 7-1. doctor_schedules ───────────────────────────────────────
class DoctorSchedule(TimestampedUUIDModel):
    class ScheduleType(models.TextChoices):
        EXTRA_AVAILABLE = "EXTRA_AVAILABLE", "추가진료가능"
        UNAVAILABLE = "UNAVAILABLE", "휴진"

    doctor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="schedules")
    schedule_type = models.CharField(max_length=20, choices=ScheduleType.choices)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    reason = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "doctor_schedules"
        constraints = [
            models.CheckConstraint(check=Q(end_at__gt=models.F("start_at")), name="ck_docsched_end_gt_start"),
        ]
