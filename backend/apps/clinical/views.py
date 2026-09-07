from django.db import transaction
from django.utils import timezone

from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.cases.models import ClinicianDecision, LungCancerCase
from apps.patients.models import CurrentMedication, LabResult, Patient, PatientHealthProfile

from .models import ClinicalResult, Prescription, PrescriptionItem, RegimenDrug, SafetyCheckResult, TreatmentDecision, TreatmentRule
from .serializers import (
    DoctorClinicalResultSerializer,
    DoctorPrescriptionSerializer,
    DoctorTreatmentDecisionSerializer,
    PatientClinicalResultSerializer,
    TreatmentRuleCandidateSerializer,
)

from decimal import Decimal
from math import sqrt



@extend_schema(tags=["환자앱-검사결과"])
class PatientClinicalResultListAPIView(ListAPIView):
    serializer_class = PatientClinicalResultSerializer

    def get_queryset(self):
        # 로그인 연동 전 개발용 테스트 환자
        patient = Patient.objects.first()

        if patient is None:
            return ClinicalResult.objects.none()

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
            )
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
                case_status="ACTIVE",
            )
            .first()
        )

        if case is None:
            return ClinicalResult.objects.none()

        return (
            ClinicalResult.objects
            .filter(
                case=case,
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
            .prefetch_related(
                "gene_detail__gene_findings",
            )
            .order_by("-confirmed_at", "-updated_at")
        )

@extend_schema(tags=["호흡기내과-치료결정"])
class DoctorTreatmentDecisionAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_case(self, case_id, user):
        return (
            LungCancerCase.objects
            .filter(
                id=case_id,
                primary_doctor=user,
                case_status="ACTIVE",
            )
            .first()
        )

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
                "selected_regimen",
            )
            .filter(
                clinical_result__case=case,
            )
            .first()
        )

        if treatment_decision is None:
            return Response({"detail": "치료 결정이 없습니다."}, status=404)

        serializer = DoctorTreatmentDecisionSerializer(treatment_decision)
        return Response(serializer.data, status=200)

    # 치료 결정 DRAFT 저장
    @extend_schema(
        request=DoctorTreatmentDecisionSerializer,
        responses={
            200: DoctorTreatmentDecisionSerializer,
            201: DoctorTreatmentDecisionSerializer,
        },
    )
    def post(self, request, case_id):
        case = self.get_case(case_id, request.user)

        if case is None:
            return Response(
                {"detail": "담당 Case를 찾을 수 없습니다."},
                status=404,
            )

        clinical_result, _ = ClinicalResult.objects.get_or_create(case=case, stage="TREATMENT", defaults={"result_status": "DRAFT"})

        if clinical_result.result_status == "CONFIRMED":
            return Response({"detail": "이미 확정된 치료 결정은 수정할 수 없습니다."}, status=400)

        treatment_decision = TreatmentDecision.objects.filter(clinical_result=clinical_result).first()

        serializer = DoctorTreatmentDecisionSerializer(
            treatment_decision,
            data=request.data,
            partial=treatment_decision is not None,
        )
        serializer.is_valid(raise_exception=True)

        serializer.save(
            clinical_result=clinical_result,
        )

        return Response(
            serializer.data,
            status=200 if treatment_decision else 201,
        )
@extend_schema(tags=["호흡기내과-치료결정"])
class DoctorTreatmentDecisionConfirmAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses={200: DoctorTreatmentDecisionSerializer},
    )
    @transaction.atomic
    def post(self, request, case_id):
        case = (
            LungCancerCase.objects
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

        treatment_decision = (
            TreatmentDecision.objects
            .select_related(
                "clinical_result",
                "selected_regimen",
            )
            .filter(
                clinical_result__case=case,
            )
            .first()
        )

        if treatment_decision is None:
            return Response(
                {"detail": "확정할 치료 결정이 없습니다."},
                status=404,
            )

        regimen_required_types = {"CHEMOTHERAPY", "TARGETED_THERAPY", "IMMUNOTHERAPY", "COMBINATION"}

        if treatment_decision.treatment_type in regimen_required_types and treatment_decision.selected_regimen is None:
            return Response(
                {"detail": "해당 치료 유형은 Regimen 선택이 필요합니다."},
                status=400,
            )

        clinical_result = treatment_decision.clinical_result

        if clinical_result.result_status == "CONFIRMED":
            return Response(
                {"detail": "이미 확정된 치료 결정입니다."},
                status=400,
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

        serializer = DoctorTreatmentDecisionSerializer(treatment_decision)

        return Response(
            serializer.data,
            status=200,
        )

@extend_schema(tags=["호흡기내과-처방관리"])
class DoctorPrescriptionAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_case(self, case_id, user):
        return (
            LungCancerCase.objects
            .filter(
                id=case_id,
                primary_doctor=user,
                case_status="ACTIVE",
            )
            .first()
        )

    # 처방 목록 조회
    @extend_schema(
        responses={200: DoctorPrescriptionSerializer(many=True)},
    )
    def get(self, request, case_id):
        case = self.get_case(case_id, request.user)

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

        if phase == "INDUCTION" and regimen.induction_cycles and cycle_number > regimen.induction_cycles:
            return Response(
                {"detail": f"INDUCTION 처방은 최대 {regimen.induction_cycles} cycle까지 가능합니다."},
                status=400,
            )

        prescription = serializer.save(
            case=case,
            treatment_decision=treatment_decision,
            regimen=treatment_decision.selected_regimen,
            prescription_status="DRAFT",
            prescribed_by_user=request.user,
            prescribed_at=timezone.now(),
        )

        regimen_drugs = (
            RegimenDrug.objects
            .filter(
                regimen=treatment_decision.selected_regimen,
                phase=prescription.phase,
            )
            .select_related("drug")
            .order_by("sequence")
        )

        patient_profile = PatientHealthProfile.objects.filter(
            patient=case.patient,
        ).first()

        patient_bsa = None

        if (
            patient_profile
            and patient_profile.height_cm
            and patient_profile.weight_kg
        ):
            patient_bsa = Decimal(
                str(
                    round(
                        sqrt(
                            (
                                float(patient_profile.height_cm)
                                * float(patient_profile.weight_kg)
                            )
                            / 3600
                        ),
                        3,
                    )
                )
            )

        latest_lab = LabResult.objects.filter(patient=case.patient).order_by("-tested_at").first()

        for regimen_drug in regimen_drugs:
            calculated_dose = None
            final_dose = None
            target_auc = None
            renal_value = None
            patient_weight = None

            if patient_profile and patient_profile.weight_kg:
                patient_weight = Decimal(str(patient_profile.weight_kg))

            if regimen_drug.dose_basis == "FIXED":
                calculated_dose = regimen_drug.dose
                final_dose = calculated_dose

            elif regimen_drug.dose_basis == "MG_PER_M2" and patient_bsa is not None:
                calculated_dose = (regimen_drug.dose * patient_bsa).quantize(Decimal("0.001"))
                final_dose = calculated_dose

            elif regimen_drug.dose_basis == "MG_PER_KG" and patient_weight is not None:
                calculated_dose = (regimen_drug.dose * patient_weight).quantize(Decimal("0.001"))
                final_dose = calculated_dose

            elif regimen_drug.dose_basis == "AUC":
                target_auc = regimen_drug.dose

                if latest_lab and latest_lab.egfr is not None:
                    renal_value = latest_lab.egfr

                calculated_dose = None
                final_dose = None

            elif regimen_drug.dose_basis == "OTHER":
                calculated_dose = None
                final_dose = None

            PrescriptionItem.objects.create(
                prescription=prescription,
                drug=regimen_drug.drug,
                standard_dose=regimen_drug.dose,
                dose_basis=regimen_drug.dose_basis,
                patient_bsa=patient_bsa,
                target_auc=target_auc,
                renal_value=renal_value,
                calculated_dose=calculated_dose,
                final_dose=final_dose,
                unit=regimen_drug.drug.strength_unit or "mg",
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
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=None,
        responses={200: DoctorPrescriptionSerializer},
    )
    @transaction.atomic
    def post(self, request, case_id, prescription_id):
        prescription = (
            Prescription.objects
            .select_related(
                "case",
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

        if safety_results.filter(result="BLOCK").exists():
            return Response(
                {"detail": "BLOCK Safety 결과가 있어 처방을 확정할 수 없습니다."},
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

@extend_schema(tags=["호흡기내과-처방관리"])
class DoctorSafetyWarningAcknowledgeAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

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

        note = request.data.get("acknowledgment_note", "")

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
    permission_classes = [IsAuthenticated]

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
    def patch(self, request, case_id, prescription_id, item_id):
        prescription = (
            Prescription.objects
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

        if "final_dose" in request.data:
            try:
                final_dose = Decimal(str(request.data["final_dose"]))
            except Exception:
                return Response({"detail": "final_dose는 숫자여야 합니다."}, status=400)

            if final_dose < 0:
                return Response({"detail": "final_dose는 0 이상이어야 합니다."}, status=400)

            item.final_dose = final_dose

        if "instructions" in request.data:
            item.instructions = request.data["instructions"]

        item.save(
            update_fields=[
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
    permission_classes = [IsAuthenticated]

    @extend_schema(request=None, responses={200: DoctorPrescriptionSerializer})
    @transaction.atomic
    def post(self, request, case_id, prescription_id):
        prescription = (
            Prescription.objects
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

        if prescription.prescription_status != "DRAFT":
            return Response(
                {"detail": "DRAFT 상태의 처방만 Safety Check를 수행할 수 있습니다."},
                status=400,
            )

        patient = prescription.case.patient

        # 기존 Safety 결과 초기화 후 재검사
        prescription.safety_check_results.all().delete()

        patient_profile = PatientHealthProfile.objects.filter(patient=patient).first()
        allergies = patient_profile.allergies if patient_profile and isinstance(patient_profile.allergies, list) else []
        allergy_names = {str(allergy).strip().lower() for allergy in allergies}

        active_medications = CurrentMedication.objects.filter(
            patient=patient,
            is_active=True,
        )

        latest_lab = (
            LabResult.objects
            .filter(patient=patient)
            .order_by("-tested_at")
            .first()
        )

        # 1. 현재 복용약과 처방약 성분 중복 확인
        for item in prescription.items.all():
            ingredient = item.drug.ingredient_name

            duplicated = active_medications.filter(
                ingredient_name__iexact=ingredient,
            ).exists()

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

            # 알레르기 검사
            ingredient = (item.drug.ingredient_name or "").strip()
            drug_name = (item.drug.drug_name or "").strip()

            allergy_match = (
                ingredient.lower() in allergy_names
                or drug_name.lower() in allergy_names
            )

            SafetyCheckResult.objects.create(
                prescription=prescription,
                prescription_item=item,
                check_type="ALLERGY",
                result="BLOCK" if allergy_match else "PASS",
                message=(
                    f"{ingredient or drug_name} 성분/약물이 환자 알레르기 정보와 일치합니다."
                    if allergy_match
                    else f"{ingredient or drug_name} 관련 등록된 알레르기가 확인되지 않았습니다."
                ),
                source="INTERNAL_RULE_V1",
                source_code="ALLERGY_CHECK",
                checked_at=timezone.now(),
            )

        # 2. 신장기능 검사 데이터 존재 여부 확인
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
                "신장기능 검토에 필요한 최근 Creatinine/eGFR 결과가 있습니다."
                if renal_data_available
                else "최근 Creatinine/eGFR 결과가 없어 추가 검토가 필요합니다."
            ),
            source="INTERNAL_RULE_V1",
            source_code="RENAL_DATA_CHECK",
            checked_at=timezone.now(),
        )

        # 3. 간기능 검사 데이터 존재 여부 확인
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
                "간기능 검토에 필요한 최근 AST/ALT/Bilirubin 결과가 있습니다."
                if hepatic_data_available
                else "최근 간기능 검사 결과가 부족하여 추가 검토가 필요합니다."
            ),
            source="INTERNAL_RULE_V1",
            source_code="HEPATIC_DATA_CHECK",
            checked_at=timezone.now(),
        )

        has_block = prescription.safety_check_results.filter(result="BLOCK").exists()

        if not has_block:
            prescription.prescription_status = "VALIDATED"
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

    def get_queryset(self):
        case = LungCancerCase.objects.filter(id=self.kwargs["case_id"], primary_doctor=self.request.user, case_status="ACTIVE").first()

        if case is None:
            return TreatmentRule.objects.none()

        rules = TreatmentRule.objects.select_related("regimen").all()

        pathology_result = ClinicalResult.objects.filter(case=case, stage="PATHOLOGY", result_status="CONFIRMED").select_related("pathology_detail").order_by("-confirmed_at").first()

        tnm_result = ClinicalResult.objects.filter(case=case, stage="STAGING", result_status="CONFIRMED").select_related("tnm_detail").order_by("-confirmed_at").first()

        gene_result = ClinicalResult.objects.filter(case=case, stage="GENE", result_status="CONFIRMED").select_related("gene_detail", "pdl1_detail").prefetch_related("gene_detail__gene_findings").order_by("-confirmed_at").first()

        histology = None
        stage_group = None
        positive_genes = set()
        pdl1_tps = None

        if pathology_result and hasattr(pathology_result, "pathology_detail"):
            histology = pathology_result.pathology_detail.histologic_type

        if tnm_result and hasattr(tnm_result, "tnm_detail"):
            stage_group = tnm_result.tnm_detail.stage_group

        if gene_result and hasattr(gene_result, "gene_detail"):
            positive_genes = {
                finding.gene_symbol.upper()
                for finding in gene_result.gene_detail.gene_findings.all()
                if finding.assessment == "LIKELY_POSITIVE"
            }

        if gene_result and hasattr(gene_result, "pdl1_detail"):
            pdl1_tps = gene_result.pdl1_detail.tps_percent

        if histology:
            rules = rules.filter(histology__iexact=histology)

        matched_rule_ids = []

        for rule in rules:
            stage_condition = rule.stage_condition or {}
            allowed_stages = stage_condition.get("stage", [])

            if stage_group and allowed_stages and stage_group not in allowed_stages:
                continue

            biomarker_condition = rule.biomarker_condition or {}
            required_positive_genes = {
                str(gene).upper()
                for gene in biomarker_condition.get("positive", [])
            }

            if required_positive_genes and not required_positive_genes.issubset(positive_genes):
                continue

            pdl1_condition = rule.pdl1_condition or {}

            if pdl1_tps is not None:
                minimum = pdl1_condition.get("min")
                maximum = pdl1_condition.get("max")

                if minimum is not None and pdl1_tps < minimum:
                    continue

                if maximum is not None and pdl1_tps > maximum:
                    continue

            matched_rule_ids.append(rule.id)

        return rules.filter(id__in=matched_rule_ids).order_by("priority", "rule_code")
    

    def get_serializer_context(self):
        context = super().get_serializer_context()

        case = LungCancerCase.objects.filter(
            id=self.kwargs["case_id"],
            primary_doctor=self.request.user,
            case_status="ACTIVE",
        ).first()

        histology = None
        stage_group = None
        positive_genes = set()
        pdl1_tps = None

        if case:
            pathology_result = ClinicalResult.objects.filter(
                case=case,
                stage="PATHOLOGY",
                result_status="CONFIRMED",
            ).select_related("pathology_detail").order_by("-confirmed_at").first()

            tnm_result = ClinicalResult.objects.filter(
                case=case,
                stage="STAGING",
                result_status="CONFIRMED",
            ).select_related("tnm_detail").order_by("-confirmed_at").first()

            gene_result = ClinicalResult.objects.filter(
                case=case,
                stage="GENE",
                result_status="CONFIRMED",
            ).select_related("gene_detail", "pdl1_detail").prefetch_related("gene_detail__gene_findings").order_by("-confirmed_at").first()

            if pathology_result and hasattr(pathology_result, "pathology_detail"):
                histology = pathology_result.pathology_detail.histologic_type

            if tnm_result and hasattr(tnm_result, "tnm_detail"):
                stage_group = tnm_result.tnm_detail.stage_group

            if gene_result and hasattr(gene_result, "gene_detail"):
                positive_genes = {
                    finding.gene_symbol.upper()
                    for finding in gene_result.gene_detail.gene_findings.all()
                    if finding.assessment == "LIKELY_POSITIVE"
                }

            if gene_result and hasattr(gene_result, "pdl1_detail"):
                pdl1_tps = gene_result.pdl1_detail.tps_percent

        context.update({
            "histology": histology,
            "stage_group": stage_group,
            "positive_genes": positive_genes,
            "pdl1_tps": pdl1_tps,
        })

        return context