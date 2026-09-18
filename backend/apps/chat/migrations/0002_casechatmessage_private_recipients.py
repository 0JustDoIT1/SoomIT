from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("chat", "0001_initial"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.AddField(
            model_name="casechatmessage",
            name="is_private",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="casechatmessage",
            name="recipients",
            field=models.ManyToManyField(blank=True, related_name="private_case_chat_messages", to=settings.AUTH_USER_MODEL),
        ),
    ]
