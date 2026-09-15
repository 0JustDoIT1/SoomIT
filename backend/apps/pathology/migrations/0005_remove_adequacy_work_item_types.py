from django.db import migrations, models


def forwards(apps, schema_editor):
    WorkItem = apps.get_model("pathology", "PathologyWorkItem")
    WorkItem.objects.filter(task_type__in=["ADEQUACY_ANALYSIS", "ADEQUACY_REVIEW"]).update(task_type="PATHOLOGY_ANALYSIS")


class Migration(migrations.Migration):
    dependencies = [
        ("pathology", "0004_pathologyworkitem_examination_order"),
        ("cases", "0007_remove_legacy_workflow_fields"),
        ("ai_results", "0006_remove_adequacy_and_finalize_types"),
    ]
    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="pathologyworkitem", name="task_type",
            field=models.CharField(choices=[("WSI_UPLOAD", "WSI_UPLOAD"), ("QUALITY_CHECK", "QUALITY_CHECK"), ("PATHOLOGY_ANALYSIS", "PATHOLOGY_ANALYSIS"), ("PD_L1_REVIEW", "PD_L1_REVIEW"), ("DIAGNOSTIC_REVIEW", "DIAGNOSTIC_REVIEW"), ("REPORT_REVIEW", "REPORT_REVIEW")], max_length=30),
        ),
    ]
