from django.db import models

from apps.accounts.models import User
from apps.cases.models import LungCancerCase
from apps.common.models import CreatedOnlyUUIDModel


# ── 10-2. audit_logs ────────────────────────────────────────────
class AuditLog(CreatedOnlyUUIDModel):
    class ActionType(models.TextChoices):
        VIEW = "VIEW", "조회"
        CREATE = "CREATE", "생성"
        UPDATE = "UPDATE", "수정"
        DELETE = "DELETE", "삭제"
        CONFIRM = "CONFIRM", "확정"
        CANCEL = "CANCEL", "취소"
        STATUS_CHANGE = "STATUS_CHANGE", "상태변경"
        LOGIN = "LOGIN", "로그인"
        LOGOUT = "LOGOUT", "로그아웃"

    user = models.ForeignKey(User, on_delete=models.PROTECT, null=True, blank=True, related_name="audit_logs")
    case = models.ForeignKey(
        LungCancerCase, on_delete=models.PROTECT, null=True, blank=True, related_name="audit_logs"
    )
    action_type = models.CharField(max_length=15, choices=ActionType.choices)
    target_table = models.CharField(max_length=100)
    target_id = models.UUIDField()
    before_data = models.JSONField(null=True, blank=True)
    after_data = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "audit_logs"
