from django.db import models

from apps.accounts.models import User
from apps.ai_results.models import AiAnalysis
from apps.cases.models import ExaminationOrder, LungCancerCase
from apps.common.models import TimestampedUUIDModel


class RadiologyReview(TimestampedUUIDModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "의사 판독 대기"
        IN_PROGRESS = "IN_PROGRESS", "의사 판독 진행 중"
        COMPLETED = "COMPLETED", "의사 판독 완료"

    case = models.ForeignKey(LungCancerCase, on_delete=models.PROTECT, related_name="radiology_reviews")
    examination_order = models.ForeignKey(
        ExaminationOrder, on_delete=models.PROTECT, related_name="radiology_reviews"
    )
    ai_analysis = models.ForeignKey(
        AiAnalysis, on_delete=models.PROTECT, related_name="radiology_reviews"
    )
    assigned_doctor = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="assigned_radiology_reviews"
    )
    submitted_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="submitted_radiology_reviews"
    )
    submitted_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    class Meta:
        db_table = "radiology_reviews"
        constraints = [
            models.UniqueConstraint(
                fields=["examination_order", "ai_analysis"],
                name="uq_radiology_review_order_analysis",
            ),
        ]
        indexes = [
            models.Index(
                fields=["assigned_doctor", "status"],
                name="idx_radreview_doctor_status",
            ),
        ]
