import django.db.models.deletion
import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0013_allow_repeated_pet_asset_identifiers"),
    ]

    operations = [
        migrations.CreateModel(
            name="PhysicianTreatmentOpinion",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("physician_opinion", models.TextField(blank=True, default="")),
                ("case", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="physician_treatment_opinion", to="cases.lungcancercase")),
            ],
            options={
                "db_table": "physician_treatment_opinions",
            },
        ),
    ]
