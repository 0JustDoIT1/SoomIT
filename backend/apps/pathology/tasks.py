from decimal import Decimal, InvalidOperation

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.ai_results.models import AiAnalysis, AiResult, AnalysisType, PDL1AiResult

from .services.pdl1_inference import request_pdl1_prediction
from .services.pdl1_storage import download_pdl1_annotation_bytes


def _mark_failed(analysis_id):
    with transaction.atomic():
        analysis = AiAnalysis.objects.select_for_update().filter(id=analysis_id).first()
        if analysis is None or AiResult.objects.filter(ai_analysis=analysis).exists():
            return
        analysis.status = AiAnalysis.Status.FAILED
        analysis.completed_at = timezone.now()
        analysis.error_message = "PD-L1 analysis failed."
        analysis.save(update_fields=["status", "completed_at", "error_message"])


def _begin_analysis(analysis_id):
    with transaction.atomic():
        analysis = (
            AiAnalysis.objects.select_for_update()
            .select_related("model_version", "source_image_asset")
            .filter(id=analysis_id)
            .first()
        )
        if analysis is None:
            return None, "analysis_not_found"
        if analysis.analysis_type != AnalysisType.PDL1_CLASSIFICATION:
            return None, "unsupported_analysis_type"
        if AiResult.objects.filter(ai_analysis=analysis).exists():
            return None, "already_completed"
        if analysis.status == AiAnalysis.Status.RUNNING:
            return None, "already_running"
        if analysis.status != AiAnalysis.Status.PENDING:
            return None, "not_pending"
        analysis.status = AiAnalysis.Status.RUNNING
        analysis.started_at = timezone.now()
        analysis.completed_at = None
        analysis.error_message = None
        analysis.save(update_fields=["status", "started_at", "completed_at", "error_message"])
        return analysis.input_metadata or {}, None


def _result_payload(prediction):
    return {
        "model_revision": prediction.get("model_revision"),
        "model_sha256": prediction.get("model_sha256"),
        "main_index": prediction.get("main_index"),
        "pdl1_image_id": prediction.get("pdl1_image_id"),
        "patch_count": prediction.get("patch_count"),
        "predicted_class": prediction["predicted_class"],
        "predicted_tps_range": prediction["predicted_tps_range"],
        "predicted_tps_range_label": prediction.get("predicted_tps_range_label"),
        "confidence": prediction["confidence"],
        "probabilities": prediction["probabilities"],
        "preprocessing": prediction.get("preprocessing"),
    }


@shared_task
def run_pdl1_analysis(analysis_id):
    """Run a catalog-selected PD-L1 sample outside the request transaction."""
    input_metadata, outcome = _begin_analysis(analysis_id)
    if outcome:
        return outcome

    try:
        analysis = AiAnalysis.objects.select_related("case__patient", "source_image_asset").get(id=analysis_id)
        asset = analysis.source_image_asset
        annotation = (asset.metadata or {}).get("pdl1_annotation", {}) if asset else {}
        annotation_uri = annotation.get("storage_uri")
        roi_layer = input_metadata.get("roi_layer")
        if asset is None or not asset.storage_uri or not annotation_uri or roi_layer not in {"Tumor", "Tumor-JS"}:
            raise ValueError("PD-L1 input is incomplete.")
        annotation_content = download_pdl1_annotation_bytes(annotation_uri)
        if not annotation_content:
            raise ValueError("PD-L1 annotation is empty.")
        prediction = request_pdl1_prediction(
            wsi_gcs_uri=asset.storage_uri,
            annotation_content=annotation_content,
            roi_layer=roi_layer,
            main_index=str(analysis.case.patient_id),
            pdl1_image_id=str(asset.id),
        )
        confidence = Decimal(str(prediction["confidence"]))
        if not Decimal("0") <= confidence <= Decimal("1"):
            raise ValueError("PD-L1 confidence is out of range.")
    except (InvalidOperation, KeyError, TypeError, ValueError):
        _mark_failed(analysis_id)
        return "failed"
    except Exception:
        _mark_failed(analysis_id)
        return "failed"

    with transaction.atomic():
        analysis = AiAnalysis.objects.select_for_update().get(id=analysis_id)
        if AiResult.objects.filter(ai_analysis=analysis).exists():
            return "already_completed"
        ai_result = AiResult.objects.create(
            ai_analysis=analysis,
            schema_version="pdl1-v1",
            result_payload=_result_payload(prediction),
            result_files=[],
        )
        PDL1AiResult.objects.create(
            ai_result=ai_result,
            predicted_class=prediction["predicted_class"],
            predicted_tps_range=prediction["predicted_tps_range"],
            confidence=confidence,
            probabilities=prediction["probabilities"],
        )
        analysis.status = AiAnalysis.Status.SUCCEEDED
        analysis.completed_at = timezone.now()
        analysis.error_message = None
        analysis.save(update_fields=["status", "completed_at", "error_message"])
    return "succeeded"
