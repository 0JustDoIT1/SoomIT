import uuid

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0002_casechatmessage_private_recipients"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="CaseChatMessageReadReceipt",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("message", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="read_receipts", to="chat.casechatmessage")),
                ("reader", models.ForeignKey(on_delete=models.deletion.PROTECT, related_name="case_chat_read_receipts", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "case_chat_message_read_receipts"},
        ),
        migrations.AddConstraint(
            model_name="casechatmessagereadreceipt",
            constraint=models.UniqueConstraint(fields=("message", "reader"), name="uq_chat_message_reader_receipt"),
        ),
        migrations.AddIndex(
            model_name="casechatmessagereadreceipt",
            index=models.Index(fields=["reader", "-created_at"], name="idx_chat_receipt_reader"),
        ),
    ]
