from django.conf import settings
from django.db import models

from apps.accounts.models import Hospital
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
    is_private = models.BooleanField(default=False)
    recipients = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="private_case_chat_messages",
    )

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


class CaseChatMessageReadReceipt(CreatedOnlyUUIDModel):
    message = models.ForeignKey(
        CaseChatMessage,
        on_delete=models.CASCADE,
        related_name="read_receipts",
    )
    reader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="case_chat_read_receipts",
    )

    class Meta:
        db_table = "case_chat_message_read_receipts"
        constraints = [
            models.UniqueConstraint(
                fields=["message", "reader"],
                name="uq_chat_message_reader_receipt",
            ),
        ]
        indexes = [
            models.Index(fields=["reader", "-created_at"], name="idx_chat_receipt_reader"),
        ]


class GlobalChatMessage(CreatedOnlyUUIDModel):
    hospital = models.ForeignKey(Hospital, on_delete=models.CASCADE, related_name="global_chat_messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="global_chat_messages")
    client_message_id = models.UUIDField()
    body = models.CharField(max_length=2000)

    class Meta:
        db_table = "global_chat_messages"
        ordering = ["-created_at", "-id"]
        constraints = [models.UniqueConstraint(fields=["hospital", "sender", "client_message_id"], name="uq_global_chat_hospital_sender_client_msg")]
        indexes = [models.Index(fields=["hospital", "-created_at", "-id"], name="idx_glob_chat_hosp_cur")]


class GlobalChatMessageReadReceipt(CreatedOnlyUUIDModel):
    message = models.ForeignKey(GlobalChatMessage, on_delete=models.CASCADE, related_name="read_receipts")
    reader = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="global_chat_read_receipts")

    class Meta:
        db_table = "global_chat_message_read_receipts"
        constraints = [models.UniqueConstraint(fields=["message", "reader"], name="uq_global_chat_message_reader")]

