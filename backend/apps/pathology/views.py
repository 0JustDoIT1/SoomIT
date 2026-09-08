from django.db import transaction
from django.db.models import Case, Count, IntegerField, Q, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai_results.models import AiAnalysis
from apps.cases.models import LungCancerCase
from apps.clinical.models import ClinicalResult

from .models import PathologySpecimen, PathologyWorkItem, WholeSlideImage
from .serializers import (
    PathologyAiAnalysisSerializer,
    PathologyDiagnosisSerializer,
    PathologyDiagnosisConfirmSerializer,
    PathologyDiagnosisWriteSerializer,
    PathologyReportSerializer,
    PathologySpecimenSerializer,
    PathologyWorkItemSerializer,
    WholeSlideImageSerializer,
)


class CasePathologyDiagnosisListAPIView(ListAPIView):
    serializer_class = PathologyDiagnosisSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            ClinicalResult.objects.filter(
                case_id=self.kwargs["case_id"],
                stage="PATHOLOGY",
            )
            .select_related(
                "pathology_detail",
                "confirmed_by_user",
            )
            .order_by("-confirmed_at", "-updated_at")
        )

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        case = get_object_or_404(LungCancerCase, id=self.kwargs["case_id"])
        serializer = PathologyDiagnosisWriteSerializer(
            data=request.data,
            context={"case": case},
        )
        serializer.is_valid(raise_exception=True)
        diagnosis = serializer.save()
        return Response(
            PathologyDiagnosisSerializer(diagnosis).data,
            status=status.HTTP_201_CREATED,
        )


class CasePathologyReportListAPIView(ListAPIView):
    serializer_class = PathologyReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            ClinicalResult.objects.filter(
                case_id=self.kwargs["case_id"],
                stage="PATHOLOGY",
                result_status=ClinicalResult.ResultStatus.CONFIRMED,
                pathology_detail__isnull=False,
            )
            .select_related(
                "case",
                "case__patient",
                "source_image_asset",
                "source_image_asset__whole_slide_image",
                "source_image_asset__whole_slide_image__specimen",
                "confirmed_by_user",
                "pathology_detail",
            )
            .order_by("-confirmed_at", "-updated_at")
        )


class PathologyDiagnosisDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, diagnosis_id):
        return get_object_or_404(
            ClinicalResult.objects.select_related(
                "pathology_detail",
                "confirmed_by_user",
            ),
            id=diagnosis_id,
            stage="PATHOLOGY",
        )

    @transaction.atomic
    def patch(self, request, diagnosis_id):
        diagnosis = self.get_object(diagnosis_id)
        serializer = PathologyDiagnosisWriteSerializer(
            diagnosis,
            data=request.data,
            partial=True,
            context={"case": diagnosis.case},
        )
        serializer.is_valid(raise_exception=True)
        diagnosis = serializer.save()
        return Response(PathologyDiagnosisSerializer(diagnosis).data)


class PathologyDiagnosisConfirmAPIView(PathologyDiagnosisDetailAPIView):
    @transaction.atomic
    def post(self, request, diagnosis_id):
        diagnosis = self.get_object(diagnosis_id)
        serializer = PathologyDiagnosisConfirmSerializer(
            data=request.data,
            context={"diagnosis": diagnosis},
        )
        serializer.is_valid(raise_exception=True)
        work_item = serializer.context["work_item"]

        if diagnosis.result_status != ClinicalResult.ResultStatus.CONFIRMED:
            diagnosis.result_status = ClinicalResult.ResultStatus.CONFIRMED
            diagnosis.confirmed_by_user = request.user
            diagnosis.confirmed_at = timezone.now()
            diagnosis.save(
                update_fields=[
                    "result_status",
                    "confirmed_by_user",
                    "confirmed_at",
                    "updated_at",
                ],
            )
        if work_item.status != PathologyWorkItem.Status.COMPLETED:
            work_item.status = PathologyWorkItem.Status.COMPLETED
            work_item.completed_at = diagnosis.confirmed_at or timezone.now()
            work_item.save(
                update_fields=["status", "completed_at", "updated_at"],
            )
        return Response(PathologyDiagnosisSerializer(diagnosis).data)


class CasePathologyAiAnalysisListAPIView(ListAPIView):
    serializer_class = PathologyAiAnalysisSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            AiAnalysis.objects.filter(
                case_id=self.kwargs["case_id"],
                analysis_type="PATHOLOGY_DIAGNOSIS",
            )
            .select_related(
                "case",
                "model_version",
                "ai_result",
                "ai_result__pathology_detail",
            )
            .order_by("-created_at")
        )


class CaseSpecimenAdequacyAiAnalysisListAPIView(ListAPIView):
    serializer_class = PathologyAiAnalysisSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            AiAnalysis.objects.filter(
                case_id=self.kwargs["case_id"],
                analysis_type="SPECIMEN_ADEQUACY",
            )
            .select_related(
                "case",
                "model_version",
                "ai_result",
                "ai_result__specimen_adequacy_detail",
            )
            .order_by("-created_at")
        )


class PathologyWorkItemListAPIView(ListAPIView):
    serializer_class = PathologyWorkItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = (
            PathologyWorkItem.objects.select_related(
                "case",
                "case__patient",
                "specimen",
                "wsi",
                "assigned_to",
            )
            .annotate(
                priority_order=Case(
                    When(priority="CRITICAL", then=0),
                    When(priority="REVIEW_REQUIRED", then=1),
                    When(priority="NORMAL", then=2),
                    default=3,
                    output_field=IntegerField(),
                )
            )
            .order_by("priority_order", "due_at", "-created_at")
        )

        status_value = self.request.query_params.get("status")
        priority_value = self.request.query_params.get("priority")
        task_type_value = self.request.query_params.get("task_type")
        assigned_to_value = self.request.query_params.get("assigned_to")

        if status_value:
            queryset = queryset.filter(status=status_value)

        if priority_value:
            queryset = queryset.filter(priority=priority_value)

        if task_type_value:
            queryset = queryset.filter(task_type=task_type_value)

        if assigned_to_value:
            queryset = queryset.filter(assigned_to_id=assigned_to_value)

        return queryset


class PathologyWorkItemDetailAPIView(RetrieveAPIView):
    queryset = PathologyWorkItem.objects.select_related(
        "case",
        "case__patient",
        "specimen",
        "wsi",
        "assigned_to",
    )
    serializer_class = PathologyWorkItemSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "id"


class CasePathologySpecimenListAPIView(ListAPIView):
    serializer_class = PathologySpecimenSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            PathologySpecimen.objects.filter(
                case_id=self.kwargs["case_id"],
            )
            .select_related(
                "case",
                "case__patient",
                "examination_order",
                "created_by_user",
            )
            .annotate(
               wsi_count=Count(
                              "wsis",
                    filter=Q(wsis__is_current=True),
                     )
            )
            .order_by("-received_at", "-created_at")
        )


class SpecimenWholeSlideImageListAPIView(ListAPIView):
    serializer_class = WholeSlideImageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            WholeSlideImage.objects.filter(
                specimen_id=self.kwargs["specimen_id"],
            )
            .select_related(
                "specimen",
                "image_asset",
                "uploaded_by_user",
            )
            .order_by("slide_code", "-version")
        )
