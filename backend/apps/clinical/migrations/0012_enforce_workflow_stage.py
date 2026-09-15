from django.db import migrations, models


CHOICES = [
    ("XRAY", "X-ray"), ("CT", "CT"), ("PET_CT_TNM", "PET_CT_TNM"),
    ("PATHOLOGY_GENE", "PATHOLOGY_GENE"), ("PDL1", "PDL1"), ("TREATMENT", "TREATMENT"),
]


class Migration(migrations.Migration):
    dependencies = [("clinical", "0011_migrate_workflow_stage_data")]
    operations = [
        migrations.AlterField(model_name="clinicalresult", name="workflow_stage", field=models.CharField(choices=CHOICES, max_length=20)),
    ]
