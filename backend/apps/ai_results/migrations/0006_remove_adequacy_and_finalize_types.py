from django.db import migrations, models


CHOICES = [
    ("XRAY_ANALYSIS", "XRAY_ANALYSIS"), ("CT_ANALYSIS", "CT_ANALYSIS"),
    ("PET_CT_TNM_ANALYSIS", "PET_CT_TNM_ANALYSIS"), ("PATHOLOGY_GENE_ANALYSIS", "PATHOLOGY_GENE_ANALYSIS"),
    ("PDL1_ANALYSIS", "PDL1_ANALYSIS"), ("TREATMENT_RECOMMENDATION", "TREATMENT_RECOMMENDATION"),
]


class Migration(migrations.Migration):
    dependencies = [("ai_results", "0005_migrate_analysis_types")]
    operations = [
        migrations.AlterField(model_name="aianalysis", name="analysis_type", field=models.CharField(choices=CHOICES, max_length=30)),
        migrations.AlterField(model_name="modelversion", name="analysis_type", field=models.CharField(choices=CHOICES, max_length=30)),
        migrations.DeleteModel(name="SpecimenAdequacyAiResult"),
    ]
