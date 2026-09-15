from django.db import migrations


def forwards(apps, schema_editor):
    Case = apps.get_model("cases", "LungCancerCase")
    Decision = apps.get_model("cases", "ClinicianDecision")
    Order = apps.get_model("cases", "ExaminationOrder")
    Asset = apps.get_model("cases", "CaseImageAsset")

    for order in Order.objects.all().iterator():
        if order.exam_type == "WSI":
            order.order_type = "PDL1" if order.pathology_test_type == "PDL1" else "PATHOLOGY_GENE"
        elif order.exam_type == "CT" and order.image_assets.filter(uploaded_stage="STAGING").exists():
            order.order_type = "PET_CT_TNM"
        else:
            order.order_type = order.exam_type
        order.save(update_fields=["order_type"])

    stage_map = {"STAGING": "PET_CT_TNM", "PATHOLOGY": "PATHOLOGY_GENE", "GENE": "PATHOLOGY_GENE"}
    for case in Case.objects.all().iterator():
        if case.current_stage == "GENE" and Order.objects.filter(case_id=case.id, order_type="PDL1").exists():
            case.current_stage = "PDL1"
        else:
            case.current_stage = stage_map.get(case.current_stage, case.current_stage)
        case.save(update_fields=["current_stage"])

    for decision in Decision.objects.all().iterator():
        decision.source_stage = stage_map.get(decision.source_stage, decision.source_stage)
        decision.target_stage = stage_map.get(decision.target_stage, decision.target_stage)
        decision.save(update_fields=["source_stage", "target_stage"])

    for asset in Asset.objects.select_related("examination_order").all().iterator():
        if asset.examination_order_id and asset.examination_order.order_type == "PDL1":
            asset.workflow_stage = "PDL1"
        else:
            asset.workflow_stage = stage_map.get(asset.uploaded_stage, asset.uploaded_stage)
        asset.save(update_fields=["workflow_stage"])

    active = ["ORDERED", "SCHEDULED"]
    groups = Order.objects.filter(status__in=active).values_list("case_id", "order_type").distinct()
    for case_id, order_type in groups.iterator():
        ids = list(Order.objects.filter(case_id=case_id, order_type=order_type, status__in=active).order_by("-created_at", "-id").values_list("id", flat=True))
        if len(ids) > 1:
            Order.objects.filter(id__in=ids[1:]).update(status="CANCELLED")


class Migration(migrations.Migration):
    dependencies = [("cases", "0004_add_unified_workflow_fields")]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
