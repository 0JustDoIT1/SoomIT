from django.db import models
from django.db.models import Q

from apps.accounts.models import User
from apps.patients.models import PatientAccount
from apps.cases.models import LungCancerCase
from apps.common.models import UUIDModel, CreatedOnlyUUIDModel


# ── 9-1. patient_notification_settings ──────────────────────────
class PatientNotificationSetting(UUIDModel):
    class NotificationType(models.TextChoices):
        APPOINTMENT = "APPOINTMENT", "예약"
        EXAMINATION = "EXAMINATION", "검사일정"
        RESULT = "RESULT", "검사결과"
        MEDICATION = "MEDICATION", "복약"
        QUESTIONNAIRE = "QUESTIONNAIRE", "문진"
        HEALTH = "HEALTH", "건강관리"

    patient_account = models.ForeignKey(
        PatientAccount, on_delete=models.CASCADE, related_name="notification_settings"
    )
    notification_type = models.CharField(max_length=20, choices=NotificationType.choices)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "patient_notification_settings"
        constraints = [
            models.UniqueConstraint(
                fields=["patient_account", "notification_type"], name="uq_patient_notif_setting"
            ),
        ]


# ── 9-2. user_notification_settings ─────────────────────────────
class UserNotificationSetting(UUIDModel):
    class NotificationType(models.TextChoices):
        AI_ANALYSIS_COMPLETED = "AI_ANALYSIS_COMPLETED", "AI분석완료"
        CLINICAL_REVIEW_REQUIRED = "CLINICAL_REVIEW_REQUIRED", "검토필요"
        APPOINTMENT = "APPOINTMENT", "예약"
        CASE_STAGE_CHANGED = "CASE_STAGE_CHANGED", "단계변경"
        SYSTEM = "SYSTEM", "시스템"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notification_settings")
    notification_type = models.CharField(max_length=30, choices=NotificationType.choices)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_notification_settings"
        constraints = [
            models.UniqueConstraint(fields=["user", "notification_type"], name="uq_user_notif_setting"),
        ]


# ── 9-3. notification_logs ──────────────────────────────────────
class NotificationLog(CreatedOnlyUUIDModel):
    class Channel(models.TextChoices):
        IN_APP = "IN_APP", "인앱"
        PUSH = "PUSH", "푸시"

    class DeliveryStatus(models.TextChoices):
        PENDING = "PENDING", "대기"
        SENT = "SENT", "발송완료"
        FAILED = "FAILED", "실패"

    recipient_user = models.ForeignKey(
        User, on_delete=models.PROTECT, null=True, blank=True, related_name="notification_logs"
    )
    recipient_patient_account = models.ForeignKey(
        PatientAccount, on_delete=models.PROTECT, null=True, blank=True, related_name="notification_logs"
    )
    case = models.ForeignKey(
        LungCancerCase, on_delete=models.PROTECT, null=True, blank=True, related_name="notification_logs"
    )
    notification_type = models.CharField(max_length=50)
    channel = models.CharField(max_length=10, choices=Channel.choices)
    title = models.CharField(max_length=200)
    message = models.TextField()
    payload = models.JSONField(null=True, blank=True)
    delivery_status = models.CharField(max_length=10, choices=DeliveryStatus.choices, default=DeliveryStatus.PENDING)
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)

    class Meta:
        db_table = "notification_logs"
        constraints = [
            # 수신자는 정확히 하나만 존재해야 함 (user XOR patient_account)
            models.CheckConstraint(
                check=(
                    Q(recipient_user__isnull=False, recipient_patient_account__isnull=True)
                    | Q(recipient_user__isnull=True, recipient_patient_account__isnull=False)
                ),
                name="ck_notiflog_exactly_one_recipient",
            ),
        ]
