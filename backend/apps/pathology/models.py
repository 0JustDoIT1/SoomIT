from django.db import models
from django.db.models import Q

from apps.accounts.models import User
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase
from apps.common.models import TimestampedUUIDModel


class PathologySpecimen(TimestampedUUIDModel):
    class SpecimenType(models.TextChoices):
        BIOPSY = "BIOPSY", "생검"
        RESECTION = "RESECTION", "절제 검체"
        CYTOLOGY = "CYTOLOGY", "세포 검체"
        OTHER = "OTHER", "기타"

    class Status(models.TextChoices):
        REGISTERED = "REGISTERED", "등록"
        RECEIVED = "RECEIVED", "접수"
        PROCESSING = "PROCESSING", "처리 중"
        READY = "READY", "분석 가능"
        INVALIDATED = "INVALIDATED", "무효"

    case = models.ForeignKey(
        LungCancerCase,
        on_delete=models.PROTECT,
        related_name="pathology_specimens",
    )
    examination_order = models.ForeignKey(
        ExaminationOrder,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="pathology_specimens",
    )
    specimen_code = models.CharField(max_length=50)
    specimen_type = models.CharField(
        max_length=20,
        choices=SpecimenType.choices,
    )
    body_site = models.CharField(max_length=100, null=True, blank=True)
    collected_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.REGISTERED,
    )
    created_by_user = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="created_pathology_specimens",
    )

    class Meta:
        db_table = "pathology_specimens"
        constraints = [
            models.UniqueConstraint(
                fields=["case", "specimen_code"],
                name="uq_pathology_specimen_case_code",
            ),
        ]
        indexes = [
            models.Index(
                fields=["case", "status"],
                name="idx_pathspec_case_status",
            ),
        ]

    def __str__(self):
        return self.specimen_code


class WholeSlideImage(TimestampedUUIDModel):
    class Stain(models.TextChoices):
        HE = "HE", "H&E"
        PDL1 = "PDL1", "PD-L1"
        OTHER = "OTHER", "기타"

    specimen = models.ForeignKey(
        PathologySpecimen,
        on_delete=models.PROTECT,
        related_name="wsis",
    )
    image_asset = models.OneToOneField(
        CaseImageAsset,
        on_delete=models.PROTECT,
        related_name="whole_slide_image",
    )
    slide_code = models.CharField(max_length=50)
    block_code = models.CharField(max_length=50, null=True, blank=True)
    version = models.PositiveSmallIntegerField(default=1)
    stain = models.CharField(
        max_length=20,
        choices=Stain.choices,
        default=Stain.HE,
    )
    original_filename = models.CharField(max_length=255)
    sha256 = models.CharField(max_length=64)
    mpp = models.DecimalField(
        max_digits=7,
        decimal_places=4,
        null=True,
        blank=True,
    )
    is_current = models.BooleanField(default=True)
    invalidated_at = models.DateTimeField(null=True, blank=True)
    invalidation_reason = models.TextField(null=True, blank=True)
    uploaded_by_user = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="uploaded_whole_slide_images",
    )

    class Meta:
        db_table = "whole_slide_images"
        constraints = [
            models.UniqueConstraint(
                fields=["specimen", "slide_code", "version"],
                name="uq_wsi_specimen_slide_version",
            ),
            models.UniqueConstraint(
                fields=["specimen", "slide_code"],
                condition=Q(is_current=True),
                name="uq_wsi_current_specimen_slide",
            ),
            models.CheckConstraint(
                check=Q(mpp__gt=0) | Q(mpp__isnull=True),
                name="ck_wsi_mpp_positive",
          ),
            
        ]
        indexes = [
            models.Index(
                fields=["specimen", "is_current"],
                name="idx_wsi_specimen_current",
            ),
        ]

    def __str__(self):
        return f"{self.slide_code}-v{self.version}"


class PathologyWorkItem(TimestampedUUIDModel):
    class TaskType(models.TextChoices):
        WSI_UPLOAD = "WSI_UPLOAD", "WSI 등록"
        QUALITY_CHECK = "QUALITY_CHECK", "WSI 품질검증"
        ADEQUACY_ANALYSIS = "ADEQUACY_ANALYSIS", "적정성 AI 분석"
        ADEQUACY_REVIEW = "ADEQUACY_REVIEW", "적정성 전문의 판정"
        PATHOLOGY_ANALYSIS = "PATHOLOGY_ANALYSIS", "병리 AI 분석"
        DIAGNOSTIC_REVIEW = "DIAGNOSTIC_REVIEW", "병리 전문의 판독"
        REPORT_REVIEW = "REPORT_REVIEW", "병리 보고서 검토"

    class Status(models.TextChoices):
        PENDING = "PENDING", "대기"
        IN_PROGRESS = "IN_PROGRESS", "진행 중"
        BLOCKED = "BLOCKED", "차단"
        COMPLETED = "COMPLETED", "완료"
        CANCELLED = "CANCELLED", "취소"

    class Priority(models.TextChoices):
        NORMAL = "NORMAL", "일반"
        REVIEW_REQUIRED = "REVIEW_REQUIRED", "검토 필요"
        CRITICAL = "CRITICAL", "중요"

    case = models.ForeignKey(
        LungCancerCase,
        on_delete=models.PROTECT,
        related_name="pathology_work_items",
    )
    specimen = models.ForeignKey(
        PathologySpecimen,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="work_items",
    )
    wsi = models.ForeignKey(
        WholeSlideImage,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="work_items",
    )
    task_type = models.CharField(max_length=30, choices=TaskType.choices)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.NORMAL,
    )
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="assigned_pathology_work_items",
    )
    due_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "pathology_work_items"
        indexes = [
            models.Index(
                fields=["status", "priority", "created_at"],
                name="idx_pathwork_status_priority",
            ),
            models.Index(
                fields=["assigned_to", "status"],
                name="idx_pathwork_assignee_status",
            ),
        ]

    def __str__(self):
        return f"{self.task_type}:{self.status}"