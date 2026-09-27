from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("clinical", "0019_regimen_therapy_components")]

    operations = [
        migrations.AddField(
            model_name="treatmentdecision",
            name="input_snapshot",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
