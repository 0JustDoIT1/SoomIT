from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.cases.models import LungCancerCase

from .models import AiAnalysis
from .serializers import DoctorAiAnalysisSerializer

@extend_schema(tags=["호흡기내과-AI분석"])
class DoctorAiAnalysisListAPIView(ListAPIView):
    serializer_class = DoctorAiAnalysisSerializer
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
            return AiAnalysis.objects.none()

        return (
            AiAnalysis.objects
            .filter(case=case)
            .select_related(
                "case",
                "model_version",
                "ai_result",
                "ai_result__xray_detail",
                "ai_result__ct_detail",
                "ai_result__specimen_adequacy_detail",
                "ai_result__pathology_detail",
                "ai_result__tnm_detail",
                "ai_result__treatment_detail",
            )
            .prefetch_related(
                "ai_result__ct_detail__nodule_results",
                "ai_result__gene_ai_results",
            )
            .order_by("-created_at")
        )