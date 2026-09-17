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


class DoctorWeeklyAvailability(TimestampedUUIDModel):
    """A doctor's recurring clinic hours used for patient appointment lookup."""

    class Weekday(models.IntegerChoices):
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"
        SUNDAY = 6, "Sunday"

    doctor = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="weekly_availabilities"
    )
    weekday = models.PositiveSmallIntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_minutes = models.PositiveSmallIntegerField(default=30)
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "doctor_weekly_availabilities"
        ordering = ["weekday", "start_time", "id"]
        constraints = [
            models.CheckConstraint(
                check=Q(end_time__gt=models.F("start_time")),
                name="ck_docweeklyavail_end_gt_start",
            ),
            models.CheckConstraint(
                check=Q(slot_minutes__gt=0),
                name="ck_docweeklyavail_slot_positive",
            ),
            models.CheckConstraint(
                check=Q(slot_minutes=30),
                name="ck_docweeklyavail_slot_30_minutes",
            ),
            models.UniqueConstraint(
                fields=["doctor", "weekday", "start_time", "end_time"],
                name="uq_docweeklyavail_interval",
            ),
        ]
