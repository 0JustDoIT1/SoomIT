import django.db.models.deletion
import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0014_physiciantreatmentopinion"),
    ]

    operations = [
        migrations.CreateModel(
            name="DoctorDashboardMemo",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("content", models.CharField(max_length=300)),
                ("author", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="dashboard_case_memos", to="accounts.user")),
                ("case", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="doctor_dashboard_memos", to="cases.lungcancercase")),
            ],
            options={"db_table": "doctor_dashboard_memos"},
        ),
        migrations.AddConstraint(
            model_name="doctordashboardmemo",
            constraint=models.UniqueConstraint(fields=("case", "author"), name="uq_doctor_dashboard_memo_case_author"),
        ),
    ]
