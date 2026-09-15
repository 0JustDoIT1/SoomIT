from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("cases", "0007_remove_legacy_workflow_fields"), ("clinical", "0009_prescriptionitem_renal_value_type")]
    operations = [
        migrations.AddField(
            model_name="clinicalresult",
            name="workflow_stage",
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
    ]
