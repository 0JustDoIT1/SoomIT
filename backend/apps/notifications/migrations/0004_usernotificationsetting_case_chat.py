from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("notifications", "0003_usernotificationsetting_examination_order")]

    operations = [
        migrations.AlterField(
            model_name="usernotificationsetting",
            name="notification_type",
            field=models.CharField(
                choices=[
                    ("EXAMINATION_ORDER", "검사 오더"),
                    ("AI_ANALYSIS_COMPLETED", "AI분석완료"),
                    ("CLINICAL_REVIEW_REQUIRED", "검토필요"),
                    ("APPOINTMENT", "예약"),
                    ("CASE_STAGE_CHANGED", "단계변경"),
                    ("CASE_CHAT", "Case 채팅"),
                    ("SYSTEM", "시스템"),
                ],
                max_length=30,
            ),
        ),
    ]
