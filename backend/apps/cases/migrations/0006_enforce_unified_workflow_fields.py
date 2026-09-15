from django.db import migrations, models
from django.db.models import Q


WORKFLOW_CHOICES = [
    ("XRAY", "X-ray"), ("CT", "CT"), ("PET_CT_TNM", "PET_CT_TNM"),
    ("PATHOLOGY_GENE", "PATHOLOGY_GENE"), ("PDL1", "PDL1"),
    ("TREATMENT", "TREATMENT"), ("PRESCRIPTION", "PRESCRIPTION"),
]
ORDER_CHOICES = WORKFLOW_CHOICES[:5]


class Migration(migrations.Migration):
    dependencies = [("cases", "0005_migrate_unified_workflow_data")]
    operations = [
        migrations.AlterField(model_name="examinationorder", name="order_type", field=models.CharField(choices=ORDER_CHOICES, max_length=20)),
        migrations.AlterField(model_name="caseimageasset", name="workflow_stage", field=models.CharField(choices=WORKFLOW_CHOICES, max_length=20)),
        migrations.AlterField(model_name="lungcancercase", name="current_stage", field=models.CharField(choices=WORKFLOW_CHOICES, max_length=20)),
        migrations.AlterField(model_name="cliniciandecision", name="source_stage", field=models.CharField(choices=WORKFLOW_CHOICES, max_length=20)),
        migrations.AlterField(model_name="cliniciandecision", name="target_stage", field=models.CharField(blank=True, choices=WORKFLOW_CHOICES, max_length=20, null=True)),
        migrations.AddConstraint(
            model_name="examinationorder",
            constraint=models.UniqueConstraint(fields=("case", "order_type"), condition=Q(status__in=["ORDERED", "SCHEDULED"]), name="uq_active_order_case_type"),
        ),
    ]
