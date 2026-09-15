from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("clinical", "0012_enforce_workflow_stage")]
    operations = [
        migrations.RemoveField(model_name="clinicalresult", name="stage"),
        migrations.DeleteModel(name="SpecimenAdequacyResult"),
    ]
