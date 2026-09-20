from django.db import transaction

from apps.clinical.models import ClinicalResult, PDL1Result
from apps.cases.models import LungCancerCase

from ..models import PathologyWorkItem, WholeSlideImage


ACTIVE_REVIEW_STATUSES = {
    PathologyWorkItem.Status.PENDING,
    PathologyWorkItem.Status.IN_PROGRESS,
}


class ReviewSubmissionError(Exception):
    pass


def prepare_pdl1_clinical_draft(*, case, order, analysis, clinical_result):
    """Create a PD-L1 draft from the selected successful AI result, or refresh a stale draft."""
    ai_result = analysis.ai_result
    try:
        pdl1_ai_result = ai_result.pdl1_detail
    except AttributeError as exc:
        raise ReviewSubmissionError("The PD-L1 AI result detail is missing.") from exc

    payload = ai_result.result_payload
    if not isinstance(payload, dict):
        raise ReviewSubmissionError("The PD-L1 AI result payload is invalid.")

    predicted_range = payload.get("predicted_tps_range")
    confidence = payload.get("confidence")
    probabilities = payload.get("probabilities")
    predicted_class = payload.get("predicted_class")
    if (
        predicted_range != pdl1_ai_result.predicted_tps_range
        or confidence is None
        or not isinstance(probabilities, dict)
        or not {"class_0", "class_1", "class_2"}.issubset(probabilities)
        or predicted_class != pdl1_ai_result.predicted_class
    ):
        raise ReviewSubmissionError("The PD-L1 AI result payload is incomplete or inconsistent.")

    asset = analysis.source_image_asset
    try:
        wsi = asset.whole_slide_image
    except (AttributeError, WholeSlideImage.DoesNotExist) as exc:
        raise ReviewSubmissionError("The PD-L1 analysis source WSI is missing.") from exc
    if (
        wsi.specimen.case_id != case.id
        or wsi.specimen.examination_order_id != order.id
        or wsi.stain != WholeSlideImage.Stain.PDL1
    ):
        raise ReviewSubmissionError("The PD-L1 analysis source WSI does not match the order.")

    range_label = payload.get("predicted_tps_range_label") or pdl1_ai_result.get_predicted_tps_range_display()
    model_version = analysis.model_version
    probabilities_text = ", ".join(
        f"{key}={probabilities[key]}"
        for key in ("class_0", "class_1", "class_2")
        if key in probabilities
    )
    model_text = f"{model_version.model_name} ({model_version.version})"
    revision = payload.get("model_revision")
    if revision:
        model_text = f"{model_text}, revision {revision}"
    note = (
        f"Generated from PD-L1 AI result: confidence={confidence}; "
        f"class probabilities: {probabilities_text}; model: {model_text}."
    )

    if clinical_result is None:
        clinical_result = ClinicalResult.objects.create(
            case=case,
            examination_order=order,
            workflow_stage=order.order_type,
            source_image_asset=asset,
            reviewed_ai_result=ai_result,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        stale = True
    else:
        if clinical_result.result_status != ClinicalResult.ResultStatus.DRAFT:
            raise ReviewSubmissionError("Only a PD-L1 draft can be updated for submission.")
        stale = (
            clinical_result.reviewed_ai_result_id != ai_result.id
            or clinical_result.source_image_asset_id != asset.id
        )
        if stale:
            clinical_result.source_image_asset = asset
            clinical_result.reviewed_ai_result = ai_result
            clinical_result.save(
                update_fields=["source_image_asset", "reviewed_ai_result", "updated_at"]
            )

    detail = getattr(clinical_result, "pdl1_detail", None)
    if detail is None:
        detail = PDL1Result(clinical_result=clinical_result)
        stale = True
    elif detail.source_wsi_id != wsi.id:
        stale = True
    if stale:
        # AI output is an interval, not an exact TPS percentage. Keep the numeric
        # field empty instead of manufacturing a point estimate from the range.
        detail.tps_percent = None
        detail.interpretation = f"AI predicted TPS range: {range_label}"
        detail.note = note
        detail.source_wsi = wsi
        detail.save()
    return clinical_result


@transaction.atomic
def submit_for_review(source_work_item):
    """Create one active diagnostic review task for a case, idempotently."""
    LungCancerCase.objects.select_for_update().get(pk=source_work_item.case_id)

    order_ids = {source_work_item.examination_order_id}
    if source_work_item.specimen_id:
        order_ids.add(source_work_item.specimen.examination_order_id)
    if source_work_item.wsi_id:
        order_ids.add(source_work_item.wsi.specimen.examination_order_id)
    order_ids.discard(None)
    if len(order_ids) != 1:
        raise ReviewSubmissionError("현재 병리 오더를 확인할 수 없어 제출할 수 없습니다.")
    examination_order_id = order_ids.pop()

    existing = (
        PathologyWorkItem.objects.filter(
            case_id=source_work_item.case_id,
            examination_order_id=examination_order_id,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            status__in=ACTIVE_REVIEW_STATUSES,
        )
        .order_by("-created_at")
        .first()
    )
    if existing:
        return existing, False

    review_work_item = PathologyWorkItem.objects.create(
        case_id=source_work_item.case_id,
        examination_order_id=examination_order_id,
        specimen_id=source_work_item.specimen_id,
        wsi_id=source_work_item.wsi_id,
        task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
        status=PathologyWorkItem.Status.PENDING,
        priority=source_work_item.priority,
        assigned_to=None,
    )
    return review_work_item, True
