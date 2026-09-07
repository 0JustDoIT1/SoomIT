from django.db import transaction
from django.utils import timezone

from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.cases.models import ClinicianDecision, LungCancerCase
from apps.patients.models import Patient, PatientHealthProfile

from .models import (
    ClinicalResult,
    Prescription,
    PrescriptionItem,
    RegimenDrug,
    TreatmentDecision,
)
from .serializers import (
    DoctorClinicalResultSerializer,
    DoctorPrescriptionSerializer,
    DoctorTreatmentDecisionSerializer,
    PatientClinicalResultSerializer,
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
                "gene_detail__findings",
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
            return Response(
                {"detail": "저장된 치료 결정이 없습니다."},
                status=404,
            )

        serializer = DoctorTreatmentDecisionSerializer(treatment_decision)
        return Response(serializer.data)

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

        clinical_result, _ = ClinicalResult.objects.get_or_create(
            case=case,
            stage="TREATMENT",
            defaults={
                "result_status": "DRAFT",
            },
        )

        treatment_decision = (
            TreatmentDecision.objects
            .filter(clinical_result=clinical_result)
            .first()
        )

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

        for regimen_drug in regimen_drugs:
            calculated_dose = None
            final_dose = None

            if (
                regimen_drug.dose_basis == "MG_PER_M2"
                and patient_bsa is not None
            ):
                calculated_dose = (
                    regimen_drug.dose * patient_bsa
                ).quantize(Decimal("0.001"))

                final_dose = calculated_dose

            PrescriptionItem.objects.create(
                prescription=prescription,
                drug=regimen_drug.drug,
                standard_dose=regimen_drug.dose,
                dose_basis=regimen_drug.dose_basis,
                patient_bsa=patient_bsa,
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

        if prescription.prescription_status == "FINAL":
            return Response(
                {"detail": "이미 최종 확정된 처방입니다."},
                status=400,
            )

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

        if prescription.prescription_status != "DRAFT":
            return Response(
                {"detail": "DRAFT 상태의 처방만 수정할 수 있습니다."},
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
            item.final_dose = request.data["final_dose"]

        if "instructions" in request.data:
            item.instructions = request.data["instructions"]

        item.save(
            update_fields=[
                "final_dose",
                "instructions",
                "updated_at",
            ]
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