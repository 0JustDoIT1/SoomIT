import logging
from decimal import Decimal, InvalidOperation

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.ai_results.models import (
    AiAnalysis, AiResult, AnalysisType, GeneAiResult, PathologyAiResult, PDL1AiResult,
)
from apps.clinical.models import ClinicalResult
from apps.cases.models import WorkflowStage

from .services.pathology_inference import request_pathology_prediction
from .services.pdl1_inference import request_pdl1_prediction
from .services.pdl1_storage import download_pdl1_annotation_bytes
from .services.review_submission import (
    prepare_pathology_gene_clinical_draft,
    prepare_pdl1_clinical_draft,
)
from .services.wsi_orthanc_registration import (
    WsiOrthancRegistrationError,
    register_wsi_with_orthanc,
)


logger = logging.getLogger(__name__)


@shared_task
def register_wsi_with_orthanc_task(wsi_id):
    """Best-effort viewer preparation; never affects WSI upload or AI analysis."""
    try:
        return register_wsi_with_orthanc(str(wsi_id))
    except WsiOrthancRegistrationError:
        logger.exception("WSI Orthanc registration failed for wsi_id=%s", wsi_id)
        return "failed"
    except Exception:
        logger.exception("Unexpected WSI Orthanc registration failure for wsi_id=%s", wsi_id)
        return "failed"


def _mark_failed(analysis_id, error_message="PD-L1 analysis failed.", preserve_cancelled=False):
    with transaction.atomic():
        analysis = AiAnalysis.objects.select_for_update().filter(id=analysis_id).first()
        if (
            analysis is None
            or AiResult.objects.filter(ai_analysis=analysis).exists()
            or (preserve_cancelled and analysis.status == AiAnalysis.Status.CANCELLED)
        ):
            return
        analysis.status = AiAnalysis.Status.FAILED
        analysis.completed_at = timezone.now()
        analysis.error_message = error_message
        analysis.save(update_fields=["status", "completed_at", "error_message"])


def _begin_analysis(analysis_id):
    with transaction.atomic():
        analysis = (
            AiAnalysis.objects.select_for_update(of=("self",))
            .select_related("model_version", "source_image_asset")
            .filter(id=analysis_id)
            .first()
        )
        if analysis is None:
            return None, "analysis_not_found"
        if analysis.analysis_type != AnalysisType.PDL1_ANALYSIS:
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
    try:
        input_metadata, outcome = _begin_analysis(analysis_id)
        if outcome:
            return outcome

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
    except (InvalidOperation, KeyError, TypeError, ValueError) as exc:
        logger.exception("PD-L1 analysis failed for analysis_id=%s", analysis_id)
        _mark_failed(analysis_id, f"PD-L1 analysis failed: {type(exc).__name__}.")
        return "failed"
    except Exception as exc:
        logger.exception("PD-L1 analysis failed for analysis_id=%s", analysis_id)
        _mark_failed(analysis_id, f"PD-L1 analysis failed: {type(exc).__name__}.")
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
        clinical_result = (
            ClinicalResult.objects.select_for_update()
            .filter(
                case=analysis.case,
                examination_order=analysis.examination_order,
                workflow_stage=WorkflowStage.PDL1,
            )
            .first()
        )
        if clinical_result is None:
            clinical_result = prepare_pdl1_clinical_draft(
                case=analysis.case,
                order=analysis.examination_order,
                analysis=analysis,
                clinical_result=None,
            )
    return "succeeded"


@shared_task
def run_pathology_gene_analysis(analysis_id):
    """Run the shared WSI pathology/gene pipeline and persist one atomic result."""
    try:
        with transaction.atomic():
            analysis = (
                AiAnalysis.objects.select_for_update(of=("self",))
                .select_related("case__patient", "source_image_asset")
                .filter(id=analysis_id)
                .first()
            )
            if analysis is None:
                return "analysis_not_found"
            if analysis.analysis_type != AnalysisType.PATHOLOGY_GENE_ANALYSIS:
                return "unsupported_analysis_type"
            if analysis.status == AiAnalysis.Status.CANCELLED:
                return "cancelled"
            if AiResult.objects.filter(ai_analysis=analysis).exists():
                return "already_completed"
            if analysis.status == AiAnalysis.Status.RUNNING:
                return "already_running"
            if analysis.status != AiAnalysis.Status.PENDING:
                return "not_pending"
            analysis.status = AiAnalysis.Status.RUNNING
            analysis.started_at = timezone.now()
            analysis.completed_at = None
            analysis.error_message = None
            analysis.save(update_fields=["status", "started_at", "completed_at", "error_message"])

        analysis = AiAnalysis.objects.select_related("case__patient", "source_image_asset").get(id=analysis_id)
        if analysis.status == AiAnalysis.Status.CANCELLED:
            return "cancelled"
        asset = analysis.source_image_asset
        if (
            asset is None
            or asset.storage_type != asset.StorageType.GCS
            or not asset.storage_uri.startswith("gs://")
        ):
            raise ValueError("A READY GCS WSI is required.")
        prediction = request_pathology_prediction(
            case_id=analysis.case_id,
            patient_id=analysis.case.patient_id,
            wsi_id=asset.id,
            wsi_gcs_uri=asset.storage_uri,
        )
    except Exception as exc:
        logger.exception("Pathology and gene analysis failed for analysis_id=%s", analysis_id)
        _mark_failed(
            analysis_id,
            f"Pathology and gene analysis failed: {type(exc).__name__}.",
            preserve_cancelled=True,
        )
        return "failed"

    tissue = prediction["tissue"]
    gene_predictions = prediction["gene"].get("predictions") or {}
    with transaction.atomic():
        analysis = AiAnalysis.objects.select_for_update().get(id=analysis_id)
        if analysis.status == AiAnalysis.Status.CANCELLED:
            return "cancelled"
        if AiResult.objects.filter(ai_analysis=analysis).exists():
            return "already_completed"
        ai_result = AiResult.objects.create(
            ai_analysis=analysis,
            schema_version="pathology-gene-v1",
            result_payload=prediction,
            result_files=[],
        )
        label = tissue["predicted_label"]
        PathologyAiResult.objects.create(
            ai_result=ai_result,
            malignancy_assessment=(
                PathologyAiResult.MalignancyAssessment.BENIGN
                if label == "Benign"
                else PathologyAiResult.MalignancyAssessment.MALIGNANT
            ),
            malignancy_probability=1 - float(tissue["probabilities"]["Benign"]),
            predicted_histologic_type=None if label == "Benign" else label,
            predicted_subtype=label if label in {"LUAD", "LUSC"} else None,
            subtype_confidence=tissue["confidence_score"],
        )
        GeneAiResult.objects.bulk_create([
            GeneAiResult(
                ai_result=ai_result,
                gene_symbol=symbol,
                predicted_status=(
                    GeneAiResult.PredictedStatus.PREDICTED_POSITIVE
                    if detail["probability"] >= 0.5
                    else GeneAiResult.PredictedStatus.PREDICTED_NEGATIVE
                ),
                predicted_probability=detail["probability"],
            )
            for symbol, detail in gene_predictions.items()
        ])
        analysis.status = AiAnalysis.Status.SUCCEEDED
        analysis.completed_at = timezone.now()
        analysis.error_message = None
        analysis.save(update_fields=["status", "completed_at", "error_message"])
        clinical_result = (
            ClinicalResult.objects.select_for_update()
            .filter(
                case=analysis.case,
                workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            )
            .first()
        )
        if clinical_result is None:
            clinical_result = prepare_pathology_gene_clinical_draft(
                case=analysis.case,
                order=analysis.examination_order,
                analysis=analysis,
                clinical_result=None,
            )
    return "succeeded"
