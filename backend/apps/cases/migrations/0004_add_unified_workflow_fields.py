from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("cases", "0003_examinationorder_pathology_test_type")]

    operations = [
        migrations.AddField(
            model_name="examinationorder",
            name="order_type",
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name="caseimageasset",
            name="workflow_stage",
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AlterField(
            model_name="caseimageasset",
            name="image_type",
            field=models.CharField(
                choices=[("XRAY", "X-ray"), ("CT", "CT"), ("PET", "PET"), ("MRI", "MRI"), ("WSI", "WSI")],
                max_length=10,
            ),
        ),
    ]
