from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.cases.models import LungCancerCase
from apps.patients.models import Patient

from .models import ClinicalResult
from .serializers import (
    DoctorClinicalResultSerializer,
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