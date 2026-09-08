from django.db import transaction
from django.db.models import Case, Count, IntegerField, Q, When
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.utils import timezone
from decimal import Decimal
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.ai_results.models import AiAnalysis, AiResult, AnalysisType, ModelVersion, PDL1AiResult
from apps.cases.models import LungCancerCase
from apps.clinical.models import ClinicalResult

from .models import PathologySpecimen, PathologyWorkItem, WholeSlideImage
from .serializers import (
    PathologyAiAnalysisSerializer,
    PDL1AnalysisRunSerializer,
    PathologyDiagnosisSerializer,
    PathologyDiagnosisConfirmSerializer,
    PathologyDiagnosisWriteSerializer,
    PathologyReportSerializer,
    PathologySpecimenSerializer,
    PathologyWorkItemSerializer,
    WholeSlideImageSerializer,
)
from .services.pdl1_inference import PDL1InferenceError, request_pdl1_prediction
from .services.orthanc import OrthancError, get_wsi_pyramid, get_wsi_tile


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


class CasePDL1AiAnalysisListAPIView(ListAPIView):
    serializer_class = PathologyAiAnalysisSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            AiAnalysis.objects.filter(
                case_id=self.kwargs["case_id"],
                analysis_type="PDL1_CLASSIFICATION",
            )
            .select_related(
                "case",
                "model_version",
                "ai_result",
                "ai_result__pdl1_detail",
            )
            .order_by("-created_at")
        )


class CasePDL1AnalysisRunAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, case_id):
        case = get_object_or_404(LungCancerCase, id=case_id)
        serializer = PDL1AnalysisRunSerializer(
            data=request.data,
            context={"case": case},
        )
        serializer.is_valid(raise_exception=True)
        feature_file = serializer.validated_data["feature_file"]
        wsi_id = serializer.validated_data.get("wsi_id")
        source_image_asset = None
        if wsi_id:
            source_image_asset = WholeSlideImage.objects.get(id=wsi_id).image_asset

        model_version, _ = ModelVersion.objects.get_or_create(
            model_name="pdl1-amd-mil",
            version="final_model",
            defaults={"analysis_type": AnalysisType.PDL1_CLASSIFICATION},
        )
        analysis = AiAnalysis.objects.create(
            case=case,
            source_image_asset=source_image_asset,
            analysis_type=AnalysisType.PDL1_CLASSIFICATION,
            model_version=model_version,
            status=AiAnalysis.Status.RUNNING,
            started_at=timezone.now(),
            input_metadata={
                "feature_filename": feature_file.name,
                "feature_size_bytes": feature_file.size,
                "wsi_id": str(wsi_id) if wsi_id else None,
            },
        )

        try:
            prediction = request_pdl1_prediction(feature_file.read())
        except PDL1InferenceError as exc:
            analysis.status = AiAnalysis.Status.FAILED
            analysis.completed_at = timezone.now()
            analysis.error_message = str(exc)
            analysis.save(update_fields=["status", "completed_at", "error_message"])
            return Response(
                {"analysis_id": str(analysis.id), "detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        with transaction.atomic():
            ai_result = AiResult.objects.create(
                ai_analysis=analysis,
                schema_version="1.0",
                result_payload={
                    "main_index": prediction.get("main_index"),
                    "pdl1_image_id": prediction.get("pdl1_image_id"),
                    "patch_count": prediction.get("patch_count"),
                    "predicted_class": prediction["predicted_class"],
                    "predicted_tps_range": prediction["predicted_tps_range"],
                    "confidence": prediction["confidence"],
                    "probabilities": prediction["probabilities"],
                },
            )
            PDL1AiResult.objects.create(
                ai_result=ai_result,
                predicted_class=prediction["predicted_class"],
                predicted_tps_range=prediction["predicted_tps_range"],
                confidence=Decimal(str(prediction["confidence"])),
                probabilities=prediction["probabilities"],
            )
            analysis.status = AiAnalysis.Status.SUCCEEDED
            analysis.completed_at = timezone.now()
            analysis.error_message = None
            analysis.save(update_fields=["status", "completed_at", "error_message"])

        analysis = AiAnalysis.objects.select_related(
            "case", "model_version", "ai_result", "ai_result__pdl1_detail",
        ).get(id=analysis.id)
        return Response(
            PathologyAiAnalysisSerializer(analysis).data,
            status=status.HTTP_201_CREATED,
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


class WholeSlideImagePyramidAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, wsi_id):
        wsi = get_object_or_404(WholeSlideImage, id=wsi_id)
        if not wsi.orthanc_series_id:
            return Response(
                {"detail": "이 WSI에 Orthanc series가 연결되지 않았습니다."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            pyramid = get_wsi_pyramid(wsi.orthanc_series_id)
        except OrthancError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        tile_template = (
            f"{request.scheme}://{request.get_host()}"
            f"/api/pathology/wsis/{wsi.id}/tiles/{{level}}/{{x}}/{{y}}/"
        )
        return Response(
            {
                "wsi_id": str(wsi.id),
                "orthanc_series_id": wsi.orthanc_series_id,
                "width": pyramid["TotalWidth"],
                "height": pyramid["TotalHeight"],
                "tile_width": pyramid["TileWidth"],
                "tile_height": pyramid["TileHeight"],
                "resolutions": pyramid["Resolutions"],
                "sizes": pyramid["Sizes"],
                "tile_url_template": tile_template,
            },
        )


class WholeSlideImageTileAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, wsi_id, level, x, y):
        wsi = get_object_or_404(WholeSlideImage, id=wsi_id)
        if not wsi.orthanc_series_id:
            return Response(
                {"detail": "이 WSI에 Orthanc series가 연결되지 않았습니다."},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            tile = get_wsi_tile(wsi.orthanc_series_id, level, x, y)
        except OrthancError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        response = HttpResponse(tile.content, content_type=tile.content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response
