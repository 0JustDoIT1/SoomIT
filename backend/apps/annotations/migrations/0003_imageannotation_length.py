from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("annotations", "0002_initial")]

    operations = [
        migrations.AlterField(
            model_name="imageannotation",
            name="annotation_type",
            field=models.CharField(
                choices=[
                    ("LENGTH", "길이 측정"),
                    ("POINT", "점"),
                    ("BOUNDING_BOX", "박스"),
                    ("POLYGON", "다각형"),
                    ("FREEHAND", "자유곡선"),
                    ("TEXT", "텍스트"),
                ],
                max_length=15,
            ),
        )
    ]
