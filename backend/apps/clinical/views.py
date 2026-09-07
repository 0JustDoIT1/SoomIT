from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.cases.models import LungCancerCase
from apps.patients.models import Patient

from .models import ClinicalResult, TreatmentDecision
from .serializers import (
    DoctorClinicalResultSerializer,
    DoctorTreatmentDecisionSerializer,
    PatientClinicalResultSerializer,
)


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