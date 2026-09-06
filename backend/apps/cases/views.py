from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.generics import ListAPIView, RetrieveAPIView

from .models import LungCancerCase
from .serializers import (
    DoctorLungCancerCaseSerializer,
    LungCancerCaseDetailSerializer,
    LungCancerCaseSerializer,
)


# 원무과 - Case 목록 조회
class LungCancerCaseListAPIView(ListAPIView):
    queryset = (
        LungCancerCase.objects
        .select_related("patient")
        .all()
        .order_by("-created_at")
    )
    serializer_class = LungCancerCaseSerializer


# 원무과 - Case 상세 조회
class LungCancerCaseDetailAPIView(RetrieveAPIView):
    queryset = (
        LungCancerCase.objects
        .select_related("patient")
        .all()
    )
    serializer_class = LungCancerCaseDetailSerializer
    lookup_field = "id"


# 호흡기내과 - 내 담당 Case 목록 조회
class DoctorLungCancerCaseListAPIView(ListAPIView):
    serializer_class = DoctorLungCancerCaseSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            LungCancerCase.objects
            .select_related("patient", "primary_doctor")
            .filter(
                primary_doctor=self.request.user,
                case_status="ACTIVE",
            )
            .order_by("-updated_at")
        )