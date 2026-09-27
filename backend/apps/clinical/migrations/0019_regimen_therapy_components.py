from django.db import migrations, models


R2_COMPONENTS = ["TARGETED_THERAPY", "CHEMOTHERAPY"]


def backfill_therapy_components(apps, schema_editor):
    Regimen = apps.get_model("clinical", "Regimen")
    components_by_code = {
        "R1": ["TARGETED_THERAPY"],
        "R2": R2_COMPONENTS,
        "R3": ["IMMUNOTHERAPY"],
        "R4": ["IMMUNOTHERAPY", "CHEMOTHERAPY"],
        "R5": ["TARGETED_THERAPY"],
        "R6": ["TARGETED_THERAPY"],
    }
    for regimen_code, components in components_by_code.items():
        Regimen.objects.filter(regimen_code=regimen_code).update(
            therapy_components=components,
        )


class Migration(migrations.Migration):
    dependencies = [("clinical", "0018_remove_treatmentdecision_treatment_line")]

    operations = [
        migrations.AddField(
            model_name="regimen",
            name="therapy_components",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(backfill_therapy_components, migrations.RunPython.noop),
    ]
