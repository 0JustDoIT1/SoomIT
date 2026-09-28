import django.db.models.deletion
import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0015_doctordashboardmemo"),
    ]

    operations = [
        migrations.CreateModel(
            name="TreatmentAIOpinion",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("opinion", models.TextField()),
                ("status", models.CharField(default="AVAILABLE", max_length=30)),
                ("safety_status", models.CharField(blank=True, default="", max_length=30)),
                ("selected_regimen_id", models.UUIDField(blank=True, null=True)),
                ("treatment_type", models.CharField(blank=True, default="", max_length=20)),
                ("treatment_plan", models.TextField(blank=True, default="")),
                ("sources", models.JSONField(blank=True, default=list)),
                ("review_required", models.BooleanField(default=True)),
                ("case", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="treatment_ai_opinion", to="cases.lungcancercase")),
            ],
            options={
                "db_table": "treatment_ai_opinions",
            },
        ),
    ]
