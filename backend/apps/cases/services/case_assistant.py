"""Safe, doctor-scoped context assembly for clinician assistants."""

from collections import defaultdict

from apps.ai_results.models import AiAnalysis
from apps.ai_results.serializers import DoctorAiAnalysisSerializer
from apps.clinical.models import ClinicalResult, Prescription, TreatmentDecision
from apps.clinical.serializers import (
    DoctorClinicalResultSerializer,
    DoctorPrescriptionSerializer,
    DoctorTreatmentDecisionSerializer,
)
from apps.cases.models import ExaminationOrder, LungCancerCase, WorkflowStage


WORKFLOW_STAGE_ORDER = (
    WorkflowStage.XRAY,
    WorkflowStage.CT,
    WorkflowStage.PET_CT_TNM,
    WorkflowStage.PATHOLOGY_GENE,
    WorkflowStage.PDL1,
    WorkflowStage.TREATMENT,
    WorkflowStage.PRESCRIPTION,
)
ANALYSIS_STAGE = {
    "XRAY_ANALYSIS": WorkflowStage.XRAY,
    "CT_ANALYSIS": WorkflowStage.CT,
    "PET_CT_TNM_ANALYSIS": WorkflowStage.PET_CT_TNM,
    "PATHOLOGY_GENE_ANALYSIS": WorkflowStage.PATHOLOGY_GENE,
    "PDL1_ANALYSIS": WorkflowStage.PDL1,
    "TREATMENT_RECOMMENDATION": WorkflowStage.TREATMENT,
}
ORDER_STAGE = {
    ExaminationOrder.OrderType.XRAY: WorkflowStage.XRAY,
    ExaminationOrder.OrderType.CT: WorkflowStage.CT,
    ExaminationOrder.OrderType.PET_CT_TNM: WorkflowStage.PET_CT_TNM,
    ExaminationOrder.OrderType.PATHOLOGY_GENE: WorkflowStage.PATHOLOGY_GENE,
    ExaminationOrder.OrderType.PDL1: WorkflowStage.PDL1,
}


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
    analyses = list(
        AiAnalysis.objects.filter(case=case)
        .select_related(
            "model_version",
            "examination_order",
            "source_image_asset",
            "ai_result",
            "ai_result__xray_detail",
            "ai_result__ct_detail",
            "ai_result__pathology_detail",
            "ai_result__pdl1_detail",
            "ai_result__tnm_detail",
            "ai_result__treatment_detail",
        )
        .prefetch_related(
            "ai_result__ct_detail__nodule_results",
            "ai_result__gene_ai_results",
        )
        .order_by("-created_at")
    )
    treatment = (
        TreatmentDecision.objects.filter(
            clinical_result__case=case,
            clinical_result__result_status=ClinicalResult.ResultStatus.CONFIRMED,
        )
        .select_related("clinical_result", "selected_regimen")
        .order_by("-clinical_result__confirmed_at", "-clinical_result__updated_at")
        .first()
    )
    prescriptions = list(
        Prescription.objects.filter(case=case)
        .select_related("regimen")
        .prefetch_related("items__drug", "safety_check_results")
        .order_by("-created_at")
    )
    orders = list(ExaminationOrder.objects.filter(case=case).order_by("-created_at"))
    sources = filter_assistant_context_sources(
        case.current_stage,
        results,
        analyses,
        treatment,
        prescriptions,
        orders,
    )
    profile = getattr(case.patient, "health_profile", None)
    return {
        "case": {"id": str(case.id), "case_code": case.case_code, "current_stage": case.current_stage, "status": case.case_status,
                 "patient": {"age": _age(case.patient.birth_date), "sex": case.patient.sex,
                             "smoking_status": getattr(profile, "smoking_status", None), "allergies": getattr(profile, "allergies", []), "comorbidities": getattr(profile, "comorbidities", [])}},
        "orders": [
            {
                "id": str(order.id),
                "type": order.order_type,
                "status": order.status,
                "priority": order.priority,
                "purpose": order.purpose,
                "clinical_note": order.clinical_note,
            }
            for order in sources["orders"]
        ],
        "clinical_results": {
            "confirmed": DoctorClinicalResultSerializer(
                sources["results"],
                many=True,
            ).data,
            "pending": [],
        },
        "ai_results": DoctorAiAnalysisSerializer(sources["analyses"], many=True).data,
        "treatment": DoctorTreatmentDecisionSerializer(sources["treatment"]).data if sources["treatment"] else None,
        "prescriptions": DoctorPrescriptionSerializer(sources["prescriptions"], many=True).data,
    }


def filter_assistant_context_sources(
    current_stage,
    results,
    analyses,
    treatment,
    prescriptions,
    orders,
):
    """Fail closed: expose only workflow-reachable, finalized clinical sources."""
    try:
        current_index = WORKFLOW_STAGE_ORDER.index(current_stage)
    except ValueError:
        return {"results": [], "analyses": [], "treatment": None, "prescriptions": [], "orders": []}

    def stage_visible(stage):
        try:
            return WORKFLOW_STAGE_ORDER.index(stage) <= current_index
        except ValueError:
            return False

    confirmed_results = [
        result for result in results
        if result.result_status == ClinicalResult.ResultStatus.CONFIRMED
        and stage_visible(result.workflow_stage)
    ]
    confirmed_stages = {result.workflow_stage for result in confirmed_results}
    visible_analyses = [
        analysis for analysis in analyses
        if ANALYSIS_STAGE.get(analysis.analysis_type) in confirmed_stages
    ]
    visible_treatment = treatment if (
        treatment is not None
        and WorkflowStage.TREATMENT in confirmed_stages
        and treatment.clinical_result.result_status == ClinicalResult.ResultStatus.CONFIRMED
    ) else None
    visible_prescriptions = [
        prescription for prescription in prescriptions
        if stage_visible(WorkflowStage.PRESCRIPTION)
        and prescription.prescription_status == Prescription.PrescriptionStatus.FINAL
    ]
    visible_orders = [
        order for order in orders
        if stage_visible(ORDER_STAGE.get(order.order_type))
    ]
    return {
        "results": confirmed_results,
        "analyses": visible_analyses,
        "treatment": visible_treatment,
        "prescriptions": visible_prescriptions,
        "orders": visible_orders,
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


def build_dashboard_context(user, hospital_id):
    """Build a minimal, read-only summary of the doctor's active Cases."""
    cases = list(
        LungCancerCase.objects.select_related("patient")
        .filter(
            primary_doctor=user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
            patient__hospital_id=hospital_id,
        )
        .order_by("-updated_at")
    )
    if not cases:
        return {"summary": {"active_case_count": 0}, "cases": []}

    case_ids = [case.id for case in cases]
    orders_by_case = defaultdict(list)
    for order in ExaminationOrder.objects.filter(case_id__in=case_ids).order_by("-updated_at"):
        orders_by_case[order.case_id].append(order)

    results_by_case = defaultdict(list)
    for result in ClinicalResult.objects.filter(case_id__in=case_ids).order_by("-updated_at"):
        results_by_case[result.case_id].append(result)

    treatment_case_ids = set(
        TreatmentDecision.objects.filter(
            clinical_result__case_id__in=case_ids,
            clinical_result__result_status=ClinicalResult.ResultStatus.CONFIRMED,
        ).values_list("clinical_result__case_id", flat=True)
    )

    prescriptions_by_case = defaultdict(list)
    for prescription in Prescription.objects.filter(case_id__in=case_ids).order_by("-updated_at"):
        prescriptions_by_case[prescription.case_id].append(prescription)

    summaries = [
        _dashboard_case_summary(
            case,
            orders_by_case[case.id],
            results_by_case[case.id],
            case.id in treatment_case_ids,
            prescriptions_by_case[case.id],
        )
        for case in cases
    ]
    return {
        "summary": {
            "active_case_count": len(summaries),
            "result_waiting_count": sum(item["attention_category"] == "RESULT_WAITING" for item in summaries),
            "review_needed_count": sum(item["attention_category"] == "REVIEW_NEEDED" for item in summaries),
        },
        "cases": summaries,
    }


def ask_dashboard_assistant(dashboard_context, message, history):
    from .doctor_genkit_client import DoctorGenkitError, DoctorGenkitNotConfigured, request_doctor_case_chat
    try:
        return request_doctor_case_chat(
            message=message,
            history=history,
            case_context=dashboard_context,
            assistant_scope="dashboard",
        )
    except DoctorGenkitNotConfigured as exc:
        raise CaseAssistantNotConfigured(str(exc)) from exc
    except DoctorGenkitError as exc:
        raise CaseAssistantServiceError(str(exc)) from exc


def dashboard_case_references(answer, dashboard_context):
    """Resolve only Case codes present in both the answer and authorized context."""
    normalized_answer = answer.casefold()
    return [
        {
            "case_code": item["case_code"],
            "current_stage": item["current_stage"],
            "status": item["status"],
            "short_status": item["current_task"],
        }
        for item in dashboard_context.get("cases", [])
        if item["case_code"].casefold() in normalized_answer
    ]


def _dashboard_case_summary(case, orders, results, has_treatment_decision, prescriptions):
    stage_results = {}
    for result in results:
        stage_results.setdefault(result.workflow_stage, result.result_status)

    latest_orders = {}
    for order in orders:
        latest_orders.setdefault(order.order_type, order.status)

    current_order_status = latest_orders.get(case.current_stage)
    current_result_status = stage_results.get(case.current_stage)
    prescription_status = prescriptions[0].prescription_status if prescriptions else None
    attention_category, current_task = _dashboard_current_task(
        case.current_stage,
        current_order_status,
        current_result_status,
        has_treatment_decision,
        prescription_status,
    )
    return {
        "case_code": case.case_code,
        "patient_display_name": case.patient.name,
        "current_stage": case.current_stage,
        "status": case.case_status,
        "order_statuses": latest_orders,
        "result_statuses": stage_results,
        "treatment_status": "CONFIRMED" if has_treatment_decision else "NOT_CONFIRMED",
        "prescription_status": prescription_status or "NONE",
        "attention_category": attention_category,
        "current_task": current_task,
        "next_step": "담당 의료진 결정에 따라 확정",
    }


def _dashboard_current_task(stage, order_status, result_status, has_treatment_decision, prescription_status):
    if order_status in {ExaminationOrder.Status.ORDERED, ExaminationOrder.Status.SCHEDULED}:
        return "RESULT_WAITING", f"{stage} 검사 결과 대기"
    if result_status == ClinicalResult.ResultStatus.DRAFT:
        return "REVIEW_NEEDED", f"{stage} 결과 확인 필요"
    if stage == WorkflowStage.TREATMENT and not has_treatment_decision:
        return "REVIEW_NEEDED", "치료 결정 확인 필요"
    if stage == WorkflowStage.PRESCRIPTION and prescription_status not in {
        Prescription.PrescriptionStatus.FINAL,
        Prescription.PrescriptionStatus.COMPLETED,
    }:
        return "REVIEW_NEEDED", "처방 확인 필요"
    return "IN_PROGRESS", f"{stage} 단계 진행 중"


def _age(birth_date):
    if birth_date is None:
        return None
    from datetime import date
    today = date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))
