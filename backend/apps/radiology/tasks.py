from decimal import Decimal, InvalidOperation

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.ai_results.models import AiAnalysis, AiResult, AnalysisType, XrayAiResult
from apps.cases.models import CaseImageAsset

from .services.xray_inference import request_xray_prediction
from .services.xray_storage import download_xray_image_bytes


def _mark_failed(analysis_id):
    """Record a safe terminal error without exposing external-service details."""
    with transaction.atomic():
        analysis = AiAnalysis.objects.select_for_update().filter(id=analysis_id).first()
        if analysis is None or AiResult.objects.filter(ai_analysis=analysis).exists():
            return
        analysis.status = AiAnalysis.Status.FAILED
        analysis.completed_at = timezone.now()
        analysis.error_message = "X-ray analysis failed."
        analysis.save(update_fields=["status", "completed_at", "error_message"])


def _xray_values(prediction):
    classification = prediction["classification"]
    assessment = classification["assessment"]
    if assessment not in XrayAiResult.Assessment.values:
        raise ValueError("Unsupported X-ray assessment.")
    try:
        suspicion_score = Decimal(str(classification["suspicion_score"]))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError("Invalid X-ray suspicion score.") from exc
    if not Decimal("0") <= suspicion_score <= Decimal("1"):
        raise ValueError("X-ray suspicion score is out of range.")
    return assessment, suspicion_score


@shared_task
def run_xray_analysis(analysis_id):
    """Run the X-ray workflow using the existing GCS and inference clients."""
    analysis = (
        AiAnalysis.objects.select_related("source_image_asset")
        .filter(id=analysis_id)
        .first()
    )
    if analysis is None:
        return "analysis_not_found"
    if analysis.analysis_type != AnalysisType.XRAY_SCREENING:
        return "unsupported_analysis_type"
    if AiResult.objects.filter(ai_analysis=analysis).exists():
        return "already_completed"

    asset = analysis.source_image_asset
    if (
        asset is None
        or asset.image_type != CaseImageAsset.ImageType.XRAY
        or asset.status != CaseImageAsset.Status.READY
        or not asset.storage_uri
    ):
        _mark_failed(analysis.id)
        return "invalid_source_image"

    analysis.status = AiAnalysis.Status.RUNNING
    analysis.started_at = timezone.now()
    analysis.error_message = None
    analysis.completed_at = None
    analysis.save(update_fields=["status", "started_at", "error_message", "completed_at"])

    try:
        png_bytes = download_xray_image_bytes(asset.storage_uri)
        prediction = request_xray_prediction(png_bytes)
        assessment, suspicion_score = _xray_values(prediction)
    except Exception:
        _mark_failed(analysis.id)
        return "failed"

    with transaction.atomic():
        locked_analysis = AiAnalysis.objects.select_for_update().get(id=analysis.id)
        if AiResult.objects.filter(ai_analysis=locked_analysis).exists():
            return "already_completed"

        ai_result = AiResult.objects.create(
            ai_analysis=locked_analysis,
            schema_version="xray-v1",
            result_payload=prediction,
            result_files=[],
        )
        XrayAiResult.objects.create(
            ai_result=ai_result,
            assessment=assessment,
            suspicion_score=suspicion_score,
        )
        locked_analysis.status = AiAnalysis.Status.SUCCEEDED
        locked_analysis.completed_at = timezone.now()
        locked_analysis.error_message = None
        locked_analysis.save(update_fields=["status", "completed_at", "error_message"])
    return "succeeded"
