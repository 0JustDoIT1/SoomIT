from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("clinical", "0020_treatmentdecision_input_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="pdl1result",
            name="indeterminate_reason",
            field=models.TextField(blank=True, null=True),
        ),
    ]
