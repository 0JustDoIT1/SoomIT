import uuid

from django.db import models
from django.db.models import Q

from apps.accounts.models import User, Hospital
from apps.common.models import TimestampedUUIDModel, CreatedOnlyUUIDModel


# ── 2-1. patients ────────────────────────────────────────────────
class Patient(TimestampedUUIDModel):
    class Sex(models.TextChoices):
        MALE = "MALE", "남"
        FEMALE = "FEMALE", "여"
        OTHER = "OTHER", "기타"
        UNKNOWN = "UNKNOWN", "미상"

    hospital = models.ForeignKey(Hospital, on_delete=models.PROTECT, related_name="patients")
    patient_code = models.CharField(max_length=50)
    name = models.CharField(max_length=100)
    birth_date = models.DateField()
    sex = models.CharField(max_length=10, choices=Sex.choices)
    phone_number = models.CharField(max_length=20)
    phone_number_hash = models.CharField(max_length=64, db_index=True)
    address = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = "patients"
        constraints = [
            models.UniqueConstraint(fields=["hospital", "patient_code"], name="uq_patient_hospital_code"),
        ]
        indexes = [
            models.Index(fields=["hospital", "phone_number_hash"], name="idx_patient_hosp_phonehash"),
            models.Index(fields=["name", "birth_date"], name="idx_patient_name_birth"),
        ]

    def __str__(self):
        return f"{self.name}({self.patient_code})"


# ── 2-2. patient_health_profiles ────────────────────────────────
class PatientHealthProfile(models.Model):
    class SmokingStatus(models.TextChoices):
        NEVER = "NEVER", "비흡연"
        FORMER = "FORMER", "과거흡연"
        CURRENT = "CURRENT", "현재흡연"
        UNKNOWN = "UNKNOWN", "미상"

    patient = models.OneToOneField(Patient, on_delete=models.CASCADE, primary_key=True, related_name="health_profile")
    smoking_status = models.CharField(max_length=10, choices=SmokingStatus.choices, null=True, blank=True)
    smoking_start_age = models.SmallIntegerField(null=True, blank=True)
    smoking_end_age = models.SmallIntegerField(null=True, blank=True)
    cigarettes_per_day = models.SmallIntegerField(null=True, blank=True)
    height_cm = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    allergies = models.JSONField(default=list, blank=True)
    comorbidities = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "patient_health_profiles"
        constraints = [
            models.CheckConstraint(check=Q(smoking_start_age__gte=0), name="ck_php_smoke_start_ge0"),
            models.CheckConstraint(
                check=Q(smoking_end_age__gte=models.F("smoking_start_age")) | Q(smoking_end_age__isnull=True),
                name="ck_php_smoke_end_ge_start",
            ),
            models.CheckConstraint(check=Q(cigarettes_per_day__gte=0), name="ck_php_cigs_ge0"),
            models.CheckConstraint(check=Q(height_cm__gt=0), name="ck_php_height_gt0"),
            models.CheckConstraint(check=Q(weight_kg__gt=0), name="ck_php_weight_gt0"),
        ]


# ── 2-3. patient_accounts ───────────────────────────────────────
class PatientAccount(TimestampedUUIDModel):
    class LinkStatus(models.TextChoices):
        UNLINKED = "UNLINKED", "미연결"
        PENDING_REVIEW = "PENDING_REVIEW", "확인대기"
        LINKED = "LINKED", "연결됨"
        REJECTED = "REJECTED", "거부됨"

    patient = models.ForeignKey(
        Patient, on_delete=models.PROTECT, null=True, blank=True, related_name="accounts"
    )
    phone_number = models.CharField(max_length=20)
    phone_number_hash = models.CharField(max_length=64, unique=True)
    phone_verified_at = models.DateTimeField()
    link_status = models.CharField(max_length=20, choices=LinkStatus.choices, default=LinkStatus.UNLINKED)
    linked_at = models.DateTimeField(null=True, blank=True)
    linked_by_user = models.ForeignKey(
        User, on_delete=models.PROTECT, null=True, blank=True, related_name="linked_patient_accounts"
    )

    class Meta:
        db_table = "patient_accounts"
        constraints = [
            models.UniqueConstraint(
                fields=["patient"], condition=Q(patient__isnull=False), name="uq_patient_account_patient"
            ),
        ]


# ── 2-4. social_accounts ────────────────────────────────────────
class SocialAccount(models.Model):
    class Provider(models.TextChoices):
        GOOGLE = "GOOGLE", "Google"
        KAKAO = "KAKAO", "Kakao"
        NAVER = "NAVER", "Naver"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient_account = models.ForeignKey(PatientAccount, on_delete=models.CASCADE, related_name="social_accounts")
    provider = models.CharField(max_length=10, choices=Provider.choices)
    provider_uid = models.CharField(max_length=255)
    linked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "social_accounts"
        constraints = [
            models.UniqueConstraint(fields=["provider", "provider_uid"], name="uq_social_provider_uid"),
            models.UniqueConstraint(fields=["patient_account", "provider"], name="uq_social_account_provider"),
        ]


# ── 2-5. patient_questionnaires ─────────────────────────────────
class PatientQuestionnaire(TimestampedUUIDModel):
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="questionnaires")
    case = models.ForeignKey(
        "cases.LungCancerCase", on_delete=models.PROTECT, null=True, blank=True, related_name="questionnaires"
    )
    questionnaire_type = models.CharField(max_length=50)
    questionnaire_version = models.CharField(max_length=30)
    responses = models.JSONField(default=dict, blank=True)
    is_completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "patient_questionnaires"


# ── 2-6. appointments ───────────────────────────────────────────
class Appointment(TimestampedUUIDModel):
    class AppointmentStatus(models.TextChoices):
        REQUESTED = "REQUESTED", "요청됨"
        CONFIRMED = "CONFIRMED", "확정됨"
        CANCELLED = "CANCELLED", "취소됨"

    class VisitStatus(models.TextChoices):
        SCHEDULED = "SCHEDULED", "예정"
        VISITED = "VISITED", "방문완료"
        NO_SHOW = "NO_SHOW", "미방문"

    class CreatedByType(models.TextChoices):
        PATIENT = "PATIENT", "환자"
        DOCTOR_ORDER = "DOCTOR_ORDER", "의사오더"
        SYSTEM = "SYSTEM", "시스템"

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="appointments")
    case = models.ForeignKey(
        "cases.LungCancerCase", on_delete=models.PROTECT, null=True, blank=True, related_name="appointments"
    )
    examination_order = models.ForeignKey(
        "cases.ExaminationOrder", on_delete=models.PROTECT, null=True, blank=True, related_name="appointments"
    )
    doctor = models.ForeignKey(
        User, on_delete=models.PROTECT, null=True, blank=True, related_name="doctor_appointments"
    )
    scheduled_at = models.DateTimeField()
    appointment_status = models.CharField(max_length=20, choices=AppointmentStatus.choices)
    confirmed_by_user = models.ForeignKey(
        User, on_delete=models.PROTECT, null=True, blank=True, related_name="confirmed_appointments"
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    cancelled_by_user = models.ForeignKey(
        User, on_delete=models.PROTECT, null=True, blank=True, related_name="cancelled_appointments"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(null=True, blank=True)
    visit_status = models.CharField(max_length=20, choices=VisitStatus.choices)
    checked_in_at = models.DateTimeField(null=True, blank=True)
    created_by_type = models.CharField(max_length=20, choices=CreatedByType.choices)
    created_by_patient_account = models.ForeignKey(
        PatientAccount, on_delete=models.PROTECT, null=True, blank=True, related_name="created_appointments"
    )
    cancellation_requested_by_patient_account = models.ForeignKey(
        PatientAccount, on_delete=models.PROTECT, null=True, blank=True, related_name="cancel_requested_appointments"
    )
    cancellation_requested_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "appointments"


# ── 2-7. medication_schedules ───────────────────────────────────
# v1.6: prescription_id는 Regimen/Cycle 처방 Header(clinical.Prescription)를 가리킴.
# "복용 알림 단위"이며 특정 약물 1개를 직접 의미하지 않음 → 실제 약물 연결은 MedicationScheduleItem이 담당.
class MedicationSchedule(TimestampedUUIDModel):
    patient_account = models.ForeignKey(PatientAccount, on_delete=models.PROTECT, related_name="medication_schedules")
    prescription = models.ForeignKey(
        "clinical.Prescription", on_delete=models.PROTECT, related_name="medication_schedules"
    )
    reminder_time = models.TimeField()
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "medication_schedules"
        constraints = [
            models.UniqueConstraint(
                fields=["patient_account", "prescription", "reminder_time"], name="uq_medschedule"
            ),
        ]


# ── 2-8. medication_schedule_items ──────────────────────────────
# 하나의 복약 알림(medication_schedule)에 포함되는 실제 약물별 처방 항목(prescription_item) 연결.
# 병원 내 투여 전용 약물(IV 등)은 여기 연결하지 않음 — 이 검증은 Service Layer 담당(DB 제약으로 표현 불가).
class MedicationScheduleItem(CreatedOnlyUUIDModel):
    medication_schedule = models.ForeignKey(
        MedicationSchedule, on_delete=models.PROTECT, related_name="items"
    )
    prescription_item = models.ForeignKey(
        "clinical.PrescriptionItem", on_delete=models.PROTECT, related_name="schedule_items"
    )

    class Meta:
        db_table = "medication_schedule_items"
        constraints = [
            models.UniqueConstraint(
                fields=["medication_schedule", "prescription_item"], name="uq_medschedule_item"
            ),
        ]


# ── 2-9. medication_intake_logs ─────────────────────────────────
class MedicationIntakeLog(TimestampedUUIDModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "대기"
        TAKEN = "TAKEN", "복용완료"
        MISSED = "MISSED", "미복용"
        SKIPPED = "SKIPPED", "건너뜀"

    medication_schedule = models.ForeignKey(
        MedicationSchedule, on_delete=models.PROTECT, related_name="intake_logs"
    )
    scheduled_at = models.DateTimeField()
    taken_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    class Meta:
        db_table = "medication_intake_logs"
        constraints = [
            models.UniqueConstraint(
                fields=["medication_schedule", "scheduled_at"], name="uq_medintake_schedule_time"
            ),
        ]


# ── 2-9. symptom_logs ───────────────────────────────────────────
class SymptomLog(TimestampedUUIDModel):
    class RiskLevel(models.TextChoices):
        GREEN = "GREEN", "정상"
        YELLOW = "YELLOW", "주의"
        RED = "RED", "위험"

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="symptom_logs")
    case = models.ForeignKey(
        "cases.LungCancerCase", on_delete=models.PROTECT, null=True, blank=True, related_name="symptom_logs"
    )
    symptom_type = models.CharField(max_length=50)
    symptom_description = models.TextField(null=True, blank=True)
    severity = models.SmallIntegerField()
    risk_level = models.CharField(max_length=10, choices=RiskLevel.choices)
    logged_at = models.DateTimeField()

    class Meta:
        db_table = "symptom_logs"
        constraints = [
            models.CheckConstraint(check=Q(severity__gte=0) & Q(severity__lte=10), name="ck_symptom_severity_0_10"),
        ]
