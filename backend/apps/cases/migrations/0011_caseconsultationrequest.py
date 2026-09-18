import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("cases", "0010_caseimageasset_orthanc_study_id")]

    operations = [migrations.CreateModel(name="CaseConsultationRequest", fields=[
        ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
        ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
        ("target_department_code", models.CharField(max_length=50)), ("question", models.TextField()),
        ("priority", models.CharField(choices=[("NORMAL", "일반"), ("URGENT", "긴급")], default="NORMAL", max_length=10)),
        ("status", models.CharField(choices=[("REQUESTED", "요청됨"), ("ACKNOWLEDGED", "확인됨"), ("RESPONDED", "회신됨"), ("CANCELLED", "취소됨")], default="REQUESTED", max_length=15)),
        ("response_note", models.TextField(blank=True, null=True)), ("responded_at", models.DateTimeField(blank=True, null=True)),
        ("case", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="consultation_requests", to="cases.lungcancercase")),
        ("recipient_user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="received_case_consultations", to="accounts.user")),
        ("requested_by_user", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="requested_case_consultations", to="accounts.user")),
    ], options={"db_table": "case_consultation_requests"})]
