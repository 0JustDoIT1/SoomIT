import json

from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.permissions import IsActiveStaff, IsDoctor, IsPulmonologyStaff
from apps.cases.models import ClinicianDecision, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import CurrentMedication, LabResult, MedicationSchedule, Patient, PatientAccount, PatientHealthProfile
from apps.patients.patient_authentication import PatientJWTAuthentication

from .dur_client import DurClient, OPERATIONS
from .gene_alterations import CANONICAL_ALTERATIONS
from apps.radiology.services.tnm_stage_inference import TnmStageInferenceError, request_tnm_stage
from .models import ClinicalResult, CtResult, Nodule, NoduleObservation, PDL1Result, Prescription, PrescriptionItem, RegimenDrug, SafetyCheckResult, TnmResult, TreatmentDecision, TreatmentRule
from .safety import (
    SafetyFreshness,
    build_safety_input_snapshot as _safety_input_snapshot,
    evaluate_prescription_safety_freshness,
    explicit_item_seq as _explicit_item_seq,
)
from .serializers import (
    DoctorClinicalResultSerializer,
    DoctorPrescriptionSerializer,
    PrescriptionItemUpdateSerializer,
    DoctorTreatmentDecisionSerializer,
    DoctorTnmDraftSerializer,
    DoctorCtResultWriteSerializer,
    PatientClinicalResultSerializer,
    TreatmentRuleCandidateSerializer,
)
from .medication_schedule_serializers import DoctorMedicationScheduleSerializer, PrescriptionFinalizeSerializer

from decimal import Decimal, ROUND_HALF_UP
from apps.knowledge.models import KnowledgeDocument
from apps.knowledge.services.embedding_client import EmbeddingServiceError
from apps.knowledge.services.medgemma_client import MedgemmaServiceError
from apps.knowledge.services.rag import answer_with_rag


UNRESOLVED_SAFETY_SOURCE_CODES = {
    "DUR_API_ERROR",
    "DUR_MAPPING_UNRESOLVED",
    "ALLERGY_UNCONFIRMED",
    "LAB_MISSING",
}

PULMONOLOGY_WRITE_PERMISSIONS = [
    IsAuthenticated,
    IsActiveStaff,
    IsDoctor,
    IsPulmonologyStaff,
]


class PulmonologyWritePermissionMixin:
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        permission_classes = self.permission_classes
        if self.request.method not in {"GET", "HEAD", "OPTIONS"}:
            permission_classes = PULMONOLOGY_WRITE_PERMISSIONS
        return [permission() for permission in permission_classes]


class DoctorTnmDraftAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    def _case_and_order(self, request, case_id):
        case = LungCancerCase.objects.select_for_update(of=("self",)).filter(
            id=case_id, primary_doctor=request.user, case_status="ACTIVE",
        ).first()
        if case is None:
            return None, None
        order = ExaminationOrder.objects.select_for_update(of=("self",)).filter(
            case=case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
        ).order_by("-created_at").first()
        return case, order

    @transaction.atomic
    def post(self, request, case_id):
        case, order = self._case_and_order(request, case_id)
        if case is None or order is None:
            return Response({"detail": "PET-CT TNM order was not found."}, status=404)
        serializer = DoctorTnmDraftSerializer(
            data=request.data, context={"case": case, "order": order},
        )
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        ai_result_id = values["reviewed_ai_result_id"]
        draft = (
            ClinicalResult.objects.select_for_update(of=("self",))
            .filter(
                case=case, examination_order=order, workflow_stage="PET_CT_TNM",
            )
            .first()
        )
        if draft is not None and draft.result_status == ClinicalResult.ResultStatus.CONFIRMED:
            return Response({"detail": "A confirmed TNM result cannot be modified."}, status=409)
        created = draft is None
        if created:
            from apps.ai_results.models import AiResult

            draft = ClinicalResult.objects.create(
                case=case, examination_order=order, workflow_stage="PET_CT_TNM",
                reviewed_ai_result=AiResult.objects.get(id=ai_result_id),
                result_status=ClinicalResult.ResultStatus.DRAFT,
            )
            TnmResult.objects.create(
                clinical_result=draft, t_category=values["t_category"],
                n_category=values["n_category"], m_category=values["m_category"],
                stage_group="", evidence=values.get("evidence"), note=values.get("note"),
            )
        else:
            draft.reviewed_ai_result_id = ai_result_id
            draft.save(update_fields=["reviewed_ai_result", "updated_at"])
            detail = draft.tnm_detail
            detail.t_category = values["t_category"]
            detail.n_category = values["n_category"]
            detail.m_category = values["m_category"]
            detail.evidence = values.get("evidence")
            detail.note = values.get("note")
            detail.save(update_fields=["t_category", "n_category", "m_category", "evidence", "note"])
        return Response(DoctorTnmDraftSerializer(draft).data, status=201 if created else 200)

    def patch(self, request, case_id):
        return self.post(request, case_id)

def _ai_ct_nodule_observations(ai_result):
    """Build safe initial clinical nodule values from the reviewed CT AI result."""
    try:
        ai_nodules = ai_result.ct_detail.nodule_results.all()
    except AttributeError:
        return []

    def decimal_value(value, decimal_places):
        if value is None or isinstance(value, bool):
            return None
        try:
            parsed = Decimal(str(value))
        except (ArithmeticError, TypeError, ValueError):
            return None
        if not parsed.is_finite():
            return None
        quantum = Decimal(1).scaleb(-decimal_places)
        return parsed.quantize(quantum, rounding=ROUND_HALF_UP)

    observations = []
    for item in ai_nodules:
        payload = item.finding_payload if isinstance(item.finding_payload, dict) else {}
        quantification = payload.get("quantification") if isinstance(payload.get("quantification"), dict) else {}
        diameter = quantification.get("maximum_3d_diameter_mm")
        if diameter is None:
            diameter = quantification.get("equivalent_diameter_mm")
        observations.append({
            "nodule_no": item.nodule_no,
            "max_diameter_mm": decimal_value(diameter, 2),
            "volume_mm3": decimal_value(quantification.get("volume_mm3"), 2),
            "surface_area_mm2": decimal_value(quantification.get("surface_area_mm2"), 2),
            "sphericity": decimal_value(quantification.get("sphericity"), 4),
            "malignancy_risk": decimal_value(item.malignancy_risk, 2),
        })
    return observations


def _sync_ct_nodule_observations(*, case, ct_result, values, ai_result):
    observations = values.get("nodule_observations")
    if observations is None:
        observations = _ai_ct_nodule_observations(ai_result)

    for observation in observations:
        nodule, _ = Nodule.objects.get_or_create(
            case=case,
            nodule_no=observation["nodule_no"],
        )
        defaults = {
            key: observation.get(key)
            for key in (
                "lobe", "location_description", "max_diameter_mm", "volume_mm3",
                "surface_area_mm2", "sphericity", "spiculation", "lobulation", "malignancy_risk",
            )
            if key in observation
        }
        NoduleObservation.objects.update_or_create(
            nodule=nodule,
            ct_result=ct_result,
            defaults=defaults,
        )


class DoctorCtResultAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    def _context(self, request, case_id):
        return LungCancerCase.objects.select_for_update(of=("self",)).filter(
            id=case_id, primary_doctor=request.user, case_status="ACTIVE",
        ).first()

    @transaction.atomic
    def post(self, request, case_id):
        case = self._context(request, case_id)
        if case is None:
            return Response({"detail": "CT order was not found."}, status=404)
        serializer = DoctorCtResultWriteSerializer(data=request.data, context={"case": case})
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        order = ExaminationOrder.objects.select_for_update(of=("self",)).filter(
            id=serializer.context["validated_order_id"],
            case=case,
            order_type=ExaminationOrder.OrderType.CT,
        ).first()
        if order is None:
            return Response({"detail": "CT order was not found."}, status=404)
        result = ClinicalResult.objects.select_for_update(of=("self",)).filter(
            case=case, examination_order=order, workflow_stage="CT",
        ).first()
        if result is not None and result.result_status == ClinicalResult.ResultStatus.CONFIRMED:
            return Response({"detail": "A confirmed CT result cannot be modified."}, status=409)
        from apps.ai_results.models import AiResult
        reviewed_ai_result = AiResult.objects.get(id=values["reviewed_ai_result_id"])
        if result is None:
            result = ClinicalResult.objects.create(case=case, examination_order=order, workflow_stage="CT", reviewed_ai_result=reviewed_ai_result, result_status=ClinicalResult.ResultStatus.DRAFT)
            detail = CtResult.objects.create(clinical_result=result, overall_assessment=values["overall_assessment"], finding_summary=values.get("finding_summary"))
            created = True
        else:
            result.reviewed_ai_result = reviewed_ai_result
            result.save(update_fields=["reviewed_ai_result", "updated_at"])
            detail = result.ct_detail
            for key in ("overall_assessment", "finding_summary"):
                setattr(detail, key, values.get(key))
            detail.save(update_fields=["overall_assessment", "finding_summary"])
            created = False
        _sync_ct_nodule_observations(
            case=case,
            ct_result=detail,
            values=values,
            ai_result=reviewed_ai_result,
        )
        return Response({"id": str(result.id), "workflow_stage": result.workflow_stage, "result_status": result.result_status, "reviewed_ai_result_id": str(result.reviewed_ai_result_id)}, status=201 if created else 200)

    patch = post

class DoctorCtResultConfirmAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    @transaction.atomic
    def post(self, request, case_id, result_id):
        case = LungCancerCase.objects.select_for_update(of=("self",)).filter(
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
        ).first()
        result = ClinicalResult.objects.select_for_update(of=("self",)).filter(
            id=result_id,
            case=case,
            workflow_stage=WorkflowStage.CT,
        ).first() if case is not None else None
        if result is None:
            return Response({"detail": "CT result was not found."}, status=404)
        already_confirmed = result.result_status == ClinicalResult.ResultStatus.CONFIRMED
        if not hasattr(result, "ct_detail"):
            return Response({"detail": "CT result detail is missing."}, status=400)
        advance_to_next_stage = request.data.get("advance_to_next_stage") is True
        if already_confirmed and not advance_to_next_stage:
            return Response({"detail": "CT result is already confirmed."}, status=409)
        if already_confirmed and advance_to_next_stage and case.current_stage == WorkflowStage.PET_CT_TNM:
            return Response({
                "id": str(result.id),
                "workflow_stage": result.workflow_stage,
                "result_status": result.result_status,
                "reviewed_ai_result_id": str(result.reviewed_ai_result_id),
                "confirmed_by_user_id": str(result.confirmed_by_user_id) if result.confirmed_by_user_id else None,
                "confirmed_at": result.confirmed_at,
                "current_stage": case.current_stage,
                "case_status": case.case_status,
            })
        if advance_to_next_stage and case.current_stage != WorkflowStage.CT:
            return Response({"detail": "CT is not the current workflow stage."}, status=400)

        active_pet_order_exists = False
        if advance_to_next_stage:
            active_pet_order_exists = ExaminationOrder.objects.select_for_update().filter(
                case=case,
                order_type=ExaminationOrder.OrderType.PET_CT_TNM,
                status__in=[
                    ExaminationOrder.Status.ORDERED,
                    ExaminationOrder.Status.SCHEDULED,
                ],
            ).exists()

        if not already_confirmed:
            result.result_status = ClinicalResult.ResultStatus.CONFIRMED
            result.confirmed_by_user = request.user
            result.confirmed_at = timezone.now()
            result.save(update_fields=["result_status", "confirmed_by_user", "confirmed_at", "updated_at"])
        if advance_to_next_stage:
            if not active_pet_order_exists:
                from apps.cases.services.examination_orders import ExaminationOrderCreationError, create_examination_order
                try:
                    create_examination_order(
                        case=case,
                        requesting_doctor=request.user,
                        order_type=ExaminationOrder.OrderType.PET_CT_TNM,
                        priority=ExaminationOrder.Priority.NORMAL,
                        purpose="CT result confirmed; proceed with PET-CT/TNM",
                        clinical_note="",
                    )
                except ExaminationOrderCreationError as exc:
                    transaction.set_rollback(True)
                    return Response({"detail": str(exc)}, status=400)
            case.current_stage = WorkflowStage.PET_CT_TNM
            case.save(update_fields=["current_stage", "updated_at"])
            ClinicianDecision.objects.create(
                case=case,
                source_stage=WorkflowStage.CT,
                source_clinical_result=result,
                decision_type=ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE,
                target_stage=WorkflowStage.PET_CT_TNM,
                reason="CT result confirmed and PET-CT/TNM ordered",
                decided_by_user=request.user,
                decided_at=timezone.now(),
            )
        return Response({
            "id": str(result.id),
            "workflow_stage": result.workflow_stage,
            "result_status": result.result_status,
            "reviewed_ai_result_id": str(result.reviewed_ai_result_id),
            "confirmed_by_user_id": str(result.confirmed_by_user_id) if result.confirmed_by_user_id else None,
            "confirmed_at": result.confirmed_at,
            "current_stage": case.current_stage,
            "case_status": case.case_status,
        })


class DoctorTnmConfirmAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    @transaction.atomic
    def post(self, request, case_id, result_id):
        case = LungCancerCase.objects.select_for_update(of=("self",)).filter(
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
        ).first()
        diagnosis = (
            ClinicalResult.objects.select_for_update(of=("self",))
            .filter(
                id=result_id, case=case, workflow_stage=WorkflowStage.PET_CT_TNM,
            )
            .first()
        ) if case is not None else None
        if diagnosis is None:
            return Response({"detail": "TNM draft was not found."}, status=404)
        if diagnosis.result_status == ClinicalResult.ResultStatus.CONFIRMED:
            return Response({"detail": "TNM result is already confirmed."}, status=409)
        detail = diagnosis.tnm_detail
        if not detail.t_category or not detail.n_category or not detail.m_category:
            return Response({"detail": "T, N, and M values are required before confirmation."}, status=400)
        diagnosis.result_status = ClinicalResult.ResultStatus.CONFIRMED
        diagnosis.confirmed_by_user = request.user
        diagnosis.confirmed_at = timezone.now()
        diagnosis.save(update_fields=["result_status", "confirmed_by_user", "confirmed_at", "updated_at"])
        return Response(DoctorTnmDraftSerializer(diagnosis).data)


class DoctorTnmStageAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    @transaction.atomic
    def post(self, request, case_id, result_id):
        case = LungCancerCase.objects.select_for_update(of=("self",)).filter(
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
        ).first()
        diagnosis = (
            ClinicalResult.objects.select_for_update(of=("self",))
            .filter(id=result_id, case=case, workflow_stage=WorkflowStage.PET_CT_TNM,
                    result_status=ClinicalResult.ResultStatus.CONFIRMED,
                    )
            .first()
        ) if case is not None else None
        if diagnosis is None:
            return Response({"detail": "A confirmed TNM result was not found."}, status=404)
        detail = diagnosis.tnm_detail
        try:
            stage = request_tnm_stage(
                t_category=detail.t_category,
                n_category=detail.n_category,
                m_category=detail.m_category,
                patient_id=diagnosis.case.patient_id,
            )
        except TnmStageInferenceError as exc:
            return Response({"detail": str(exc)}, status=502)
        evidence = detail.evidence if isinstance(detail.evidence, dict) else {}
        evidence = {**evidence, "stage": stage}
        detail.evidence = evidence
        detail.save(update_fields=["evidence"])
        return Response(DoctorTnmDraftSerializer(diagnosis).data)


class DoctorTnmStageConfirmAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    @transaction.atomic
    def post(self, request, case_id, result_id):
        case = LungCancerCase.objects.select_for_update(of=("self",)).filter(
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
        ).first()
        diagnosis = (
            ClinicalResult.objects.select_for_update(of=("self",))
            .filter(id=result_id, case=case, workflow_stage=WorkflowStage.PET_CT_TNM,
                    result_status=ClinicalResult.ResultStatus.CONFIRMED,
                    )
            .first()
        ) if case is not None else None
        if diagnosis is None:
            return Response({"detail": "A confirmed TNM result was not found."}, status=404)
        detail = diagnosis.tnm_detail
        stage = detail.evidence.get("stage") if isinstance(detail.evidence, dict) else None
        candidate = stage.get("stage_group_candidate") if isinstance(stage, dict) else None
        if not isinstance(stage, dict) or stage.get("stage_group_status") != "candidate_ready" or not candidate:
            return Response({"detail": "A ready Stage candidate is required."}, status=400)
        if detail.stage_group:
            return Response({"detail": "Stage Group is already confirmed."}, status=409)
        if request.data.get("advance_to_next_stage") is True and (
            diagnosis.case.current_stage != WorkflowStage.PET_CT_TNM
            or diagnosis.case.case_status != LungCancerCase.CaseStatus.ACTIVE
        ):
            return Response({"detail": "PET-CT/TNM is not the active workflow stage."}, status=400)
        detail.stage_group = candidate
        detail.save(update_fields=["stage_group"])
        if request.data.get("advance_to_next_stage") is True:
            if diagnosis.case.current_stage != WorkflowStage.PET_CT_TNM:
                return Response({"detail": "PET-CT/TNM is not the current workflow stage."}, status=400)
            from apps.cases.services.examination_orders import ExaminationOrderCreationError, create_examination_order
            try:
                create_examination_order(
                    case=diagnosis.case,
                    requesting_doctor=request.user,
                    order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
                    priority=ExaminationOrder.Priority.NORMAL,
                    purpose="TNM Stage Group confirmed; proceed with pathology/gene testing",
                    clinical_note="",
                )
            except ExaminationOrderCreationError as exc:
                transaction.set_rollback(True)
                return Response({"detail": str(exc)}, status=400)
            diagnosis.case.current_stage = WorkflowStage.PATHOLOGY_GENE
            diagnosis.case.save(update_fields=["current_stage", "updated_at"])
            ClinicianDecision.objects.create(
                case=diagnosis.case,
                source_stage=WorkflowStage.PET_CT_TNM,
                source_clinical_result=diagnosis,
                decision_type=ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE,
                target_stage=WorkflowStage.PATHOLOGY_GENE,
                reason="TNM Stage Group confirmed and pathology/gene testing ordered",
                decided_by_user=request.user,
                decided_at=timezone.now(),
            )
        return Response(DoctorTnmDraftSerializer(diagnosis).data)


def _valid_mfds_item_seq(drug):
    """Return the explicit MFDS product identifier, never an inferred code."""
    value = getattr(drug, "mfds_item_seq", None)
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if value.isdigit() else None


def _allergy_names(patient_profile):
    """Return exact normalized strings and whether the recorded state is reliable."""
    if patient_profile is None:
        return set(), False

    allergy_status = getattr(patient_profile, "allergy_status", None)
    allergies = getattr(patient_profile, "allergies", None)
    if not isinstance(allergies, list):
        return set(), False

    if allergy_status == PatientHealthProfile.AllergyStatus.NONE:
        return (set(), True) if not allergies else (set(), False)
    if allergy_status != PatientHealthProfile.AllergyStatus.PRESENT:
        return set(), False

    names = set()
    for allergy in allergies:
        if not isinstance(allergy, str) or not allergy.strip():
            return names, False
        names.add(allergy.strip().casefold())
    return (names, True) if names else (set(), False)


def _dur_message(operation, row):
    parts = [OPERATIONS[operation]]
    content = row.get("prohibition_content")
    remark = row.get("remark")
    if content:
        parts.append(str(content))
    if remark:
        parts.append(str(remark))
    return " · ".join(parts)


def _dur_pair_matches(row, first_item_seq, second_item_seq):
    item_seq = row.get("item_seq")
    mixture_item_seq = row.get("mixture_item_seq")
    return (
        item_seq == first_item_seq and mixture_item_seq == second_item_seq
    ) or (
        item_seq == second_item_seq and mixture_item_seq == first_item_seq
    )


def _dose_decimal(value, field, *, positive=False):
    try:
        number = Decimal(str(value))
    except (ValueError, ArithmeticError):
        raise ValidationError({field: "A finite numeric value is required."})
    if not number.is_finite() or number < 0 or (positive and number == 0):
        raise ValidationError({field: "A valid positive value is required."})
    return number


def calculate_bsa(height_cm, weight_kg):
    height = _dose_decimal(height_cm, "height_cm", positive=True)
    weight = _dose_decimal(weight_kg, "weight_kg", positive=True)
    return (height * weight / Decimal(3600)).sqrt()


def calculate_dose(dose_basis, standard_dose, height_cm=None, weight_kg=None, egfr=None):
    """egfr is indexed mL/min/1.73m2; renal_value is de-indexed mL/min.

    Use raw Decimal BSA for arithmetic; round only at the defined boundaries.
    final_dose remains a separate clinician input. No renal estimator is used.
    """
    if dose_basis not in {"FIXED", "MG_PER_M2", "AUC"}:
        raise ValidationError({"dose_basis": "Unsupported dose basis."})
    dose = _dose_decimal(standard_dose, "target_auc" if dose_basis == "AUC" else "standard_dose",
                         positive=dose_basis == "AUC")
    values = dict(patient_bsa=None, target_auc=None, renal_value=None, renal_value_type=None,
                  calculated_dose=None, final_dose=None)
    if dose_basis == "FIXED":
        values["calculated_dose"] = dose
    elif dose_basis == "MG_PER_M2":
        bsa = calculate_bsa(height_cm, weight_kg)
        values["patient_bsa"] = bsa.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        values["calculated_dose"] = (dose * bsa).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    else:
        bsa = calculate_bsa(height_cm, weight_kg)
        raw_adjusted = _dose_decimal(egfr, "egfr") * bsa / Decimal("1.73")
        renal = raw_adjusted.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        values.update(target_auc=dose, renal_value=renal,
                      renal_value_type="BSA_ADJUSTED_EGFR",
                      patient_bsa=bsa.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
                      calculated_dose=(dose * (renal + Decimal(25))).quantize(
                          Decimal("1"), rounding=ROUND_HALF_UP))
    return values



@extend_schema(tags=["환자앱-검사결과"])
class PatientClinicalResultListAPIView(ListAPIView):
    serializer_class = PatientClinicalResultSerializer
    authentication_classes = [PatientJWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        patient_account = self.request.user.patient_account
        if (
            patient_account.link_status != PatientAccount.LinkStatus.LINKED
            or patient_account.patient_id is None
        ):
            raise PermissionDenied("A linked patient account is required.")
        patient = patient_account.patient

        return (
            ClinicalResult.objects
            .filter(
                case__patient=patient,
                result_status="CONFIRMED",
            )
            .select_related(
                "case",
                "xray_detail",
                "ct_detail",
                "pathology_detail",
                "tnm_detail",
                "gene_detail",
                "pdl1_detail",
            )
            .prefetch_related("ct_detail__nodule_observations__nodule")
            .order_by("-confirmed_at", "-updated_at")
        )
        

@extend_schema(tags=["호흡기내과-검사결과"])
class DoctorClinicalResultListAPIView(ListAPIView):
    serializer_class = DoctorClinicalResultSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        case_id = self.kwargs["case_id"]

        case = (
            LungCancerCase.objects
            .filter(
                id=case_id,
                primary_doctor=self.request.user,
            )
            .first()
        )

        if case is None:
            return ClinicalResult.objects.none()

        return (
            ClinicalResult.objects
            .filter(case=case)
            .filter(
                Q(result_status=ClinicalResult.ResultStatus.CONFIRMED)
                | Q(
                    result_status=ClinicalResult.ResultStatus.DRAFT,
                    workflow_stage__in=[WorkflowStage.PATHOLOGY_GENE, WorkflowStage.PDL1],
                    examination_order__pathology_work_items__task_type="DIAGNOSTIC_REVIEW",
                    examination_order__pathology_work_items__status__in=["PENDING", "IN_PROGRESS"],
                )
            )
            .select_related(
                "case",
                "xray_detail",
                "ct_detail",
                "pathology_detail",
                "tnm_detail",
                "gene_detail",
                "pdl1_detail",
                "reviewed_ai_result",
            )
            .prefetch_related(
                "gene_detail__gene_findings",
                "reviewed_ai_result__gene_ai_results",
                "ct_detail__nodule_observations__nodule",
            )
            .order_by("-confirmed_at", "-updated_at")
            .distinct()
        )

@extend_schema(tags=["호흡기내과-치료결정"])
class DoctorTreatmentDecisionAPIView(PulmonologyWritePermissionMixin, APIView):

    def get_case(self, case_id, user, *, lock=False):
        cases = LungCancerCase.objects.all()
        if lock:
            cases = cases.select_for_update(of=("self",))
        return cases.filter(
            id=case_id,
            primary_doctor=user,
            case_status="ACTIVE",
        ).first()

    # 치료 결정 조회
    @extend_schema(
        responses={200: DoctorTreatmentDecisionSerializer},
    )
    def get(self, request, case_id):
        case = self.get_case(case_id, request.user)

        if case is None:
            return Response(
                {"detail": "담당 Case를 찾을 수 없습니다."},
                status=404,
            )

        treatment_decision = (
            TreatmentDecision.objects
            .select_related(
                "clinical_result",
                "clinical_result__case",
                "selected_regimen",
            )
            .filter(
                clinical_result__case=case,
            )
            .first()
        )

        if treatment_decision is None:
            return Response(
                {"detail": "치료 결정이 없습니다."},
                status=404,
            )

        serializer = DoctorTreatmentDecisionSerializer(treatment_decision)

        return Response(
            serializer.data,
            status=200,
        )

    # 치료 결정 DRAFT 저장
    @extend_schema(
        request=DoctorTreatmentDecisionSerializer,
        responses={
            200: DoctorTreatmentDecisionSerializer,
            201: DoctorTreatmentDecisionSerializer,
        },
    )
    def post(self, request, case_id):
        with transaction.atomic():
            return self._save_treatment_decision(request, case_id)

    def _save_treatment_decision(self, request, case_id):
        case = self.get_case(case_id, request.user, lock=True)

        if case is None:
            return Response(
                {"detail": "담당 Case를 찾을 수 없습니다."},
                status=404,
            )

        if case.current_stage != WorkflowStage.TREATMENT:
            return Response(
                {"detail": "Treatment decisions can only be saved during the TREATMENT stage."},
                status=400,
            )

        clinical_result = ClinicalResult.objects.filter(case=case, workflow_stage="TREATMENT").first()

        if clinical_result and clinical_result.result_status == "CONFIRMED":
            return Response({"detail": "이미 확정된 치료 결정은 수정할 수 없습니다."}, status=400)

        treatment_decision = (
            TreatmentDecision.objects.filter(clinical_result=clinical_result).first()
            if clinical_result else None
        )

        serializer = DoctorTreatmentDecisionSerializer(
            treatment_decision,
            data=request.data,
            partial=treatment_decision is not None,
        )
        serializer.is_valid(raise_exception=True)

        selected_regimen = serializer.validated_data.get(
            "selected_regimen", getattr(treatment_decision, "selected_regimen", None)
        )
        DoctorRegimenCandidateListAPIView.validate_selected_regimen(request, case_id, selected_regimen)

        if clinical_result is None:
            clinical_result = ClinicalResult.objects.create(
                case=case, workflow_stage="TREATMENT", result_status="DRAFT",
            )
        serializer.save(clinical_result=clinical_result)

        return Response(
            serializer.data,
            status=200 if treatment_decision else 201,
        )
@extend_schema(tags=["호흡기내과-치료결정"])
class DoctorTreatmentDecisionConfirmAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    @extend_schema(
        request=None,
        responses={200: DoctorTreatmentDecisionSerializer},
    )
    @transaction.atomic
    def post(self, request, case_id):
        case = (
            LungCancerCase.objects.select_for_update(of=("self",))
            .filter(
                id=case_id,
                primary_doctor=request.user,
                case_status="ACTIVE",
            )
            .first()
        )

        if case is None:
            return Response(
                {"detail": "담당 Case를 찾을 수 없습니다."},
                status=404,
            )

        if case.current_stage != "TREATMENT":
            return Response(
                {"detail": "치료결정 단계에서만 최종 확정할 수 있습니다."},
                status=400,
            )

        clinical_result = (
            ClinicalResult.objects.select_for_update(of=("self",))
            .filter(case=case, workflow_stage=WorkflowStage.TREATMENT)
            .first()
        )
        if clinical_result is None:
            return Response({"detail": "Treatment decision was not found."}, status=404)
        if clinical_result.result_status == ClinicalResult.ResultStatus.CONFIRMED:
            return Response({"detail": "Treatment decision is already confirmed."}, status=400)

        treatment_decision = (
            TreatmentDecision.objects
            .select_related(
                "selected_regimen",
                "clinical_result__case",
            )
            .filter(
                clinical_result=clinical_result,
            )
            .first()
        )

        if treatment_decision is None:
            return Response(
                {"detail": "확정할 치료 결정이 없습니다."},
                status=404,
            )

        if (
            treatment_decision.treatment_type in TreatmentDecision.REGIMEN_REQUIRED_TYPES
            and treatment_decision.selected_regimen is None
        ):
            return Response(
                {"detail": "해당 치료 유형은 Regimen 선택이 필요합니다."},
                status=400,
            )

        # Keep using the row locked above. ``select_related`` materializes a
        # second ClinicalResult/Case object for ``treatment_decision``; if that
        # cached graph is serialized after the writes below, it can still
        # expose the pre-confirmation Case.current_stage.
        treatment_decision.clinical_result = clinical_result

        if clinical_result.result_status == "CONFIRMED":
            return Response(
                {"detail": "이미 확정된 치료 결정입니다."},
                status=400,
            )

        DoctorRegimenCandidateListAPIView.validate_selected_regimen(
            request, case_id, treatment_decision.selected_regimen,
        )

        clinical_result.result_status = "CONFIRMED"
        clinical_result.confirmed_by_user = request.user
        clinical_result.confirmed_at = timezone.now()
        clinical_result.save(
            update_fields=[
                "result_status",
                "confirmed_by_user",
                "confirmed_at",
                "updated_at",
            ]
        )

        ClinicianDecision.objects.create(
            case=case,
            source_stage="TREATMENT",
            source_clinical_result=clinical_result,
            decision_type="PROCEED_NEXT_STAGE",
            target_stage="PRESCRIPTION",
            reason="치료 계획 확정 후 처방 단계로 진행",
            decided_by_user=request.user,
            decided_at=timezone.now(),
        )

        case.current_stage = "PRESCRIPTION"
        case.save(
            update_fields=[
                "current_stage",
                "updated_at",
            ]
        )

        # The response contract is used to update the workflow badge
        # immediately, so point the in-memory serializer graph at the updated
        # locked Case instead of its stale select_related copy.
        clinical_result.case = case

        serializer = DoctorTreatmentDecisionSerializer(treatment_decision)

        return Response(
            serializer.data,
            status=200,
        )

@extend_schema(tags=["호흡기내과-처방관리"])
class DoctorPrescriptionAPIView(PulmonologyWritePermissionMixin, APIView):

    def get_case(self, case_id, user, *, lock=False):
        cases = LungCancerCase.objects.all()
        if lock:
            cases = cases.select_for_update(of=("self",))
        return cases.filter(id=case_id, primary_doctor=user, case_status="ACTIVE").first()

    def get_readable_case(self, case_id, user):
        return LungCancerCase.objects.filter(id=case_id, primary_doctor=user).first()

    # 처방 목록 조회
    @extend_schema(
        responses={200: DoctorPrescriptionSerializer(many=True)},
    )
    def get(self, request, case_id):
        case = self.get_readable_case(case_id, request.user)

        if case is None:
            return Response(
                {"detail": "담당 Case를 찾을 수 없습니다."},
                status=404,
            )

        prescriptions = (
            Prescription.objects
            .filter(case=case)
            .select_related(
                "treatment_decision",
                "regimen",
                "prescribed_by_user",
            )
            .prefetch_related(
                "items__drug",
                "safety_check_results",
            )
            .order_by("-created_at")
        )

        serializer = DoctorPrescriptionSerializer(
            prescriptions,
            many=True,
        )

        return Response(serializer.data)

    
    # 처방 DRAFT 생성
    @extend_schema(
        request=DoctorPrescriptionSerializer,
        responses={201: DoctorPrescriptionSerializer},
    )
    @transaction.atomic
    def post(self, request, case_id):
        case = self.get_case(case_id, request.user, lock=True)

        if case is None:
            return Response(
                {"detail": "담당 Case를 찾을 수 없습니다."},
                status=404,
            )

        if case.current_stage != "PRESCRIPTION":
            return Response(
                {"detail": "처방 단계에서만 처방을 생성할 수 있습니다."},
                status=400,
            )

        treatment_decision = (
            TreatmentDecision.objects
            .select_related(
                "clinical_result",
                "selected_regimen",
            )
            .filter(
                clinical_result__case=case,
                clinical_result__result_status="CONFIRMED",
            )
            .order_by("-clinical_result__confirmed_at")
            .first()
        )

        if treatment_decision is None:
            return Response(
                {"detail": "확정된 치료 결정이 없습니다."},
                status=400,
            )

        if not treatment_decision.requires_drug_prescription:
            return Response(
                {"detail": "비약물 치료계획에는 약물 처방을 생성하지 않습니다. 종료 또는 의뢰 처리를 진행해 주세요."},
                status=400,
            )

        if treatment_decision.selected_regimen is None:
            return Response(
                {"detail": "치료 결정에 선택된 Regimen이 없습니다."},
                status=400,
            )

        serializer = DoctorPrescriptionSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        cycle_number = serializer.validated_data["cycle_number"]
        phase = serializer.validated_data["phase"]
        regimen = treatment_decision.selected_regimen

        if Prescription.objects.filter(case=case, regimen=regimen, cycle_number=cycle_number).exists():
            return Response({"detail": "같은 Regimen의 동일 cycle_number 처방이 이미 존재합니다."}, status=400)

        if phase == "INDUCTION" and regimen.induction_cycles is not None and cycle_number > regimen.induction_cycles:
            return Response(
                {"detail": f"INDUCTION 처방은 최대 {regimen.induction_cycles} cycle까지 가능합니다."},
                status=400,
            )

        regimen_drugs = list(
            RegimenDrug.objects
            .filter(
                regimen=treatment_decision.selected_regimen,
                phase=phase,
            )
            .select_related("drug")
            .order_by("sequence")
        )

        if not regimen_drugs:
            raise ValidationError({"phase": "No regimen drugs exist for the selected regimen and phase."})

        prescription = serializer.save(
            case=case,
            treatment_decision=treatment_decision,
            regimen=treatment_decision.selected_regimen,
            prescription_status="DRAFT",
            prescribed_by_user=request.user,
            prescribed_at=timezone.now(),
        )

        patient_profile = PatientHealthProfile.objects.filter(
            patient=case.patient,
        ).first()

        latest_lab = LabResult.objects.filter(patient=case.patient).order_by("-tested_at", "-id").first()

        for regimen_drug in regimen_drugs:
            dose_values = calculate_dose(
                regimen_drug.dose_basis, regimen_drug.dose,
                getattr(patient_profile, "height_cm", None),
                getattr(patient_profile, "weight_kg", None),
                getattr(latest_lab, "egfr", None),
            )
            if not regimen_drug.result_unit:
                raise ValidationError({"result_unit": "A result unit is required."})
            if regimen_drug.dose_basis == "AUC" and regimen_drug.result_unit != "mg":
                raise ValidationError({"result_unit": "Calvert dose must be expressed in mg."})

            PrescriptionItem.objects.create(
                prescription=prescription,
                drug=regimen_drug.drug,
                standard_dose=regimen_drug.dose,
                dose_basis=regimen_drug.dose_basis,
                **dose_values,
                unit=regimen_drug.result_unit,
                route=regimen_drug.route,
                administration_day=regimen_drug.administration_day,
                frequency=regimen_drug.frequency,
            )

        prescription = (
            Prescription.objects
            .select_related(
                "treatment_decision",
                "regimen",
                "prescribed_by_user",
            )
            .prefetch_related(
                "items__drug",
                "safety_check_results",
            )
            .get(id=prescription.id)
        )

        return Response(
            DoctorPrescriptionSerializer(prescription).data,
            status=201,
        )

@extend_schema(tags=["호흡기내과-처방관리"])
class DoctorPrescriptionFinalizeAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    @extend_schema(
        request=PrescriptionFinalizeSerializer,
        responses={200: DoctorPrescriptionSerializer},
    )
    @transaction.atomic
    def post(self, request, case_id, prescription_id):
        prescription = (
            Prescription.objects
            .select_for_update(of=("self",))
            .select_related(
                "case",
                "case__patient",
                "treatment_decision",
                "treatment_decision__clinical_result",
                "regimen",
                "prescribed_by_user",
            )
            .filter(
                id=prescription_id,
                case_id=case_id,
                case__primary_doctor=request.user,
                case__case_status="ACTIVE",
            )
            .first()
        )

        if prescription is None:
            return Response(
                {"detail": "처방을 찾을 수 없습니다."},
                status=404,
            )

        if prescription.case.current_stage != "PRESCRIPTION":
            return Response(
                {"detail": "처방 단계에서만 처방을 최종 확정할 수 있습니다."},
                status=400,
            )

        if prescription.prescription_status != "VALIDATED":
            return Response(
                {"detail": "Safety Check가 완료된 VALIDATED 상태의 처방만 최종 확정할 수 있습니다."},
                status=400,
            )

        if prescription.treatment_decision.clinical_result.result_status != "CONFIRMED":
            return Response({"detail": "확정된 치료 결정이 아닙니다."}, status=400)

        items = prescription.items.all()

        if not items.exists():
            return Response({"detail": "처방 약물 항목이 없습니다."}, status=400)

        if items.filter(final_dose__isnull=True).exists():
            return Response({"detail": "최종 용량이 입력되지 않은 처방 약물이 있습니다."}, status=400)

        safety_results = prescription.safety_check_results.all()

        if not safety_results.exists():
            return Response(
                {"detail": "Safety Check가 수행되지 않았습니다."},
                status=400,
            )

        safety_freshness = evaluate_prescription_safety_freshness(
            prescription,
            items=list(items),
        )
        if safety_freshness.status != SafetyFreshness.CURRENT:
            return Response(
                {
                    "detail": (
                        "Safety Check 이후 환자 복용약, 알레르기 또는 검사 데이터가 변경되어 "
                        "Safety Check를 다시 수행해야 합니다."
                    )
                },
                status=400,
            )

        if safety_results.filter(result="BLOCK").exists():
            return Response(
                {"detail": "BLOCK Safety 결과가 있어 처방을 확정할 수 없습니다."},
                status=400,
            )

        unresolved_warnings = safety_results.filter(
            result="WARNING",
            source_code__in=UNRESOLVED_SAFETY_SOURCE_CODES,
        )

        if unresolved_warnings.exists():
            return Response(
                {
                    "detail": (
                        "DUR, 알레르기 또는 검사 데이터의 미해결 Safety WARNING이 있어 "
                        "처방을 확정할 수 없습니다. Safety Check를 다시 수행해 주세요."
                    )
                },
                status=400,
            )

        unacknowledged_warnings = safety_results.filter(
            result="WARNING",
            acknowledged_at__isnull=True,
        )

        if unacknowledged_warnings.exists():
            return Response(
                {
                    "detail": (
                        "확인되지 않은 WARNING Safety 결과가 있습니다. "
                        "의료진 확인 후 확정해야 합니다."
                    )
                },
                status=400,
            )

        finalization_serializer = PrescriptionFinalizeSerializer(
            data=request.data or {}, context={"prescription": prescription}
        )
        finalization_serializer.is_valid(raise_exception=True)
        schedule_payloads = finalization_serializer.validated_data.get("medication_schedules", [])
        if schedule_payloads:
            patient_account = PatientAccount.objects.filter(patient=prescription.case.patient).first()
            if patient_account is None:
                return Response(
                    {"detail": "A linked patient account is required before creating medication schedules."},
                    status=400,
                )
            for payload in schedule_payloads:
                schedule_serializer = DoctorMedicationScheduleSerializer(
                    context={"prescription": prescription, "patient_account": patient_account},
                )
                schedule_serializer.create(payload)

        prescription.prescription_status = "FINAL"
        prescription.save(
            update_fields=[
                "prescription_status",
                "updated_at",
            ]
        )

        serializer = DoctorPrescriptionSerializer(prescription)

        return Response(
            serializer.data,
            status=200,
        )


class DoctorMedicationScheduleListCreateAPIView(PulmonologyWritePermissionMixin, APIView):

    def _prescription(self, request, case_id, prescription_id):
        return Prescription.objects.filter(
            id=prescription_id,
            case_id=case_id,
            case__primary_doctor=request.user,
            case__case_status="ACTIVE",
            prescription_status=Prescription.PrescriptionStatus.FINAL,
        ).first()

    def get(self, request, case_id, prescription_id):
        prescription = self._prescription(request, case_id, prescription_id)
        if prescription is None:
            return Response({"detail": "A final prescription was not found."}, status=404)
        schedules = MedicationSchedule.objects.filter(prescription=prescription).prefetch_related("items__prescription_item__drug")
        return Response(DoctorMedicationScheduleSerializer(schedules, many=True, context={"prescription": prescription}).data)

    @transaction.atomic
    def post(self, request, case_id, prescription_id):
        prescription = self._prescription(request, case_id, prescription_id)
        if prescription is None:
            return Response({"detail": "A final prescription was not found."}, status=404)
        patient_account = PatientAccount.objects.filter(patient=prescription.case.patient).first()
        if patient_account is None:
            return Response({"detail": "A linked patient account is required."}, status=400)
        serializer = DoctorMedicationScheduleSerializer(
            data=request.data, context={"prescription": prescription, "patient_account": patient_account}
        )
        serializer.is_valid(raise_exception=True)
        schedule = serializer.save()
        return Response(
            DoctorMedicationScheduleSerializer(schedule, context={"prescription": prescription}).data,
            status=201,
        )


class DoctorMedicationScheduleDetailAPIView(DoctorMedicationScheduleListCreateAPIView):
    def _schedule(self, request, case_id, prescription_id, schedule_id):
        prescription = self._prescription(request, case_id, prescription_id)
        if prescription is None:
            return None, None
        return prescription, MedicationSchedule.objects.filter(id=schedule_id, prescription=prescription).first()

    @transaction.atomic
    def patch(self, request, case_id, prescription_id, schedule_id):
        prescription, schedule = self._schedule(request, case_id, prescription_id, schedule_id)
        if schedule is None:
            return Response({"detail": "Medication schedule was not found."}, status=404)
        serializer = DoctorMedicationScheduleSerializer(
            schedule, data=request.data, partial=True, context={"prescription": prescription}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @transaction.atomic
    def delete(self, request, case_id, prescription_id, schedule_id):
        _, schedule = self._schedule(request, case_id, prescription_id, schedule_id)
        if schedule is None:
            return Response({"detail": "Medication schedule was not found."}, status=404)
        schedule.enabled = False
        schedule.save(update_fields=["enabled", "updated_at"])
        return Response(status=204)

@extend_schema(tags=["호흡기내과-처방관리"])
class DoctorSafetyWarningAcknowledgeAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    @extend_schema(
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "acknowledgment_note": {
                        "type": "string",
                    }
                },
            }
        },
        responses={200: DoctorPrescriptionSerializer},
    )
    @transaction.atomic
    def post(self, request, case_id, prescription_id):
        prescription = (
            Prescription.objects
            .select_for_update(of=("self",))
            .select_related(
                "case",
                "treatment_decision",
                "regimen",
            )
            .filter(
                id=prescription_id,
                case_id=case_id,
                case__primary_doctor=request.user,
                case__case_status="ACTIVE",
            )
            .first()
        )

        if prescription is None:
            return Response(
                {"detail": "처방을 찾을 수 없습니다."},
                status=404,
            )

        if prescription.case.current_stage != WorkflowStage.PRESCRIPTION:
            return Response(
                {"detail": "처방 단계에서만 WARNING을 확인할 수 있습니다."},
                status=400,
            )

        if prescription.prescription_status != "VALIDATED":
            return Response(
                {"detail": "VALIDATED 상태의 처방만 WARNING을 확인할 수 있습니다."},
                status=400,
            )

        warning_results = prescription.safety_check_results.filter(
            result="WARNING",
        )

        if not warning_results.exists():
            return Response(
                {"detail": "확인할 WARNING Safety 결과가 없습니다."},
                status=400,
            )

        note = request.data.get("acknowledgment_note", "").strip()

        if not note:
            return Response(
                {"detail": "WARNING 확인 사유를 입력해 주세요."},
                status=400,
            )

        warning_results = warning_results.exclude(
            source_code__in=UNRESOLVED_SAFETY_SOURCE_CODES,
        )

        if not warning_results.exists():
            return Response(
                {"detail": "재검사가 필요한 미해결 WARNING만 존재합니다."},
                status=400,
            )

        warning_results.update(
            acknowledged_by_user=request.user,
            acknowledged_at=timezone.now(),
            acknowledgment_note=note,
        )

        prescription = (
            Prescription.objects
            .select_related(
                "treatment_decision",
                "regimen",
                "prescribed_by_user",
            )
            .prefetch_related(
                "items__drug",
                "safety_check_results",
            )
            .get(id=prescription.id)
        )

        return Response(
            DoctorPrescriptionSerializer(prescription).data,
            status=200,
        )

@extend_schema(tags=["호흡기내과-처방관리"])
class DoctorPrescriptionItemUpdateAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    @extend_schema(
        request={
            "application/json": {
                "type": "object",
                "properties": {
                    "final_dose": {
                        "type": "number",
                    },
                    "instructions": {
                        "type": "string",
                    },
                },
            }
        },
        responses={200: DoctorPrescriptionSerializer},
    )
    @transaction.atomic
    def patch(self, request, case_id, prescription_id, item_id):
        prescription = (
            Prescription.objects
            .select_for_update(of=("self",))
            .filter(
                id=prescription_id,
                case_id=case_id,
                case__primary_doctor=request.user,
                case__case_status="ACTIVE",
            )
            .first()
        )

        if prescription is None:
            return Response(
                {"detail": "처방을 찾을 수 없습니다."},
                status=404,
            )

        if prescription.case.current_stage != WorkflowStage.PRESCRIPTION:
            return Response(
                {"detail": "처방 단계에서만 처방 약물 정보를 수정할 수 있습니다."},
                status=400,
            )

        if prescription.prescription_status not in {"DRAFT", "VALIDATED"}:
            return Response(
                {"detail": "DRAFT 또는 VALIDATED 상태의 처방만 수정할 수 있습니다."},
                status=400,
            )

        item = (
            PrescriptionItem.objects
            .filter(
                id=item_id,
                prescription=prescription,
            )
            .first()
        )

        if item is None:
            return Response(
                {"detail": "처방 약물 항목을 찾을 수 없습니다."},
                status=404,
            )

        serializer = PrescriptionItemUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(item, field, value)

        item.save(
            update_fields=[
                "mfds_item_seq",
                "final_dose",
                "instructions",
                "updated_at",
            ]
        )
        # 처방 내용이 변경되었으므로 기존 Safety Check 결과 무효화
        prescription.safety_check_results.all().delete()
        # Safety Check 완료 상태였다면 다시 DRAFT로 되돌림
        prescription.prescription_status = "DRAFT"
        prescription.save(update_fields=["prescription_status", "updated_at"])

        prescription = (
            Prescription.objects
            .select_related(
                "treatment_decision",
                "regimen",
                "prescribed_by_user",
            )
            .prefetch_related(
                "items__drug",
                "safety_check_results",
            )
            .get(id=prescription.id)
        )

        return Response(
            DoctorPrescriptionSerializer(prescription).data,
            status=200,
        )

@extend_schema(tags=["호흡기내과-처방관리"])
class DoctorPrescriptionSafetyCheckAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = PULMONOLOGY_WRITE_PERMISSIONS

    @extend_schema(request=None, responses={200: DoctorPrescriptionSerializer})
    @transaction.atomic
    def post(self, request, case_id, prescription_id):
        prescription = (
            Prescription.objects
            .select_for_update(of=("self",))
            .select_related("case", "case__patient")
            .prefetch_related("items__drug")
            .filter(
                id=prescription_id,
                case_id=case_id,
                case__primary_doctor=request.user,
                case__case_status="ACTIVE",
            )
            .first()
        )

        if prescription is None:
            return Response(
                {"detail": "처방을 찾을 수 없습니다."},
                status=404,
            )

        if prescription.case.current_stage != WorkflowStage.PRESCRIPTION:
            return Response(
                {"detail": "처방 단계에서만 Safety Check를 수행할 수 있습니다."},
                status=400,
            )

        if prescription.prescription_status not in {
            Prescription.PrescriptionStatus.DRAFT,
            Prescription.PrescriptionStatus.VALIDATED,
        }:
            return Response(
                {"detail": "DRAFT 또는 재검사가 필요한 VALIDATED 처방만 Safety Check를 수행할 수 있습니다."},
                status=400,
            )

        items = list(prescription.items.all())
        if not items:
            return Response(
                {"detail": "Safety Check를 수행할 처방 약물 항목이 없습니다."},
                status=400,
            )

        if any(item.final_dose is None for item in items):
            return Response(
                {"detail": "모든 처방 약물의 최종 용량을 입력한 후 Safety Check를 수행할 수 있습니다."},
                status=400,
            )

        if prescription.prescription_status == Prescription.PrescriptionStatus.VALIDATED:
            safety_freshness = evaluate_prescription_safety_freshness(
                prescription,
                items=items,
            )
            if safety_freshness.status == SafetyFreshness.CURRENT:
                return Response(
                    {"detail": "현재 Safety Check가 최신 상태이므로 중복 실행할 수 없습니다."},
                    status=400,
                )

        patient = prescription.case.patient

        # 기존 Safety 결과 초기화 후 재검사
        prescription.safety_check_results.all().delete()

        patient_profile = PatientHealthProfile.objects.filter(patient=patient).first()
        allergy_names, allergy_state_confirmed = _allergy_names(patient_profile)

        active_medications = list(
            CurrentMedication.objects
            .filter(patient=patient, is_active=True)
            .select_related("drug")
        )

        latest_lab = (
            LabResult.objects
            .filter(patient=patient)
            .order_by("-tested_at")
            .first()
        )

        SafetyCheckResult.objects.create(
            prescription=prescription,
            prescription_item=None,
            check_type="INPUT_SNAPSHOT",
            result="PASS",
            message=json.dumps(
                _safety_input_snapshot(
                    items=items,
                    medications=active_medications,
                    patient_profile=patient_profile,
                    latest_lab=latest_lab,
                ),
                sort_keys=True,
                default=str,
            ),
            source="INTERNAL_RULE_V1",
            source_code="SAFETY_INPUT_SNAPSHOT",
            checked_at=timezone.now(),
        )

        # 1. 현재 복용약과 처방약 성분 중복 및 직접 알레르기 확인
        for item in items:
            ingredient = item.drug.ingredient_name
            normalized_ingredient = (ingredient or "").strip().casefold()

            duplicated = bool(normalized_ingredient) and any(
                isinstance(medication.ingredient_name, str)
                and medication.ingredient_name.strip().casefold()
                == normalized_ingredient
                for medication in active_medications
            )

            SafetyCheckResult.objects.create(
                prescription=prescription,
                prescription_item=item,
                check_type="DUPLICATION",
                result="WARNING" if duplicated else "PASS",
                message=(
                    f"{ingredient} 성분이 현재 복용약과 중복됩니다."
                    if duplicated
                    else f"{ingredient} 성분의 현재 복용약 중복이 확인되지 않았습니다."
                ),
                source="INTERNAL_RULE_V1",
                source_code="DUPLICATION_CHECK",
                checked_at=timezone.now(),
            )

            # 알레르기 검사는 정확한 약물명 또는 성분명만 비교한다.
            ingredient = (item.drug.ingredient_name or "").strip()
            drug_name = (item.drug.drug_name or "").strip()

            allergy_match = (
                ingredient.casefold() in allergy_names
                or drug_name.casefold() in allergy_names
            )

            SafetyCheckResult.objects.create(
                prescription=prescription,
                prescription_item=item,
                check_type="ALLERGY",
                result=(
                    "BLOCK" if allergy_match
                    else "PASS" if allergy_state_confirmed
                    else "WARNING"
                ),
                message=(
                    f"{ingredient or drug_name} 성분/약물이 환자 알레르기 정보와 일치합니다."
                    if allergy_match
                    else (
                        f"{ingredient or drug_name} 관련 등록된 직접 알레르기가 없습니다."
                        if allergy_state_confirmed
                        else "환자 알레르기 정보를 확인할 수 없어 추가 검토가 필요합니다."
                    )
                ),
                source="INTERNAL_RULE_V1",
                source_code=(
                    "ALLERGY_CHECK"
                    if allergy_match or allergy_state_confirmed
                    else "ALLERGY_UNCONFIRMED"
                ),
                checked_at=timezone.now(),
            )

        # 2. DUR은 명시적으로 저장된 MFDS ITEM_SEQ만 사용한다.
        dur_client = DurClient()
        dur_cache = {}

        def query_dur(operation, item_seq):
            key = (operation, item_seq)
            if key not in dur_cache:
                dur_cache[key] = dur_client.query(operation, item_seq)
            return dur_cache[key]

        mapped_medications = []
        for medication in active_medications:
            medication_item_seq = _explicit_item_seq(medication)
            if medication_item_seq:
                mapped_medications.append((medication, medication_item_seq))
            else:
                SafetyCheckResult.objects.create(
                    prescription=prescription,
                    prescription_item=None,
                    check_type="DRUG_INTERACTION",
                    result="WARNING",
                    message=(
                        f"현재 복용약 {medication.medication_name}의 DUR 품목 식별 코드를 "
                        "확인할 수 없어 병용금기를 자동 판정할 수 없습니다."
                    ),
                    source="MFDS DUR",
                    source_code="DUR_MAPPING_UNRESOLVED",
                    checked_at=timezone.now(),
                )

        dur_block_pairs = set()
        for item in items:
            prescription_item_seq = _explicit_item_seq(item)
            if not prescription_item_seq:
                SafetyCheckResult.objects.create(
                    prescription=prescription,
                    prescription_item=item,
                    check_type="DRUG_INTERACTION",
                    result="WARNING",
                    message=(
                        f"처방약 {item.drug.drug_name}의 DUR 품목 식별 코드를 확인할 수 없어 "
                        "병용금기를 자동 판정할 수 없습니다."
                    ),
                    source="MFDS DUR",
                    source_code="DUR_MAPPING_UNRESOLVED",
                    checked_at=timezone.now(),
                )
                continue

            # 병용금기는 양쪽 품목에서 조회해 정확한 ITEM_SEQ 쌍이 있는 경우에만 BLOCK 한다.
            for medication, medication_item_seq in mapped_medications:
                pair_results = [
                    query_dur("getUsjntTabooInfoList03", prescription_item_seq),
                    query_dur("getUsjntTabooInfoList03", medication_item_seq),
                ]
                for dur_result in pair_results:
                    if dur_result.status == "ERROR":
                        SafetyCheckResult.objects.create(
                            prescription=prescription,
                            prescription_item=item,
                            check_type="DRUG_INTERACTION",
                            result="WARNING",
                            message="MFDS DUR 병용금기 정보를 조회할 수 없어 추가 검토가 필요합니다.",
                            source="MFDS DUR",
                            source_code="DUR_API_ERROR",
                            checked_at=timezone.now(),
                        )
                        continue

                    if dur_result.status != "SUCCESS_WITH_RESULTS":
                        continue

                    for row in dur_result.rows:
                        if not _dur_pair_matches(
                            row,
                            prescription_item_seq,
                            medication_item_seq,
                        ):
                            continue
                        pair_key = (id(item), *sorted((
                            prescription_item_seq,
                            medication_item_seq,
                        )))
                        if pair_key in dur_block_pairs:
                            continue
                        dur_block_pairs.add(pair_key)
                        SafetyCheckResult.objects.create(
                            prescription=prescription,
                            prescription_item=item,
                            check_type="DRUG_INTERACTION",
                            result="BLOCK",
                            message=(
                                f"{item.drug.drug_name} + {medication.medication_name}: "
                                f"{_dur_message('getUsjntTabooInfoList03', row)}"
                            ),
                            source="MFDS DUR",
                            source_code=(
                                f"DUR_USJNT_{prescription_item_seq}_{medication_item_seq}"
                            ),
                            checked_at=timezone.now(),
                        )

            # 텍스트 중심 DUR 유형은 공식 결과가 있더라도 자동 BLOCK 하지 않는다.
            for operation in OPERATIONS:
                if operation == "getUsjntTabooInfoList03":
                    continue
                dur_result = query_dur(operation, prescription_item_seq)
                if dur_result.status == "ERROR":
                    SafetyCheckResult.objects.create(
                        prescription=prescription,
                        prescription_item=item,
                        check_type="DRUG_INTERACTION",
                        result="WARNING",
                        message="MFDS DUR 정보를 조회할 수 없어 추가 검토가 필요합니다.",
                        source="MFDS DUR",
                        source_code="DUR_API_ERROR",
                        checked_at=timezone.now(),
                    )
                    continue
                if dur_result.status != "SUCCESS_WITH_RESULTS":
                    continue
                for row in dur_result.rows:
                    SafetyCheckResult.objects.create(
                        prescription=prescription,
                        prescription_item=item,
                        check_type="DRUG_INTERACTION",
                        result="WARNING",
                        message=_dur_message(operation, row),
                        source="MFDS DUR",
                        source_code=f"DUR_{operation}",
                        checked_at=timezone.now(),
                    )

        # 3. 신장기능 검사 데이터의 존재 여부만 확인한다. 정상/비정상 판정은 하지 않는다.
        renal_data_available = (
            latest_lab is not None
            and latest_lab.creatinine is not None
            and latest_lab.egfr is not None
        )

        SafetyCheckResult.objects.create(
            prescription=prescription,
            prescription_item=None,
            check_type="RENAL_FUNCTION",
            result="PASS" if renal_data_available else "WARNING",
            message=(
                "신장기능 검토에 필요한 최근 Creatinine/eGFR 값의 존재를 확인했습니다."
                if renal_data_available
                else "최근 Creatinine/eGFR 값이 없어 추가 검토가 필요합니다."
            ),
            source="INTERNAL_RULE_V1",
            source_code="RENAL_DATA_CHECK" if renal_data_available else "LAB_MISSING",
            checked_at=timezone.now(),
        )

        # 4. 간기능 검사 데이터의 존재 여부만 확인한다. 정상/비정상 판정은 하지 않는다.
        hepatic_data_available = (
            latest_lab is not None
            and latest_lab.ast is not None
            and latest_lab.alt is not None
            and latest_lab.total_bilirubin is not None
        )

        SafetyCheckResult.objects.create(
            prescription=prescription,
            prescription_item=None,
            check_type="HEPATIC_FUNCTION",
            result="PASS" if hepatic_data_available else "WARNING",
            message=(
                "간기능 검토에 필요한 최근 AST/ALT/Bilirubin 값의 존재를 확인했습니다."
                if hepatic_data_available
                else "최근 AST/ALT/Bilirubin 값이 부족하여 추가 검토가 필요합니다."
            ),
            source="INTERNAL_RULE_V1",
            source_code="HEPATIC_DATA_CHECK" if hepatic_data_available else "LAB_MISSING",
            checked_at=timezone.now(),
        )

        has_block = prescription.safety_check_results.filter(result="BLOCK").exists()
        has_unresolved_warning = prescription.safety_check_results.filter(
            result="WARNING",
            source_code__in=UNRESOLVED_SAFETY_SOURCE_CODES,
        ).exists()

        prescription.prescription_status = (
            "VALIDATED" if not has_block and not has_unresolved_warning else "DRAFT"
        )
        prescription.save(update_fields=["prescription_status", "updated_at"])

        prescription = (
            Prescription.objects
            .select_related("treatment_decision", "regimen", "prescribed_by_user")
            .prefetch_related("items__drug", "safety_check_results")
            .get(id=prescription.id)
        )

        return Response(
            DoctorPrescriptionSerializer(prescription).data,
            status=200,
        )

@extend_schema(tags=["호흡기내과-치료결정"])
class DoctorRegimenCandidateListAPIView(ListAPIView):
    serializer_class = TreatmentRuleCandidateSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    @classmethod
    def validate_selected_regimen(cls, request, case_id, regimen):
        # Optional/no-regimen treatments retain their existing policy. Any supplied
        # regimen, including one retained by a partial update, must be a candidate.
        if regimen is None:
            return
        view = cls()
        view.request = request
        view.kwargs = {"case_id": case_id}
        candidate_ids = {rule.regimen_id for rule in view.get_queryset()}
        if regimen.pk not in candidate_ids:
            raise ValidationError({
                "selected_regimen": "선택한 Regimen은 현재 확정 임상정보에 따른 치료 후보가 아닙니다. 후보를 다시 확인해주세요.",
            })

    # Codes describe manually verified molecular findings, never AI predictions.
    SUPPORTED_ALTERATIONS = CANONICAL_ALTERATIONS
    TARGET_RULES = {"TR01": "EGFR", "TR04": "BRAF", "TR05": "MET"}
    CONTEXT_GENES = frozenset({"TP53", "KEAP1", "STK11"})
    HISTOLOGY_ALIASES = {
        "adenocarcinoma": "adenocarcinoma", "선암": "adenocarcinoma",
        "luad": "adenocarcinoma",
        "squamous cell carcinoma": "squamous", "squamous": "squamous",
        "편평상피암": "squamous",
        "lusc": "squamous",
        "non-squamous": "non-squamous", "non_squamous": "non-squamous",
        "비편평": "non-squamous",
        "nsclc": "nsclc", "non-small cell lung cancer": "nsclc",
        "비소세포폐암": "nsclc",
        "sclc": "sclc", "small cell lung cancer": "sclc", "소세포폐암": "sclc",
    }
    CANCER_TYPES = {
        "adenocarcinoma": "NSCLC", "squamous": "NSCLC",
        "non-squamous": "NSCLC", "nsclc": "NSCLC", "sclc": "SCLC",
    }

    @classmethod
    def _histology(cls, value):
        return cls.HISTOLOGY_ALIASES.get(value.strip().casefold()) if isinstance(value, str) else None

    @classmethod
    def _histology_matches(cls, expected, actual):
        normalized = cls._histology(expected)
        if normalized == "non-squamous":
            return actual in {"adenocarcinoma", "non-squamous"}
        return normalized is not None and normalized == actual

    @staticmethod
    def _stage_matches(actual, expected_values):
        if not isinstance(actual, str):
            return False
        normalized_actual = actual.strip().upper()
        for expected in expected_values:
            normalized_expected = expected.strip().upper()
            if normalized_actual == normalized_expected:
                return True
            if normalized_expected == "IV" and normalized_actual in {"IVA", "IVB"}:
                return True
        return False

    def _candidate_input(self):
        if hasattr(self, "_candidate_input_cache"):
            return self._candidate_input_cache
        case = LungCancerCase.objects.filter(
            id=self.kwargs["case_id"], primary_doctor=self.request.user,
            case_status="ACTIVE",
        ).first()
        data = dict(case=case, histology=None, cancer_type=None, stage_group=None,
                    findings=[], pdl1_tps=None, treatment_line=None, ecog=None)
        if case is not None:
            confirmed = ClinicalResult.objects.filter(case=case, result_status="CONFIRMED")
            ordering = (F("confirmed_at").desc(nulls_last=True), "-updated_at", "-id")
            pathology = confirmed.filter(
                workflow_stage="PATHOLOGY_GENE", pathology_detail__isnull=False,
            ).select_related("pathology_detail").order_by(*ordering).first()
            staging = confirmed.filter(
                workflow_stage="PET_CT_TNM", tnm_detail__isnull=False,
            ).select_related("tnm_detail").order_by(*ordering).first()
            gene = confirmed.filter(
                workflow_stage="PATHOLOGY_GENE", gene_detail__isnull=False,
            ).select_related("gene_detail").prefetch_related(
                "gene_detail__gene_findings",
            ).order_by(*ordering).first()
            if pathology and pathology.pathology_detail.malignancy_status == "MALIGNANT":
                data["histology"] = self._histology(pathology.pathology_detail.histologic_type)
                data["cancer_type"] = self.CANCER_TYPES.get(data["histology"])
            if staging:
                data["stage_group"] = staging.tnm_detail.stage_group
            if gene:
                data["findings"] = list(gene.gene_detail.gene_findings.all())
            pdl1 = PDL1Result.objects.filter(
                clinical_result__case=case,
                clinical_result__result_status="CONFIRMED",
            ).order_by(
                F("clinical_result__confirmed_at").desc(nulls_last=True),
                "-clinical_result__updated_at", "-clinical_result_id",
            ).first()
            if pdl1 is not None:
                data["pdl1_tps"] = pdl1.tps_percent
            treatment_decision = TreatmentDecision.objects.filter(
                clinical_result__case=case,
            ).order_by(
                F("clinical_result__updated_at").desc(nulls_last=True),
                "-clinical_result_id",
            ).first()
            if treatment_decision is not None:
                data["treatment_line"] = treatment_decision.treatment_line
        self._candidate_input_cache = data
        return data

    @staticmethod
    def _condition(value, allowed):
        if value is None:
            return {}
        if not isinstance(value, dict) or not set(value).issubset(allowed):
            raise ValueError("Unsupported condition")
        return value

    @staticmethod
    def _strings(value):
        if not isinstance(value, list) or not value or any(
            not isinstance(item, str) or not item.strip() for item in value
        ):
            raise ValueError("Expected nonempty string list")
        return value

    @staticmethod
    def _range_matches(condition, value, upper):
        bounds = {}
        for key, bound in condition.items():
            if isinstance(bound, bool) or not isinstance(bound, (int, float, Decimal)):
                raise ValueError("Invalid numeric bound")
            number = Decimal(str(bound))
            if not number.is_finite() or not 0 <= number <= upper:
                raise ValueError("Out of range")
            bounds[key] = number
        if bounds.get("min", 0) > bounds.get("max", upper):
            raise ValueError("Reversed range")
        if not condition:
            return True
        if value is None:
            return False
        number = Decimal(str(value))
        return number.is_finite() and bounds.get("min", 0) <= number <= bounds.get("max", upper)

    def _match_rule(self, rule, data):
        """Return reasons only for a complete match; None includes missing inputs."""
        try:
            stage = self._condition(rule.stage_condition, {"stage"})
            biomarker = self._condition(rule.biomarker_condition, {"positive", "alterations"})
            pdl1 = self._condition(rule.pdl1_condition, {"min", "max"})
            ecog = self._condition(rule.ecog_condition, {"min", "max"})
            reasons = []
            if rule.cancer_type:
                if rule.cancer_type.strip().upper() != data["cancer_type"]:
                    return None
                reasons.append(f"암종 일치: {data['cancer_type']}")
            if rule.histology and rule.histology.strip():
                expected = self._histology(rule.histology)
                if expected is None or not self._histology_matches(rule.histology, data["histology"]):
                    return None
                reasons.append(f"조직형 일치: {expected}")
            if "stage" in stage:
                if not self._stage_matches(data["stage_group"], self._strings(stage["stage"])):
                    return None
                reasons.append(f"병기 일치: {data['stage_group']}")
            if rule.treatment_line and rule.treatment_line.strip():
                if data["treatment_line"] is None or rule.treatment_line != data["treatment_line"]:
                    return None
                reasons.append(f"치료 차수 일치: {data['treatment_line']}")
            if not self._range_matches(pdl1, data["pdl1_tps"], 100):
                return None
            if not self._range_matches(ecog, data["ecog"], 5):
                return None
            if pdl1:
                reasons.append(f"PD-L1 TPS {data['pdl1_tps']}%: 조건 충족")
            if ecog:
                reasons.append(f"ECOG {data['ecog']}: 조건 충족")

            pairs = set()
            molecular_required = bool(biomarker) or rule.rule_code in self.TARGET_RULES
            molecular_uncertain = molecular_required and not data["findings"]
            for finding in data["findings"]:
                gene = finding.gene_symbol.strip().upper()
                if gene in self.CONTEXT_GENES:
                    continue
                code = finding.alteration_code
                if (finding.assessment == "LIKELY_POSITIVE"
                        and code in self.SUPPORTED_ALTERATIONS.get(gene, ())):
                    pairs.add((gene, code))
                elif finding.assessment != "LIKELY_NEGATIVE" or code:
                    molecular_uncertain = True
            # No unsupported/ambiguous driver may fall through to another candidate.
            if molecular_uncertain:
                return None

            required = set()
            if "positive" in biomarker:
                required.update(g.upper() for g in self._strings(biomarker["positive"]))
            if rule.rule_code in self.TARGET_RULES:
                required.add(self.TARGET_RULES[rule.rule_code])
            alterations = biomarker.get("alterations", {})
            if not isinstance(alterations, dict) or ("alterations" in biomarker and not alterations):
                return None
            for gene, codes in alterations.items():
                if gene not in self.SUPPORTED_ALTERATIONS:
                    return None
                codes = set(self._strings(codes))
                if not codes.issubset(self.SUPPORTED_ALTERATIONS[gene]):
                    return None
                if not any((gene, code) in pairs for code in codes):
                    return None
                required.add(gene)
            for gene in sorted(required):
                if gene not in self.SUPPORTED_ALTERATIONS:
                    return None
                matched = sorted(code for symbol, code in pairs if symbol == gene)
                if not matched:
                    return None
                reasons.append(f"바이오마커 일치: {gene} / {', '.join(matched)}")
            if not required and pairs:
                return None
            return reasons
        except (ValueError, TypeError, ArithmeticError):
            return None

    def get_queryset(self):
        data = self._candidate_input()
        self._match_reasons = {}
        if data["case"] is None:
            return TreatmentRule.objects.none()
        rules = TreatmentRule.objects.select_related("regimen").all()
        for rule in rules:
            reasons = self._match_rule(rule, data)
            if reasons is not None:
                self._match_reasons[rule.id] = reasons
        return rules.filter(id__in=self._match_reasons).order_by("priority", "rule_code")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["match_reasons_by_id"] = getattr(self, "_match_reasons", {})
        return context


class DoctorTreatmentEvidenceAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    NCI_PDQ_URI = "gs://soomit-bucket/knowledge/lung-cancer/nsclc-treatment-pdq/nci-nsclc-pdq.pdf"

    def build_response(self, request, case_id, *, selected_regimen_id=None):
        candidate_view = DoctorRegimenCandidateListAPIView()
        candidate_view.request = request
        candidate_view.kwargs = {"case_id": case_id}
        data = candidate_view._candidate_input()
        case = data["case"]
        if case is None:
            return Response({"status": "REGIMEN_NOT_CURRENT_CANDIDATE"}, status=404)

        candidates = list(candidate_view.get_queryset())
        if selected_regimen_id is not None:
            matching = next(
                (rule for rule in candidates if rule.regimen_id == selected_regimen_id),
                None,
            )
            regimen = matching.regimen if matching is not None else None
        else:
            decision = TreatmentDecision.objects.filter(
                clinical_result__case=case, clinical_result__result_status="CONFIRMED",
            ).select_related("selected_regimen").order_by("-clinical_result__confirmed_at").first()
            regimen = decision.selected_regimen if decision else None
            if regimen is None:
                return Response({"status": "NO_SELECTED_REGIMEN", "case_id": str(case_id)})
            matching = next((rule for rule in candidates if rule.regimen_id == regimen.id), None)
        if matching is None:
            return Response({"status": "REGIMEN_NOT_CURRENT_CANDIDATE", "case_id": str(case_id)})

        confirmed_findings = [
            {"gene": finding.gene_symbol, "alteration_code": finding.alteration_code}
            for finding in data["findings"]
            if finding.assessment == "LIKELY_POSITIVE"
        ]
        drug_names = list(regimen.regimen_drugs.values_list("drug__drug_name", flat=True).distinct())
        context = {
            "cancer_type": data["cancer_type"], "histology": data["histology"],
            "stage": data["stage_group"], "confirmed_gene_findings": confirmed_findings,
            "pdl1_tps": data["pdl1_tps"], "ecog": data["ecog"],
            "treatment_line": data["treatment_line"],
        }
        query = (
            f"{context['cancer_type'] or ''} {context['histology'] or ''}, "
            f"stage {context['stage'] or ''}, "
            f"confirmed alterations {', '.join(finding['alteration_code'] for finding in confirmed_findings)}, "
            f"treatment line {context['treatment_line'] or ''}, selected regimen {regimen.regimen_code} {regimen.regimen_name}, "
            f"drugs {', '.join(drug_names)}. Summarize NCI PDQ evidence relevant to this selected regimen."
        ).strip()
        document = KnowledgeDocument.objects.filter(source_uri=self.NCI_PDQ_URI).first()
        if document is None:
            return Response({"status": "NO_EVIDENCE", "case_id": str(case_id)})
        try:
            evidence = answer_with_rag(query, document_ids=[document.id])
        except (EmbeddingServiceError, MedgemmaServiceError, KeyError, TypeError, ValueError):
            return Response({"status": "RAG_ERROR", "case_id": str(case_id)}, status=502)
        if not evidence["sources"]:
            return Response({"status": "NO_EVIDENCE", "case_id": str(case_id)})
        return Response({
            "status": "AVAILABLE", "case_id": str(case_id),
            "regimen": {"id": str(regimen.id), "code": regimen.regimen_code, "name": regimen.regimen_name},
            "treatment_rule": {
                "rule_code": matching.rule_code,
                "match_reasons": getattr(candidate_view, "_match_reasons", {}).get(matching.id, []),
                "evidence_source": matching.evidence_source,
            },
            "clinical_context": context,
            "evidence": evidence,
        })

    def get(self, request, case_id):
        return self.build_response(request, case_id)
