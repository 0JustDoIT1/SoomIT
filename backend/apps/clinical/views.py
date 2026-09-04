from rest_framework.generics import ListAPIView

from apps.patients.models import Patient

from .models import ClinicalResult
from .serializers import PatientClinicalResultSerializer
from drf_spectacular.utils import extend_schema


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
        