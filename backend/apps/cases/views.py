from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.knowledge.services.medgemma_client import MedgemmaServiceError

from .models import LungCancerCase
from .serializers import (
    DoctorLungCancerCaseDetailSerializer,
    DoctorLungCancerCaseSerializer,
    LungCancerCaseDetailSerializer,
    LungCancerCaseSerializer,
    MedicalOpinionRequestSerializer,
    MedicalOpinionResponseSerializer,
)
from .services.medical_opinion import NoConfirmedClinicalResults, generate_medical_opinion


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

# 호흡기내과 - 내 담당 Case 상세 조회
class DoctorLungCancerCaseDetailAPIView(RetrieveAPIView):
    serializer_class = DoctorLungCancerCaseDetailSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    lookup_field = "id"

    def get_queryset(self):
        return (
            LungCancerCase.objects
            .select_related("patient", "primary_doctor")
            .filter(
                primary_doctor=self.request.user,
                case_status="ACTIVE",
            )
        )


class DoctorMedicalOpinionAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, case_id):
        request_serializer = MedicalOpinionRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        case = (
            LungCancerCase.objects.select_related("patient", "patient__health_profile")
            .filter(
                id=case_id,
                primary_doctor=request.user,
                case_status=LungCancerCase.CaseStatus.ACTIVE,
            )
            .first()
        )
        if case is None:
            return Response(
                {"detail": "담당 중인 케이스를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            result = generate_medical_opinion(
                case,
                instruction=request_serializer.validated_data["instruction"],
            )
        except NoConfirmedClinicalResults as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except MedgemmaServiceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(
            MedicalOpinionResponseSerializer(result).data,
            status=status.HTTP_200_OK,
        )
