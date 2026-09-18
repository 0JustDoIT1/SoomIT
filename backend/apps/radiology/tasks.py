import re
from decimal import Decimal, InvalidOperation

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.ai_results.models import (
    AiAnalysis,
    AiResult,
    AnalysisType,
    CtAiResult,
    NoduleAiResult,
    TnmAiResult,
    XrayAiResult,
)
from apps.cases.models import CaseImageAsset

from .services.ct_analysis_inference import request_ct_phase1_analysis
from .services.ct_analysis_storage import build_ct_analysis_output_uri
from .services.xray_inference import request_xray_prediction
from .services.xray_storage import download_xray_image_bytes
from .services.pet_dicom_export import cleanup_pet_dicom_gcs_prefix, export_pet_series_for_analysis
from .services.tnm_m_inference import request_tnm_m_analysis
from .services.tnm_t_inference import request_tnm_t_analysis
from .services.ct_phase2_inference import request_ct_phase2_analysis
from .services.tnm_n_inference import load_n_input, request_tnm_n_analysis
from apps.clinical.models import ClinicalResult


def _mark_failed(analysis_id, *, error_message="AI analysis failed."):
    """Record a safe terminal error without exposing external-service details."""
    with transaction.atomic():
        analysis = AiAnalysis.objects.select_for_update().filter(id=analysis_id).first()
        if analysis is None or AiResult.objects.filter(ai_analysis=analysis).exists():
            return
        analysis.status = AiAnalysis.Status.FAILED
        analysis.completed_at = timezone.now()
        analysis.error_message = error_message
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
        AiAnalysis.objects.select_related(
            "source_image_asset",
            "source_image_asset__examination_order",
            "case__patient",
        )
        .filter(id=analysis_id)
        .first()
    )
    if analysis is None:
        return "analysis_not_found"
    if analysis.analysis_type != AnalysisType.XRAY_ANALYSIS:
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
        _mark_failed(analysis.id, error_message="X-ray analysis failed.")
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
        _mark_failed(analysis.id, error_message="X-ray analysis failed.")
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


def _cornerstone_result_files(cornerstone_segmentation):
    if not isinstance(cornerstone_segmentation, dict):
        return []
    files = []
    for file_type, uri_field in (
        ("cornerstone_labelmap", "labelmap_uri"),
        ("cornerstone_labelmap_metadata", "metadata_uri"),
        ("cornerstone_geometry", "geometry_uri"),
    ):
        uri = cornerstone_segmentation.get(uri_field)
        if uri:
            files.append({"type": file_type, "uri": uri})
    return files


def _ct_nodule_no(nodule_id, fallback_index):
    match = re.search(r"(\d+)$", str(nodule_id or ""))
    return int(match.group(1)) if match else fallback_index


def _ct_nodule_malignancy_risk(nodule):
    prediction = (nodule.get("malignancy") or {}).get("prediction") or {}
    score = prediction.get("malignancy_score")
    if isinstance(score, bool) or not isinstance(score, (int, float)):
        return None
    try:
        risk = Decimal(str(score))
    except InvalidOperation:
        return None
    return risk if Decimal("0") <= risk <= Decimal("100") else None


@shared_task
def run_ct_analysis(analysis_id):
    """Run the CT workflow via ct-analysis-phase1-serve.

    Phase 1 performs VISTA3D nodule segmentation, per-nodule quantification,
    morphology/texture/malignancy classification, thoracic anatomy segmentation,
    and TNM T-model input preparation in a single call.
    """
    analysis = (
        AiAnalysis.objects.select_related("source_image_asset")
        .filter(id=analysis_id)
        .first()
    )
    if analysis is None:
        return "analysis_not_found"
    if analysis.analysis_type != AnalysisType.CT_ANALYSIS:
        return "unsupported_analysis_type"
    if AiResult.objects.filter(ai_analysis=analysis).exists():
        return "already_completed"

    asset = analysis.source_image_asset
    if (
        asset is None
        or asset.image_type != CaseImageAsset.ImageType.CT
        or asset.status != CaseImageAsset.Status.READY
        or not asset.orthanc_series_id
    ):
        _mark_failed(analysis.id, error_message="CT analysis failed.")
        return "invalid_source_image"

    analysis.status = AiAnalysis.Status.RUNNING
    analysis.started_at = timezone.now()
    analysis.error_message = None
    analysis.completed_at = None
    analysis.save(update_fields=["status", "started_at", "error_message", "completed_at"])

    try:
        order_id = analysis.examination_order_id or asset.examination_order_id
        if not order_id:
            raise ValueError("CT analysis has no examination order.")
        output_gcs_uri = build_ct_analysis_output_uri(
            hospital_id=analysis.case.patient.hospital_id,
            case_id=analysis.case_id,
            order_id=order_id,
            analysis_id=analysis.id,
        )
        payload = request_ct_phase1_analysis(
            orthanc_series_id=asset.orthanc_series_id,
            case_id=str(analysis.case_id),
            output_gcs_uri=output_gcs_uri,
            series_instance_uid=asset.series_instance_uid,
        )
        nodules = payload["result"]["nodules"]
        malignancy_risks = [
            risk for risk in (_ct_nodule_malignancy_risk(nodule) for nodule in nodules) if risk is not None
        ]
        overall_malignancy_risk = max(malignancy_risks) if malignancy_risks else None
    except Exception:
        _mark_failed(analysis.id, error_message="CT analysis failed.")
        return "failed"

    with transaction.atomic():
        locked_analysis = AiAnalysis.objects.select_for_update().get(id=analysis.id)
        if AiResult.objects.filter(ai_analysis=locked_analysis).exists():
            return "already_completed"

        ai_result = AiResult.objects.create(
            ai_analysis=locked_analysis,
            schema_version="ct-phase1-v1",
            result_payload=payload,
            result_files=[
                {"type": "artifact_root", "uri": payload["artifact_uri"]},
                {"type": "phase1_result", "uri": payload["phase1_result_uri"]},
                {"type": "t_input", "uri": payload["t_input_uri"]},
            ] + (
                [{"type": "target_nodule_mask", "uri": payload["target_mask_uri"]}]
                if isinstance(payload.get("target_mask_uri"), str) and payload["target_mask_uri"].startswith("gs://")
                else []
            ) + (
                [{"type": "visualization_manifest", "uri": payload["visualization_manifest_uri"]}]
                if payload.get("visualization_manifest_uri")
                else []
            ) + _cornerstone_result_files(payload.get("cornerstone_segmentation")),
        )
        ct_result = CtAiResult.objects.create(
            ai_result=ai_result,
            overall_malignancy_risk=overall_malignancy_risk,
        )
        NoduleAiResult.objects.bulk_create(
            [
                NoduleAiResult(
                    ct_ai_result=ct_result,
                    nodule_no=_ct_nodule_no(nodule.get("nodule_id"), index + 1),
                    detection_confidence=None,
                    malignancy_risk=_ct_nodule_malignancy_risk(nodule),
                    finding_payload=nodule,
                )
                for index, nodule in enumerate(nodules)
            ],
        )
        locked_analysis.status = AiAnalysis.Status.SUCCEEDED
        locked_analysis.completed_at = timezone.now()
        locked_analysis.error_message = None
        locked_analysis.save(update_fields=["status", "completed_at", "error_message"])
    return "succeeded"


def _single_confirmed_ct(analysis):
    confirmed = list(
        ClinicalResult.objects.select_related("reviewed_ai_result__ai_analysis").filter(
            case_id=analysis.case_id,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            workflow_stage="CT",
            reviewed_ai_result__ai_analysis__analysis_type=AnalysisType.CT_ANALYSIS,
            reviewed_ai_result__ai_analysis__status=AiAnalysis.Status.SUCCEEDED,
        )
    )
    if len(confirmed) != 1:
        raise ValueError("Exactly one confirmed CT analysis is required.")
    result = confirmed[0].reviewed_ai_result
    payload = result.result_payload or {}
    t_input_uri, artifact_uri = payload.get("t_input_uri"), payload.get("artifact_uri")
    if (
        result.ai_analysis.case_id != analysis.case_id
        or not isinstance(t_input_uri, str) or not t_input_uri.startswith("gs://") or t_input_uri.endswith("/")
        or not isinstance(artifact_uri, str) or not artifact_uri.startswith("gs://")
    ):
        raise ValueError("Confirmed CT analysis has invalid Phase1 output URIs.")
    return t_input_uri, artifact_uri


def _patient_phase2_inputs(analysis):
    patient = analysis.case.patient
    if patient.birth_date is None:
        raise ValueError("Patient birth date is required for CT Phase2.")
    today = timezone.localdate()
    age = today.year - patient.birth_date.year - ((today.month, today.day) < (patient.birth_date.month, patient.birth_date.day))
    gender = {patient.Sex.MALE: "male", patient.Sex.FEMALE: "female"}.get(patient.sex)
    if age < 0 or gender is None:
        raise ValueError("Patient age or sex is not valid for CT Phase2.")
    return float(age), gender


def _confirmed_histology(analysis):
    confirmed = list(
        ClinicalResult.objects.select_related("pathology_detail").filter(
            case_id=analysis.case_id,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            workflow_stage="PATHOLOGY_GENE",
            pathology_detail__isnull=False,
        )
    )
    if not confirmed:
        return "unknown"
    if len(confirmed) != 1:
        raise ValueError("Exactly one confirmed pathology result is required.")
    value = confirmed[0].pathology_detail.histologic_type
    aliases = {
        "adenocarcinoma": "adenocarcinoma", "luad": "adenocarcinoma",
        "squamous cell carcinoma": "squamous cell carcinoma", "squamous": "squamous cell carcinoma",
        "lusc": "squamous cell carcinoma", "large cell": "large cell",
        "nos": "nos", "other-not-specified": "nos", "unknown": "unknown",
    }
    canonical = aliases.get(value.strip().casefold()) if isinstance(value, str) else None
    if canonical is None:
        raise ValueError("Confirmed pathology histologic type is not supported by the N model.")
    return canonical


def _tnm_result_files(t_payload, phase2_payload, m_payload):
    files = []
    for file_type, uri in (
        ("t_tumor_mask", t_payload.get("tumor_mask_uri")),
        ("phase2_artifact", phase2_payload.get("artifact_uri")),
    ):
        if isinstance(uri, str) and uri.startswith("gs://"):
            files.append({"type": file_type, "uri": uri})
    files.extend(
        {"type": key, "uri": value}
        for key, value in (m_payload.get("artifacts") or {}).items()
        if isinstance(value, str) and value.startswith("gs://")
    )
    return files


@shared_task(name="apps.radiology.tasks.run_tnm_m_analysis")
def run_tnm_analysis(analysis_id):
    analysis = (
        AiAnalysis.objects.select_related("case__patient", "examination_order", "source_image_asset")
        .filter(id=analysis_id, analysis_type=AnalysisType.PET_CT_TNM_ANALYSIS)
        .first()
    )
    if analysis is None:
        return "invalid_analysis"
    if analysis.status not in [AiAnalysis.Status.PENDING, AiAnalysis.Status.RUNNING] or AiResult.objects.filter(ai_analysis=analysis).exists():
        return "already_completed"
    analysis.status = AiAnalysis.Status.RUNNING
    analysis.started_at = timezone.now()
    analysis.completed_at = None
    analysis.error_message = None
    analysis.save(update_fields=["status", "started_at", "completed_at", "error_message"])

    prefix = None
    try:
        t_input_uri, phase1_artifact_uri = _single_confirmed_ct(analysis)
        age, gender = _patient_phase2_inputs(analysis)
        histology = _confirmed_histology(analysis)
        t_payload = request_tnm_t_analysis(case_id=analysis.case_id, t_input_uri=t_input_uri)
        phase2_payload = request_ct_phase2_analysis(
            case_id=str(analysis.case_id), patient_id=str(analysis.case.patient_id), age=age,
            gender=gender, histology=histology, phase1_artifact_uri=phase1_artifact_uri,
            t_tumor_mask_uri=t_payload["tumor_mask_uri"],
        )
        n_input = load_n_input(phase2_payload["n_input_uri"])
        n_payload = request_tnm_n_analysis(patient_id=analysis.case.patient_id, features=n_input["features"])
        prefix = export_pet_series_for_analysis(analysis)
        m_payload = request_tnm_m_analysis(
            case_id=analysis.case_id, ct_gcs_uri=t_input_uri, pet_dicom_gcs_prefix=prefix,
            pet_series_instance_uid=analysis.source_image_asset.series_instance_uid,
        )
        probability = (m_payload.get("model_support") or {}).get("m_positive_probability")
        confidence = Decimal(str(probability)) if probability is not None else None
        if confidence is not None and not Decimal("0") <= confidence <= Decimal("1"):
            raise ValueError("M probability is outside the valid range.")
        with transaction.atomic():
            locked = AiAnalysis.objects.select_for_update().get(id=analysis.id)
            if AiResult.objects.filter(ai_analysis=locked).exists():
                return "already_completed"
            result = AiResult.objects.create(
                ai_analysis=locked, schema_version="tnm-v1",
                result_payload={"t": t_payload, "phase2": phase2_payload, "n": n_payload, "m": m_payload},
                result_files=_tnm_result_files(t_payload, phase2_payload, m_payload),
            )
            TnmAiResult.objects.create(ai_result=result, predicted_m=m_payload.get("m_candidate"), confidence=confidence)
            locked.status = AiAnalysis.Status.SUCCEEDED
            locked.completed_at = timezone.now()
            locked.error_message = None
            locked.save(update_fields=["status", "completed_at", "error_message"])
        return "succeeded"
    except Exception:
        _mark_failed(analysis.id, error_message="PET-CT TNM analysis failed.")
        return "failed"
    finally:
        if prefix:
            try:
                cleanup_pet_dicom_gcs_prefix(prefix)
            except Exception:
                pass


def _legacy_run_tnm_m_analysis(analysis_id):
    analysis = (
        AiAnalysis.objects.select_related("case__patient", "examination_order", "source_image_asset")
        .filter(id=analysis_id, analysis_type=AnalysisType.PET_CT_TNM_ANALYSIS)
        .first()
    )
    if analysis is None:
        return "invalid_analysis"
    if analysis.status not in [AiAnalysis.Status.PENDING, AiAnalysis.Status.RUNNING]:
        return "already_completed"
    analysis.status = AiAnalysis.Status.RUNNING
    analysis.started_at = timezone.now()
    analysis.error_message = None
    analysis.save(update_fields=["status", "started_at", "error_message"])

    prefix = None
    try:
        confirmed = list(
            ClinicalResult.objects.select_related("reviewed_ai_result__ai_analysis")
            .filter(
                case_id=analysis.case_id,
                result_status=ClinicalResult.ResultStatus.CONFIRMED,
                workflow_stage="CT",
                reviewed_ai_result__ai_analysis__analysis_type=AnalysisType.CT_ANALYSIS,
                reviewed_ai_result__ai_analysis__status=AiAnalysis.Status.SUCCEEDED,
            )
        )
        if len(confirmed) != 1:
            raise ValueError("정확히 하나의 확정 CT 분석이 필요합니다.")
        ct_result = confirmed[0].reviewed_ai_result
        ct_payload = ct_result.result_payload or {}
        ct_gcs_uri = ct_payload.get("t_input_uri")
        if not isinstance(ct_gcs_uri, str) or not ct_gcs_uri.startswith("gs://") or ct_gcs_uri.endswith("/"):
            raise ValueError("확정 CT 분석의 t_input_uri가 유효하지 않습니다.")

        prefix = export_pet_series_for_analysis(analysis)
        payload = request_tnm_m_analysis(
            case_id=analysis.case_id,
            ct_gcs_uri=ct_gcs_uri,
            pet_dicom_gcs_prefix=prefix,
            pet_series_instance_uid=analysis.source_image_asset.series_instance_uid,
        )
        probability = (payload.get("model_support") or {}).get("m_positive_probability")
        confidence = Decimal(str(probability)) if probability is not None else None
        if confidence is not None and not Decimal("0") <= confidence <= Decimal("1"):
            raise ValueError("M probability is outside the valid range.")
        with transaction.atomic():
            locked = AiAnalysis.objects.select_for_update().get(id=analysis.id)
            result = AiResult.objects.create(
                ai_analysis=locked,
                schema_version="tnm-m-v1",
                result_payload=payload,
                result_files=[
                    {"type": key, "uri": value}
                    for key, value in (payload.get("artifacts") or {}).items()
                    if isinstance(value, str) and value.startswith("gs://")
                ],
            )
            TnmAiResult.objects.create(
                ai_result=result,
                predicted_m=payload.get("m_candidate"),
                confidence=confidence,
            )
            locked.status = AiAnalysis.Status.SUCCEEDED
            locked.completed_at = timezone.now()
            locked.error_message = None
            locked.save(update_fields=["status", "completed_at", "error_message"])
        return "succeeded"
    except Exception:
        _mark_failed(analysis.id, error_message="TNM M analysis failed.")
        return "failed"
    finally:
        if prefix:
            try:
                cleanup_pet_dicom_gcs_prefix(prefix)
            except Exception:
                pass
