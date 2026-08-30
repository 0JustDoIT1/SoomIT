from django.db import models

from apps.accounts.models import User
from apps.cases.models import CaseImageAsset, LungCancerCase
from apps.clinical.models import ClinicalResult
from apps.common.models import TimestampedUUIDModel, UUIDModel


# ── 8-1. image_annotations ──────────────────────────────────────
class ImageAnnotation(TimestampedUUIDModel):
    class AnnotationType(models.TextChoices):
        POINT = "POINT", "점"
        BOUNDING_BOX = "BOUNDING_BOX", "박스"
        POLYGON = "POLYGON", "다각형"
        FREEHAND = "FREEHAND", "자유곡선"
        TEXT = "TEXT", "텍스트"

    image_asset = models.ForeignKey(CaseImageAsset, on_delete=models.PROTECT, related_name="annotations")
    clinical_result = models.ForeignKey(
        ClinicalResult, on_delete=models.PROTECT, null=True, blank=True, related_name="annotations"
    )
    annotation_type = models.CharField(max_length=15, choices=AnnotationType.choices)
    annotation_data = models.JSONField()
    note = models.TextField(null=True, blank=True)
    created_by_user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="created_annotations")

    class Meta:
        db_table = "image_annotations"


# ── 8-2. case_bookmarks ─────────────────────────────────────────
class CaseBookmark(UUIDModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="case_bookmarks")
    case = models.ForeignKey(LungCancerCase, on_delete=models.CASCADE, related_name="bookmarked_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "case_bookmarks"
        constraints = [
            models.UniqueConstraint(fields=["user", "case"], name="uq_bookmark_user_case"),
        ]
