import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("chat", "0003_casechatmessagereadreceipt"), ("accounts", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="GlobalChatMessage",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("client_message_id", models.UUIDField()),
                ("body", models.CharField(max_length=2000)),
                ("hospital", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="global_chat_messages", to="accounts.hospital")),
                ("sender", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="global_chat_messages", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "global_chat_messages", "ordering": ["-created_at", "-id"], "indexes": [models.Index(fields=["hospital", "-created_at", "-id"], name="idx_glob_chat_hosp_cur")]},
        ),
        migrations.CreateModel(
            name="GlobalChatMessageReadReceipt",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("message", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="read_receipts", to="chat.globalchatmessage")),
                ("reader", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="global_chat_read_receipts", to=settings.AUTH_USER_MODEL)),
            ],
            options={"db_table": "global_chat_message_read_receipts"},
        ),
        migrations.AddConstraint(model_name="globalchatmessage", constraint=models.UniqueConstraint(fields=("hospital", "sender", "client_message_id"), name="uq_global_chat_hospital_sender_client_msg")),
        migrations.AddConstraint(model_name="globalchatmessagereadreceipt", constraint=models.UniqueConstraint(fields=("message", "reader"), name="uq_global_chat_message_reader")),
    ]
