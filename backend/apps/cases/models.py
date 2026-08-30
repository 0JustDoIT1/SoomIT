from django.db import models
from django.db.models import Q

from apps.accounts.models import User
from apps.patients.models import Patient
from apps.common.models import TimestampedUUIDModel, UUIDModel


# 공통 Stage ENUM (여러 테이블에서 재사용)
class Stage(models.TextChoices):
    XRAY = "XRAY", "X-ray"
    CT = "CT", "CT"
    PATHOLOGY = "PATHOLOGY", "병리"
    STAGING = "STAGING", "병기(TNM)"
    GENE = "GENE", "유전자"
    TREATMENT = "TREATMENT", "치료"
    PRESCRIPTION = "PRESCRIPTION", "처방"


# ── 3-1. lung_cancer_cases ──────────────────────────────────────
class LungCancerCase(TimestampedUUIDModel):
    class CaseStatus(models.TextChoices):
        ACTIVE = "ACTIVE", "진행중"
        REFERRED_OUT = "REFERRED_OUT", "전원"
        CLOSED = "CLOSED", "종결"

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="cases")
    case_code = models.CharField(max_length=50, unique=True)
    primary_doctor = models.ForeignKey(
        User, on_delete=models.PROTECT, null=True, blank=True, related_name="primary_cases"
    )
    current_stage = models.CharField(max_length=20, choices=Stage.choices)
    case_status = models.CharField(max_length=20, choices=CaseStatus.choices, default=CaseStatus.ACTIVE)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "lung_cancer_cases"
        constraints = [
            # 환자당 ACTIVE Case는 1개만 허용
            models.UniqueConstraint(
                fields=["patient"], condition=Q(case_status="ACTIVE"), name="uq_case_one_active_per_patient"
            ),
        ]

    def __str__(self):
        return self.case_code


# ── 3-2. clinician_decisions ────────────────────────────────────
# 스펙상 created_at/updated_at 없음(decided_at만 존재) → UUIDModel만 상속
class ClinicianDecision(UUIDModel):
    class DecisionType(models.TextChoices):
        PROCEED_NEXT_STAGE = "PROCEED_NEXT_STAGE", "다음 단계 진행"
        REPEAT_EXAMINATION = "REPEAT_EXAMINATION", "재검사"
        REFERRED_OUT = "REFERRED_OUT", "전원"
        CLOSE_CASE = "CLOSE_CASE", "종결"

    case = models.ForeignKey(LungCancerCase, on_delete=models.PROTECT, related_name="clinician_decisions")
    source_stage = models.CharField(max_length=20, choices=Stage.choices)
    source_clinical_result = models.ForeignKey(
        "clinical.ClinicalResult", on_delete=models.PROTECT, null=True, blank=True, related_name="clinician_decisions"
    )
    decision_type = models.CharField(max_length=25, choices=DecisionType.choices)
    target_stage = models.CharField(max_length=20, choices=Stage.choices, null=True, blank=True)
    reason = models.TextField(null=True, blank=True)
    decided_by_user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="clinician_decisions")
    decided_at = models.DateTimeField()

    class Meta:
        db_table = "clinician_decisions"


# ── 3-3. examination_orders ─────────────────────────────────────
class ExaminationOrder(TimestampedUUIDModel):
    class ExamType(models.TextChoices):
        XRAY = "XRAY", "X-ray"
        CT = "CT", "CT"
        WSI = "WSI", "WSI"

    class Priority(models.TextChoices):
        NORMAL = "NORMAL", "일반"
        URGENT = "URGENT", "긴급"

    class Status(models.TextChoices):
        ORDERED = "ORDERED", "요청됨"
        SCHEDULED = "SCHEDULED", "예약됨"
        COMPLETED = "COMPLETED", "완료"
        CANCELLED = "CANCELLED", "취소됨"

    case = models.ForeignKey(LungCancerCase, on_delete=models.PROTECT, related_name="examination_orders")
    exam_type = models.CharField(max_length=10, choices=ExamType.choices)
    requesting_doctor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="requested_examinations")
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.NORMAL)
    purpose = models.TextField()
    clinical_note = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.ORDERED)

    class Meta:
        db_table = "examination_orders"


# ── 3-4. case_image_assets ──────────────────────────────────────
class CaseImageAsset(TimestampedUUIDModel):
    class ImageType(models.TextChoices):
        XRAY = "XRAY", "X-ray"
        CT = "CT", "CT"
        WSI = "WSI", "WSI"

    class StorageType(models.TextChoices):
        ORTHANC = "ORTHANC", "Orthanc"
        GCS = "GCS", "GCS"

    class Status(models.TextChoices):
        UPLOADING = "UPLOADING", "업로드중"
        VALIDATING = "VALIDATING", "검증중"
        READY = "READY", "사용가능"
        FAILED = "FAILED", "실패"
        INVALID = "INVALID", "유효하지않음"

    case = models.ForeignKey(LungCancerCase, on_delete=models.PROTECT, related_name="image_assets")
    examination_order = models.ForeignKey(
        ExaminationOrder, on_delete=models.PROTECT, null=True, blank=True, related_name="image_assets"
    )
    uploaded_stage = models.CharField(max_length=20, choices=Stage.choices)
    image_type = models.CharField(max_length=10, choices=ImageType.choices)
    storage_type = models.CharField(max_length=10, choices=StorageType.choices)
    storage_uri = models.CharField(max_length=1000, unique=True)
    file_format = models.CharField(max_length=20)
    acquired_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.UPLOADING)

    class Meta:
        db_table = "case_image_assets"
