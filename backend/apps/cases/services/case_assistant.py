"""Safe, doctor-scoped context assembly for the future Case Assistant."""

from apps.ai_results.models import AiAnalysis
from apps.ai_results.serializers import DoctorAiAnalysisSerializer
from apps.clinical.models import ClinicalResult, Prescription, TreatmentDecision
from apps.clinical.serializers import (
    DoctorClinicalResultSerializer,
    DoctorPrescriptionSerializer,
    DoctorTreatmentDecisionSerializer,
)
from apps.cases.models import ExaminationOrder, LungCancerCase


class CaseAssistantNotConfigured(RuntimeError):
    pass
class CaseAssistantServiceError(RuntimeError):
    pass


def get_assistant_case(case_id, user, hospital_id):
    """Use the same assigned ACTIVE Case boundary as doctor Case APIs."""
    return (
        LungCancerCase.objects.select_related("patient", "patient__health_profile")
        .filter(
            id=case_id,
            primary_doctor=user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
            patient__hospital_id=hospital_id,
        )
        .first()
    )


def build_case_context(case_id, user, hospital_id):
    case = get_assistant_case(case_id, user, hospital_id)
    if case is None:
        return None

    results = list(
        ClinicalResult.objects.filter(case=case)
        .select_related("xray_detail", "ct_detail", "pathology_detail", "tnm_detail", "gene_detail", "pdl1_detail")
        .prefetch_related("gene_detail__gene_findings")
        .order_by("-confirmed_at", "-updated_at")
    )
    analyses = AiAnalysis.objects.filter(case=case).select_related(
        "model_version", "examination_order", "source_image_asset", "ai_result",
        "ai_result__xray_detail", "ai_result__ct_detail", "ai_result__pathology_detail",
        "ai_result__pdl1_detail", "ai_result__tnm_detail", "ai_result__treatment_detail",
    ).prefetch_related("ai_result__ct_detail__nodule_results", "ai_result__gene_ai_results").order_by("-created_at")
    treatment = TreatmentDecision.objects.filter(clinical_result__case=case).select_related("clinical_result", "selected_regimen").first()
    prescriptions = Prescription.objects.filter(case=case).select_related("regimen").prefetch_related(
        "items__drug", "safety_check_results"
    ).order_by("-created_at")
    profile = getattr(case.patient, "health_profile", None)
    return {
        "case": {"id": str(case.id), "case_code": case.case_code, "current_stage": case.current_stage, "status": case.case_status,
                 "patient": {"age": _age(case.patient.birth_date), "sex": case.patient.sex,
                             "smoking_status": getattr(profile, "smoking_status", None), "allergies": getattr(profile, "allergies", []), "comorbidities": getattr(profile, "comorbidities", [])}},
        "orders": [{"id": str(order.id), "type": order.order_type, "status": order.status, "priority": order.priority, "purpose": order.purpose, "clinical_note": order.clinical_note} for order in ExaminationOrder.objects.filter(case=case).order_by("-created_at")],
        "clinical_results": {"confirmed": DoctorClinicalResultSerializer([r for r in results if r.result_status == ClinicalResult.ResultStatus.CONFIRMED], many=True).data,
                             "pending": DoctorClinicalResultSerializer([r for r in results if r.result_status != ClinicalResult.ResultStatus.CONFIRMED], many=True).data},
        "ai_results": DoctorAiAnalysisSerializer(analyses, many=True).data,
        "treatment": DoctorTreatmentDecisionSerializer(treatment).data if treatment else None,
        "prescriptions": DoctorPrescriptionSerializer(prescriptions, many=True).data,
    }


def context_used(context):
    return [key for key in ("case", "orders", "clinical_results", "ai_results", "treatment", "prescriptions") if context.get(key)]


def ask_case_assistant(case_context, message, history):
    from .doctor_genkit_client import DoctorGenkitError, DoctorGenkitNotConfigured, request_doctor_case_chat
    try:
        return request_doctor_case_chat(message=message, history=history, case_context=case_context)
    except DoctorGenkitNotConfigured as exc:
        raise CaseAssistantNotConfigured(str(exc)) from exc
    except DoctorGenkitError as exc:
        raise CaseAssistantServiceError(str(exc)) from exc


def _age(birth_date):
    if birth_date is None:
        return None
    from datetime import date
    today = date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
