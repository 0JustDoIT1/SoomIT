from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("cases", "0006_enforce_unified_workflow_fields")]
    operations = [
        migrations.RemoveField(model_name="examinationorder", name="exam_type"),
        migrations.RemoveField(model_name="examinationorder", name="pathology_test_type"),
        migrations.RemoveField(model_name="caseimageasset", name="uploaded_stage"),
    ]
