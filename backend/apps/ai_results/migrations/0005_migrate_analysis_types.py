from django.db import migrations


def forwards(apps, schema_editor):
    AiAnalysis = apps.get_model("ai_results", "AiAnalysis")
    ModelVersion = apps.get_model("ai_results", "ModelVersion")
    AiAnalysis.objects.filter(analysis_type="SPECIMEN_ADEQUACY").delete()
    ModelVersion.objects.filter(analysis_type="SPECIMEN_ADEQUACY").delete()
    mapping = {
        "XRAY_SCREENING": "XRAY_ANALYSIS", "CT_NODULE": "CT_ANALYSIS",
        "TNM_STAGING": "PET_CT_TNM_ANALYSIS", "PATHOLOGY_DIAGNOSIS": "PATHOLOGY_GENE_ANALYSIS",
        "GENE_PREDICTION": "PATHOLOGY_GENE_ANALYSIS", "PDL1_CLASSIFICATION": "PDL1_ANALYSIS",
    }
    for old, new in mapping.items():
        for analysis in AiAnalysis.objects.filter(analysis_type=old).iterator():
            metadata = dict(analysis.input_metadata or {})
            metadata.setdefault("legacy_analysis_type", old)
            analysis.analysis_type = new
            analysis.input_metadata = metadata
            analysis.save(update_fields=["analysis_type", "input_metadata"])
        ModelVersion.objects.filter(analysis_type=old).update(analysis_type=new)


class Migration(migrations.Migration):
    dependencies = [("cases", "0007_remove_legacy_workflow_fields"), ("ai_results", "0004_aianalysis_examination_order")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
