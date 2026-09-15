from django.db import migrations


def forwards(apps, schema_editor):
    ClinicalResult = apps.get_model("clinical", "ClinicalResult")
    LungCancerCase = apps.get_model("cases", "LungCancerCase")
    adequacy_ids = list(
        ClinicalResult.objects.filter(specimen_adequacy_detail__isnull=False).values_list("id", flat=True)
    )
    ClinicalResult.objects.filter(id__in=adequacy_ids).delete()
    mapping = {"STAGING": "PET_CT_TNM", "PATHOLOGY": "PATHOLOGY_GENE", "GENE": "PATHOLOGY_GENE"}
    for result in ClinicalResult.objects.all().iterator():
        if hasattr(result, "pdl1_detail"):
            result.workflow_stage = "PDL1"
            LungCancerCase.objects.filter(id=result.case_id, current_stage="PATHOLOGY_GENE").update(current_stage="PDL1")
        else:
            result.workflow_stage = mapping.get(result.stage, result.stage)
        result.save(update_fields=["workflow_stage"])


class Migration(migrations.Migration):
    dependencies = [("clinical", "0010_add_workflow_stage")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
