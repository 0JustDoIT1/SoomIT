from django.db.models import Exists, OuterRef, Prefetch
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.permissions import (
    IsActiveStaff,
    IsRadiologyStaff,
    IsTechnologist,
    get_token_hospital_id,
)
from apps.ai_results.models import AiAnalysis
from apps.cases.models import CaseImageAsset, ExaminationOrder
from apps.clinical.models import ClinicalResult
from apps.patients.models import Appointment

from .serializers import RadiologyWorklistQuerySerializer, RadiologyWorklistSerializer


class RadiologyWorklistAPIView(ListAPIView):
    serializer_class = RadiologyWorklistSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [
        IsAuthenticated,
        IsActiveStaff,
        IsTechnologist,
        IsRadiologyStaff,
    ]

    def get_queryset(self):
        query_serializer = RadiologyWorklistQuerySerializer(data=self.request.query_params)
        query_serializer.is_valid(raise_exception=True)
        filters = query_serializer.validated_data

        hospital_id = get_token_hospital_id(self.request)
        if hospital_id is None:
            raise PermissionDenied("병원 정보가 확인되지 않습니다.")

        confirmed_review = ClinicalResult.objects.filter(
            reviewed_ai_result__ai_analysis_id=OuterRef("pk"),
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
        )
        analysis_queryset = (
            AiAnalysis.objects.select_related("ai_result", "model_version")
            .annotate(has_confirmed_review=Exists(confirmed_review))
            .order_by("-created_at")
        )
        image_queryset = CaseImageAsset.objects.order_by("-created_at").prefetch_related(
            Prefetch(
                "ai_analyses",
                queryset=analysis_queryset,
                to_attr="worklist_ai_analyses",
            ),
        )
        appointment_queryset = Appointment.objects.exclude(
            appointment_status=Appointment.AppointmentStatus.CANCELLED,
        ).order_by("scheduled_at")

        queryset = (
            ExaminationOrder.objects.filter(
                case__patient__hospital_id=hospital_id,
                exam_type__in=[
                    ExaminationOrder.ExamType.XRAY,
                    ExaminationOrder.ExamType.CT,
                ],
            )
            .select_related(
                "case",
                "case__patient",
                "case__patient__hospital",
                "case__primary_doctor",
                "requesting_doctor",
            )
            .prefetch_related(
                Prefetch(
                    "appointments",
                    queryset=appointment_queryset,
                    to_attr="worklist_appointments",
                ),
                Prefetch(
                    "image_assets",
                    queryset=image_queryset,
                    to_attr="worklist_image_assets",
                ),
            )
            .order_by("-created_at")
        )

        if "exam_type" in filters:
            queryset = queryset.filter(exam_type=filters["exam_type"])
        if "status" in filters:
            queryset = queryset.filter(status=filters["status"])
        if "priority" in filters:
            queryset = queryset.filter(priority=filters["priority"])

        if "date_from" in filters or "date_to" in filters:
            appointment_filters = {
                "appointments__appointment_status__in": [
                    Appointment.AppointmentStatus.REQUESTED,
                    Appointment.AppointmentStatus.CONFIRMED,
                ],
            }
            if "date_from" in filters:
                appointment_filters["appointments__scheduled_at__date__gte"] = filters[
                    "date_from"
                ]
            if "date_to" in filters:
                appointment_filters["appointments__scheduled_at__date__lte"] = filters[
                    "date_to"
                ]
            queryset = queryset.filter(**appointment_filters).distinct()

        return queryset
