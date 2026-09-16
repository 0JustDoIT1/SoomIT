from django.conf import settings
from django.db import models

from apps.cases.models import LungCancerCase
from apps.common.models import CreatedOnlyUUIDModel


class CaseChatMessage(CreatedOnlyUUIDModel):
    case = models.ForeignKey(
        LungCancerCase,
        on_delete=models.CASCADE,
        related_name="chat_messages",
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="case_chat_messages",
    )
    client_message_id = models.UUIDField()
    body = models.CharField(max_length=2000)

    class Meta:
        db_table = "case_chat_messages"
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["case", "sender", "client_message_id"],
                name="uq_chat_case_sender_client_msg",
            ),
        ]
        indexes = [
            models.Index(
                fields=["case", "-created_at", "-id"],
                name="idx_chat_case_cursor",
            ),
        ]

