import json
import logging
import re
import time

from django.db import transaction
from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page

from apps.accounts.permissions import IsActiveStaff, IsDoctor, IsPulmonologyStaff, get_token_hospital_id
from apps.accounts.models import User
from apps.notifications.services import create_in_app_staff_notifications
from apps.pathology.models import PathologySpecimen, PathologyWorkItem, WholeSlideImage
from apps.pathology.tasks import generate_wsi_preview_task, register_wsi_with_orthanc_task
from apps.patients.models import Appointment
from apps.pathology.services.orthanc import (
    OrthancError,
    get_wsi_pyramid,
    get_wsi_tile,
    get_wsi_tile_grid,
)
from apps.pathology.services.pathology_storage import (
    PathologyStorageError,
    download_pathology_wsi_preview,
    download_pathology_wsi_tissue_heatmap,
)
from apps.knowledge.services.medgemma_client import MedgemmaServiceError
from apps.knowledge.services.medgemma_client import request_chat_completion
from apps.clinical.models import ClinicalResult, GeneFinding, Prescription, TreatmentDecision, XrayResult
from apps.clinical.gene_alterations import CANONICAL_ALTERATIONS
from apps.clinical.serializers import DoctorClinicalResultSerializer, DoctorPathologyGeneReviewSerializer, DoctorPdl1ReviewSerializer
from apps.radiology.models import RadiologyReview
from apps.clinical.views import DoctorTreatmentEvidenceAPIView
from apps.radiology.services.xray_storage import XrayStorageError, download_xray_image_bytes
from apps.radiology.services.ct_cornerstone_storage import CtCornerstoneStorageError, download_ct_cornerstone_object
from apps.radiology.services.ct_visualization_storage import CtVisualizationStorageError, download_ct_visualization
from apps.radiology.services.orthanc_dicomweb import (
    OrthancDicomWebError,
    get_series_metadata,
    list_series_instances,
    retrieve_instance,
    retrieve_instance_frame,
    retrieve_series,
)

from .models import CaseConsultationRequest, CaseImageAsset, ClinicianDecision, DoctorDashboardMemo, ExaminationOrder, LungCancerCase, PhysicianTreatmentOpinion, TreatmentAIOpinion, WorkflowStage
from apps.ai_results.models import AiAnalysis, AnalysisType
from .serializers import (
    DoctorCaseImageAssetSerializer,
    DoctorLungCancerCaseDetailSerializer,
    DoctorLungCancerCaseSerializer,
    LungCancerCaseDetailSerializer,
    LungCancerCaseSerializer,
    MedicalOpinionRequestSerializer,
    MedicalOpinionResponseSerializer,
    TreatmentOpinionRequestSerializer,
    TreatmentAIOpinionSerializer,
    PhysicianTreatmentOpinionSerializer,
    PhysicianTreatmentOpinionWriteSerializer,
    FollowUpPathologyOrderCreateSerializer,
    ExaminationOrderCreateSerializer,
    ExaminationOrderUpdateSerializer,
    DoctorCaseWorkflowDecisionSerializer,
    DoctorXrayWorkflowSerializer,
    DoctorCaseConsultationRequestSerializer,
    DoctorCaseConsultationResponseSerializer,
    DoctorDashboardMemoSerializer,
    DoctorDashboardMemoWriteSerializer,
)
from .services.examination_orders import (
    ExaminationOrderCreationError,
    ExaminationOrderUpdateError,
    cancel_examination_order,
    create_examination_order,
    update_examination_order,
)


class _BinaryPassthroughContentNegotiation(BaseContentNegotiation):
    def select_parser(self, request, parsers):
        return parsers[0] if parsers else None

    def select_renderer(self, request, renderers, format_suffix):
        return renderers[0], renderers[0].media_type
from .services.medical_opinion import NoConfirmedClinicalResults, generate_medical_opinion
from .services.case_assistant import (
    CaseAssistantNotConfigured,
    CaseAssistantServiceError,
    ask_case_assistant,
    ask_dashboard_assistant,
    build_case_context,
    build_dashboard_context,
    dashboard_case_references,
)
from .services.pathology_orders import (
    ACTIVE_ORDER_STATUSES,
    PathologyOrderCreationError,
    create_follow_up_pathology_order,
    has_active_pathology_order,
    has_pathology_gene_review_completed,
)


logger = logging.getLogger(__name__)


# 원무과 - Case 목록 조회
class LungCancerCaseListAPIView(ListAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff]
    queryset = (
        LungCancerCase.objects
        .select_related("patient")
        .all()
        .order_by("-created_at")
    )
    serializer_class = LungCancerCaseSerializer

    def get_queryset(self):
        return super().get_queryset().filter(
            patient__hospital_id=self.request.user.department_role.department.hospital_id,
        )


# 원무과 - Case 상세 조회
class LungCancerCaseDetailAPIView(RetrieveAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff]
    queryset = (
        LungCancerCase.objects
        .select_related("patient")
        .all()
    )
    serializer_class = LungCancerCaseDetailSerializer
    lookup_field = "id"

    def get_queryset(self):
        return super().get_queryset().filter(
            patient__hospital_id=self.request.user.department_role.department.hospital_id,
        )


# 호흡기내과 - 내 담당 Case 목록 조회
class DoctorLungCancerCaseListAPIView(ListAPIView):
    serializer_class = DoctorLungCancerCaseSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = (
            LungCancerCase.objects
            .select_related("patient", "primary_doctor")
            .filter(
                primary_doctor=self.request.user,
            )
            .order_by("-updated_at")
        )
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(patient__name__icontains=search)
                | Q(patient__patient_code__icontains=search)
                | Q(case_code__icontains=search)
            )
        return queryset

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
            )
        )


class DoctorCaseImageAssetListAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get(self, request, case_id):
        case = get_object_or_404(
            LungCancerCase,
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
            patient__hospital_id=get_token_hospital_id(request),
        )
        assets = CaseImageAsset.objects.filter(
            case=case,
            workflow_stage__in=[
                WorkflowStage.XRAY,
                WorkflowStage.CT,
                WorkflowStage.PET_CT_TNM,
            ],
        ).order_by("-created_at")
        return Response(DoctorCaseImageAssetSerializer(assets, many=True).data)


class DoctorCaseImageAssetPreviewAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]
    content_negotiation_class = _BinaryPassthroughContentNegotiation

    def get(self, request, case_id, asset_id):
        case = get_object_or_404(
            LungCancerCase,
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
            patient__hospital_id=get_token_hospital_id(request),
        )
        asset = get_object_or_404(
            CaseImageAsset,
            id=asset_id,
            case=case,
            workflow_stage=WorkflowStage.XRAY,
            image_type=CaseImageAsset.ImageType.XRAY,
            storage_type=CaseImageAsset.StorageType.GCS,
            status=CaseImageAsset.Status.READY,
        )
        try:
            image_bytes = download_xray_image_bytes(asset.storage_uri)
        except XrayStorageError:
            return Response(
                {"detail": "X-ray 영상을 불러오지 못했습니다."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        content_type = "image/png" if asset.file_format.upper() == "PNG" else "image/jpeg"
        return HttpResponse(image_bytes, content_type=content_type)


def _doctor_case_or_404(request, case_id):
    return get_object_or_404(
        LungCancerCase,
        id=case_id,
        primary_doctor=request.user,
        case_status=LungCancerCase.CaseStatus.ACTIVE,
        patient__hospital_id=get_token_hospital_id(request),
    )


def _doctor_slide_or_404(request, slide_id):
    return get_object_or_404(
        WholeSlideImage.objects.select_related("image_asset", "specimen", "specimen__case", "specimen__case__patient"),
        id=slide_id,
        is_current=True,
        specimen__case__primary_doctor=request.user,
        specimen__case__case_status=LungCancerCase.CaseStatus.ACTIVE,
        specimen__case__patient__hospital_id=get_token_hospital_id(request),
    )


def _doctor_slide_summary(slide):
    return {
        "id": slide.id,
        "specimen_id": slide.specimen_id,
        "image_asset_id": slide.image_asset_id,
        "slide_code": slide.slide_code,
        "block_code": slide.block_code,
        "stain": slide.stain,
        "mpp": slide.mpp,
        "status": slide.image_asset.status,
        "viewer_url": f"/api/doctor/slides/{slide.id}/viewer/",
    }


class DoctorCasePathologySpecimenListAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get(self, request, case_id):
        case = _doctor_case_or_404(request, case_id)
        specimens = PathologySpecimen.objects.filter(case=case).prefetch_related("wsis").order_by("-received_at", "-created_at")
        return Response([
            {
                "id": specimen.id,
                "case_id": specimen.case_id,
                "examination_order_id": specimen.examination_order_id,
                "specimen_code": specimen.specimen_code,
                "specimen_type": specimen.specimen_type,
                "body_site": specimen.body_site,
                "collected_at": specimen.collected_at,
                "received_at": specimen.received_at,
                "status": specimen.status,
                "slide_count": sum(1 for slide in specimen.wsis.all() if slide.is_current),
            }
            for specimen in specimens
        ])


class DoctorSpecimenSlideListAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get(self, request, specimen_id):
        specimen = get_object_or_404(
            PathologySpecimen.objects.select_related("case", "case__patient"),
            id=specimen_id,
            case__primary_doctor=request.user,
            case__case_status=LungCancerCase.CaseStatus.ACTIVE,
            case__patient__hospital_id=get_token_hospital_id(request),
        )
        slides = WholeSlideImage.objects.filter(specimen=specimen, is_current=True).select_related("image_asset").order_by("slide_code")
        return Response([_doctor_slide_summary(slide) for slide in slides])


def _orthanc_error_response(exc):
    if exc.upstream_status == 404:
        response_status = status.HTTP_404_NOT_FOUND
    elif exc.upstream_status == 409:
        response_status = status.HTTP_409_CONFLICT
    else:
        response_status = status.HTTP_502_BAD_GATEWAY
    return Response({"detail": str(exc)}, status=response_status)


class DoctorSlideViewerAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]
    content_negotiation_class = _BinaryPassthroughContentNegotiation

    def get(self, request, slide_id):
        slide = _doctor_slide_or_404(request, slide_id)
        if not slide.orthanc_series_id:
            try:
                register_wsi_with_orthanc_task.delay(str(slide.id))
            except Exception:
                logger.exception("Failed to enqueue WSI Orthanc repair for slide_id=%s", slide.id)
            return Response(
                {
                    "detail": "WSI viewer is not ready for this slide.",
                    "code": "ORTHANC_SERIES_NOT_LINKED",
                    "repair_requested": True,
                },
                status=status.HTTP_202_ACCEPTED,
            )
        try:
            pyramid = get_wsi_pyramid(slide.orthanc_series_id)
        except OrthancError as exc:
            return _orthanc_error_response(exc)
        base = f"/api/doctor/slides/{slide.id}"
        return Response({
            "slide_id": slide.id,
            "viewer_type": "WSI",
            "width": pyramid["TotalWidth"],
            "height": pyramid["TotalHeight"],
            "tile_size": pyramid["TileWidth"],
            "tile_width": pyramid["TileWidth"],
            "tile_height": pyramid["TileHeight"],
            "max_level": max(len(pyramid["Resolutions"]) - 1, 0),
            "resolutions": pyramid["Resolutions"],
            "sizes": pyramid["Sizes"],
            "tile_counts": [
                get_wsi_tile_grid(pyramid, level)
                for level in range(len(pyramid["Sizes"]))
            ],
            "mpp": slide.mpp,
            "thumbnail_url": f"{base}/thumbnail/",
            "tile_url_template": f"{base}/tiles/{{level}}/{{x}}/{{y}}.jpg",
        })


class DoctorSlidePreviewAPIView(APIView):
    """Expose the stored WSI preview independently of its Orthanc linkage."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]
    content_negotiation_class = _BinaryPassthroughContentNegotiation

    def get(self, request, slide_id):
        slide = _doctor_slide_or_404(request, slide_id)
        try:
            content, content_type = download_pathology_wsi_preview(
                slide.image_asset.storage_uri,
            )
        except PathologyStorageError as exc:
            should_enqueue = getattr(request, "query_params", {}).get("repair") != "0"
            if should_enqueue:
                try:
                    generate_wsi_preview_task.delay(str(slide.id))
                except Exception:
                    logger.exception("Failed to enqueue WSI preview repair for slide_id=%s", slide.id)
                    return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
            return Response(
                {
                    "detail": "WSI preview generation has been queued.",
                    "code": "WSI_PREVIEW_QUEUED",
                    "repair_requested": should_enqueue,
                },
                status=status.HTTP_202_ACCEPTED,
            )
        response = HttpResponse(content, content_type=content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class DoctorSlideThumbnailAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get(self, request, slide_id):
        slide = _doctor_slide_or_404(request, slide_id)
        if not slide.orthanc_series_id:
            return Response({"detail": "WSI viewer is not ready for this slide."}, status=status.HTTP_409_CONFLICT)
        try:
            pyramid = get_wsi_pyramid(slide.orthanc_series_id)
            tile = get_wsi_tile(slide.orthanc_series_id, max(len(pyramid["Resolutions"]) - 1, 0), 0, 0)
        except OrthancError as exc:
            return _orthanc_error_response(exc)
        response = HttpResponse(tile.content, content_type=tile.content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class DoctorSlideTissueHeatmapAPIView(APIView):
    """Expose an existing pathology AI heatmap only to the assigned Case team."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]
    content_negotiation_class = _BinaryPassthroughContentNegotiation

    def get(self, request, slide_id):
        slide = _doctor_slide_or_404(request, slide_id)
        try:
            content, content_type = download_pathology_wsi_tissue_heatmap(
                slide.image_asset.storage_uri,
            )
        except PathologyStorageError:
            return HttpResponse(status=status.HTTP_204_NO_CONTENT)
        response = HttpResponse(content, content_type=content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class DoctorSlideTileAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get(self, request, slide_id, level, x, y):
        slide = _doctor_slide_or_404(request, slide_id)
        if not slide.orthanc_series_id:
            return Response({"detail": "WSI viewer is not ready for this slide."}, status=status.HTTP_409_CONFLICT)
        try:
            pyramid = get_wsi_pyramid(slide.orthanc_series_id)
            grid = get_wsi_tile_grid(pyramid, level)
            if x < 0 or y < 0 or x >= grid["columns"] or y >= grid["rows"]:
                raise OrthancError(
                    "요청한 WSI tile 좌표가 범위를 벗어났습니다.",
                    upstream_status=404,
                    reason="invalid_tile",
                )
            tile = get_wsi_tile(slide.orthanc_series_id, level, x, y)
        except OrthancError as exc:
            return _orthanc_error_response(exc)
        response = HttpResponse(tile.content, content_type=tile.content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class _DicomPassthroughContentNegotiation(BaseContentNegotiation):
    def select_parser(self, request, parsers):
        return parsers[0] if parsers else None

    def select_renderer(self, request, renderers, format_suffix):
        return renderers[0], renderers[0].media_type


def _doctor_dicom_asset_or_404(request, case_id, asset_id):
    case = _doctor_case_or_404(request, case_id)
    return get_object_or_404(
        CaseImageAsset,
        id=asset_id,
        case=case,
        image_type__in=[CaseImageAsset.ImageType.CT, CaseImageAsset.ImageType.PET],
        storage_type=CaseImageAsset.StorageType.ORTHANC,
        status=CaseImageAsset.Status.READY,
    )


@method_decorator(gzip_page, name="dispatch")
class DoctorCaseDicomWebMetadataAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]
    content_negotiation_class = _DicomPassthroughContentNegotiation

    def get(self, request, case_id, asset_id):
        asset = _doctor_dicom_asset_or_404(request, case_id, asset_id)
        if not asset.study_instance_uid or not asset.series_instance_uid:
            return Response({"detail": "DICOM Series metadata is not ready."}, status=status.HTTP_409_CONFLICT)
        try:
            result = get_series_metadata(asset.study_instance_uid, asset.series_instance_uid)
        except OrthancDicomWebError:
            return Response({"detail": "DICOM Series metadata를 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        response = HttpResponse(result.content, content_type=result.content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class DoctorCaseDicomWebInstancesAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]
    content_negotiation_class = _DicomPassthroughContentNegotiation

    def get(self, request, case_id, asset_id):
        asset = _doctor_dicom_asset_or_404(request, case_id, asset_id)
        if not asset.study_instance_uid or not asset.series_instance_uid:
            return Response({"detail": "DICOM Series metadata is not ready."}, status=status.HTTP_409_CONFLICT)
        try:
            result = list_series_instances(asset.study_instance_uid, asset.series_instance_uid)
        except OrthancDicomWebError:
            return Response({"detail": "DICOM instance 목록을 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        return HttpResponse(result.content, content_type=result.content_type)


class DoctorCaseDicomWebInstanceAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]
    content_negotiation_class = _DicomPassthroughContentNegotiation

    def get(self, request, case_id, asset_id, sop_instance_uid):
        asset = _doctor_dicom_asset_or_404(request, case_id, asset_id)
        if not asset.study_instance_uid or not asset.series_instance_uid:
            return Response({"detail": "DICOM Series metadata is not ready."}, status=status.HTTP_409_CONFLICT)
        try:
            result = retrieve_instance(asset.study_instance_uid, asset.series_instance_uid, sop_instance_uid)
        except OrthancDicomWebError:
            return Response({"detail": "DICOM instance를 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        response = HttpResponse(result.content, content_type=result.content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class DoctorCaseDicomWebFrameAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]
    content_negotiation_class = _DicomPassthroughContentNegotiation

    def get(self, request, case_id, asset_id, sop_instance_uid, frame_number):
        asset = _doctor_dicom_asset_or_404(request, case_id, asset_id)
        if not asset.study_instance_uid or not asset.series_instance_uid:
            return Response({"detail": "DICOM Series metadata is not ready."}, status=status.HTTP_409_CONFLICT)
        try:
            result = retrieve_instance_frame(
                asset.study_instance_uid,
                asset.series_instance_uid,
                sop_instance_uid,
                frame_number,
            )
        except OrthancDicomWebError:
            return Response({"detail": "DICOM frame could not be loaded."}, status=status.HTTP_502_BAD_GATEWAY)
        response = HttpResponse(result.content, content_type=result.content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class DoctorCaseDicomWebSeriesAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]
    content_negotiation_class = _DicomPassthroughContentNegotiation

    def get(self, request, case_id, asset_id):
        asset = _doctor_dicom_asset_or_404(request, case_id, asset_id)
        if not asset.study_instance_uid or not asset.series_instance_uid:
            return Response({"detail": "DICOM Series metadata is not ready."}, status=status.HTTP_409_CONFLICT)
        try:
            result = retrieve_series(asset.study_instance_uid, asset.series_instance_uid)
        except OrthancDicomWebError:
            return Response({"detail": "CT Series를 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        response = HttpResponse(result.content, content_type=result.content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class DoctorCaseCtAnalysisMixin:
    def get_ct_analysis(self, request, case_id, analysis_id):
        case = _doctor_case_or_404(request, case_id)
        return get_object_or_404(
            AiAnalysis.objects.select_related("ai_result", "source_image_asset"),
            id=analysis_id,
            case=case,
            analysis_type=AnalysisType.CT_ANALYSIS,
            status=AiAnalysis.Status.SUCCEEDED,
        )


def _ct_segmentation_storage_error_response(error):
    message = str(error).lower()
    if "credentials" in message:
        category = "credentials_unavailable"
        response_status = status.HTTP_503_SERVICE_UNAVAILABLE
        detail = "Segmentation artifact storage is temporarily unavailable."
    elif "denied" in message:
        category = "permission_denied"
        response_status = status.HTTP_503_SERVICE_UNAVAILABLE
        detail = "Segmentation artifact storage is temporarily unavailable."
    elif "not found" in message:
        category = "object_not_found"
        response_status = status.HTTP_404_NOT_FOUND
        detail = "Segmentation artifact was not found."
    elif "invalid" in message:
        category = "uri_configuration_error"
        response_status = status.HTTP_502_BAD_GATEWAY
        detail = "Segmentation artifact configuration is invalid."
    else:
        category = "storage_unavailable"
        response_status = status.HTTP_502_BAD_GATEWAY
        detail = "Segmentation artifact storage is temporarily unavailable."
    logger.warning("CT segmentation artifact load failed category=%s", category)
    return Response({"detail": detail}, status=response_status)


class DoctorCaseCtSegmentationAPIView(DoctorCaseCtAnalysisMixin, APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get(self, request, case_id, analysis_id):
        analysis = self.get_ct_analysis(request, case_id, analysis_id)
        payload = analysis.ai_result.result_payload if hasattr(analysis, "ai_result") else None
        segmentation = payload.get("cornerstone_segmentation") if isinstance(payload, dict) else None
        if not isinstance(segmentation, dict) or not segmentation.get("geometry_uri"):
            return Response({"detail": "CT 분할 결과가 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        try:
            geometry = json.loads(download_ct_cornerstone_object(segmentation["geometry_uri"]).decode("utf-8"))
        except CtCornerstoneStorageError as exc:
            return _ct_segmentation_storage_error_response(exc)
        except (ValueError, UnicodeDecodeError):
            logger.warning("CT segmentation artifact load failed category=invalid_geometry")
            return Response(
                {"detail": "Segmentation geometry is invalid."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({
            "schema_version": segmentation.get("schema_version"),
            "scalar_type": segmentation.get("scalar_type"),
            "dimensions": segmentation.get("dimensions"),
            "spacing": geometry.get("spacing"),
            "origin": geometry.get("origin"),
            "direction": geometry.get("direction"),
            "segments": segmentation.get("segments", []),
        })


class DoctorCaseCtSegmentationLabelmapAPIView(DoctorCaseCtAnalysisMixin, APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]
    content_negotiation_class = _DicomPassthroughContentNegotiation

    def get(self, request, case_id, analysis_id):
        analysis = self.get_ct_analysis(request, case_id, analysis_id)
        payload = analysis.ai_result.result_payload if hasattr(analysis, "ai_result") else None
        segmentation = payload.get("cornerstone_segmentation") if isinstance(payload, dict) else None
        if not isinstance(segmentation, dict) or not segmentation.get("labelmap_uri"):
            return Response({"detail": "CT 분할 결과가 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        try:
            content = download_ct_cornerstone_object(segmentation["labelmap_uri"])
        except CtCornerstoneStorageError as exc:
            return _ct_segmentation_storage_error_response(exc)
        response = HttpResponse(content, content_type="application/octet-stream")
        response["Cache-Control"] = "private, max-age=3600"
        return response


class DoctorCaseCtVisualizationAPIView(DoctorCaseCtAnalysisMixin, APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get(self, request, case_id, analysis_id, layer_id=None):
        analysis = self.get_ct_analysis(request, case_id, analysis_id)
        payload = analysis.ai_result.result_payload if hasattr(analysis, "ai_result") else None
        visualization = payload.get("visualization") if isinstance(payload, dict) else None
        layers = visualization.get("layers", []) if isinstance(visualization, dict) else []
        if not isinstance(layers, list):
            return Response({"detail": "CT 3D 결과가 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        if layer_id is None:
            return Response({"layers": [
                {
                    **{key: value for key, value in layer.items() if key != "mesh_uri"},
                    "mesh_url": f"/api/doctor/cases/{case_id}/ct-analyses/{analysis_id}/visualization/{layer.get('id')}/",
                }
                for layer in layers if isinstance(layer, dict) and layer.get("id") and layer.get("mesh_uri")
            ]})
        layer = next((item for item in layers if isinstance(item, dict) and item.get("id") == layer_id), None)
        if layer is None or not layer.get("mesh_uri"):
            return Response({"detail": "CT 3D 레이어가 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        try:
            content = download_ct_visualization(layer["mesh_uri"])
        except CtVisualizationStorageError:
            return Response({"detail": "CT 3D 레이어를 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        response = HttpResponse(content, content_type="model/gltf-binary")
        response["Cache-Control"] = "private, max-age=3600"
        return response


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


class DoctorCaseAssistantAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def post(self, request, case_id):
        from .serializers import DoctorCaseAssistantRequestSerializer
        serializer = DoctorCaseAssistantRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        context = build_case_context(case_id, request.user, get_token_hospital_id(request))
        if context is None:
            return Response({"detail": "담당 중인 활성 Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        try:
            result = ask_case_assistant(context, serializer.validated_data["message"], serializer.validated_data["history"])
        except CaseAssistantNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except CaseAssistantServiceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({"answer": result["answer"], "case_id": str(case_id), "context_used": result.get("context_used", [])})


class DoctorDashboardAssistantAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def post(self, request):
        from .serializers import DoctorCaseAssistantRequestSerializer

        serializer = DoctorCaseAssistantRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        context = build_dashboard_context(request.user, get_token_hospital_id(request))
        try:
            result = ask_dashboard_assistant(
                context,
                serializer.validated_data["message"],
                serializer.validated_data["history"],
            )
        except CaseAssistantNotConfigured as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except CaseAssistantServiceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response(
            {
                "answer": result["answer"],
                "case_references": dashboard_case_references(result["answer"], context),
                "context_used": result.get("context_used", []),
            }
        )


class DoctorDashboardMemoAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def _case(self, request, case_id):
        return get_object_or_404(
            LungCancerCase,
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
            patient__hospital_id=get_token_hospital_id(request),
        )

    def get(self, request, case_id):
        case = self._case(request, case_id)
        memo = DoctorDashboardMemo.objects.filter(case=case, author=request.user).first()
        if memo is None:
            return Response({"content": "", "updated_at": None})
        return Response(DoctorDashboardMemoSerializer(memo).data)

    def put(self, request, case_id):
        serializer = DoctorDashboardMemoWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        case = self._case(request, case_id)
        content = serializer.validated_data["content"].strip()

        if not content:
            DoctorDashboardMemo.objects.filter(case=case, author=request.user).delete()
            return Response({"content": "", "updated_at": None})

        memo, _ = DoctorDashboardMemo.objects.update_or_create(
            case=case,
            author=request.user,
            defaults={"content": content},
        )
        return Response(DoctorDashboardMemoSerializer(memo).data)


class DoctorTreatmentOpinionAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
    OPINION_SCHEMA_KEYS = {
        "xray_summary",
        "ct_summary",
        "staging_summary",
        "pathology_biomarker_summary",
        "treatment_summary",
        "safety_follow_up",
    }
    SYSTEM_PROMPT = (
        "Draft a concise longitudinal clinician-review opinion using every supplied confirmed result "
        "from chest X-ray, chest CT, PET-CT/TNM, pathology, gene testing and PD-L1, followed by the "
        "selected treatment plan, prescription and safety data. Preserve the chronological diagnostic "
        "reasoning and clearly distinguish confirmed findings from unavailable findings. "
        "Use Treatment Rule and NCI evidence only to explain the already selected treatment. "
        "Do not invent findings or biomarkers, recommend a new regimen, alter doses, or change safety results. "
        "Write every value in Korean. Return valid JSON only, without Markdown fences or commentary. "
        "Use exactly these keys: xray_summary, ct_summary, staging_summary, "
        "pathology_biomarker_summary, treatment_summary, safety_follow_up. "
        "Write one short Korean sentence per key, retaining critical findings, uncertainty and safety warnings. "
        "Do not repeat the same findings in multiple sections."
    )
    KOREAN_REPAIR_PROMPT = (
        "아래 진료 종합 소견의 모든 자연어 내용을 간결한 한국어로 변환하세요. "
        "의학적 의미와 수치, 약물명은 바꾸지 마세요. "
        "xray_summary, ct_summary, staging_summary, pathology_biomarker_summary, "
        "treatment_summary, safety_follow_up 키를 사용하는 "
        "유효한 JSON만 반환하고 Markdown 코드블록이나 부가 설명은 쓰지 마세요."
    )

    @staticmethod
    def _is_korean_opinion(opinion):
        return isinstance(opinion, str) and re.search(r"[가-힣]", opinion) is not None

    @classmethod
    def _is_current_opinion(cls, opinion):
        if not cls._is_korean_opinion(opinion):
            return False
        try:
            parsed = json.loads(opinion)
        except (TypeError, ValueError):
            return False
        return isinstance(parsed, dict) and cls.OPINION_SCHEMA_KEYS.issubset(parsed)

    @staticmethod
    def _case(request, case_id):
        return LungCancerCase.objects.filter(
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
        ).first()

    @staticmethod
    def _confirmed_clinical_journey(case):
        """Return every confirmed diagnostic result in workflow order for the final opinion."""
        results_manager = getattr(case, "clinical_results", None)
        if results_manager is None:
            return []
        stage_order = {
            WorkflowStage.XRAY: 0,
            WorkflowStage.CT: 1,
            WorkflowStage.PET_CT_TNM: 2,
            WorkflowStage.PATHOLOGY_GENE: 3,
            WorkflowStage.PDL1: 4,
        }
        results = results_manager.filter(
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
        ).select_related(
            "xray_detail", "ct_detail", "pathology_detail", "tnm_detail",
            "gene_detail", "pdl1_detail", "reviewed_ai_result",
        ).prefetch_related(
            "gene_detail__gene_findings", "reviewed_ai_result__gene_ai_results",
        ).order_by("confirmed_at", "created_at")
        serialized = list(DoctorClinicalResultSerializer(results, many=True).data)
        return sorted(serialized, key=lambda item: stage_order.get(item.get("workflow_stage"), 99))

    @staticmethod
    def _opinion_prompt_context(journey, evidence, draft_context, prescription, safety):
        # Keep all clinical details, dates and source passages. UI labels/IDs and
        # excerpts duplicating the full retrieved context are not model input.
        clinical_journey = [
            {key: item[key] for key in ("workflow_stage", "result_date", "result_detail") if key in item}
            for item in journey
        ]
        retrieved = evidence["evidence"]
        prompt_evidence = {
            key: value for key, value in retrieved.items()
            if key != "sources" and value is not None
        }
        prompt_evidence["sources"] = [
            {key: value for key, value in source.items()
             if key != "distance" and (key != "excerpt" or not retrieved.get("context"))}
            for source in retrieved.get("sources", [])
        ]
        return {"confirmed_clinical_journey": clinical_journey,
            "clinical_context": evidence["clinical_context"], "regimen": evidence["regimen"],
            "treatment_rule": evidence["treatment_rule"], "evidence": prompt_evidence,
            "draft_treatment": {
                "treatment_type": draft_context.get("treatment_type", ""),
                "treatment_plan": draft_context.get("treatment_plan", ""),
            }, "prescription": prescription, "safety": safety}

    @staticmethod
    def _confirmed_data_fallback(journey, evidence, draft_context, safety_data):
        """Build a readable longitudinal narrative from confirmed values only."""
        def stage_detail(stage, key):
            result = next((item for item in journey if item.get("workflow_stage") == stage), {})
            return (result.get("result_detail") or {}).get(key) or {}

        def text(value):
            return str(value).strip() if value is not None else ""

        def finish(value):
            value = text(value)
            if not value:
                return ""
            return value if value[-1] in ".!?。" else f"{value}."

        def narrative(*sentences):
            values = [finish(value) for value in sentences if text(value)]
            return " ".join(values) if values else "확정된 결과가 없습니다."

        def unique(values):
            output = []
            seen = set()
            for value in values:
                value = text(value)
                if value and value.casefold() not in seen:
                    seen.add(value.casefold())
                    output.append(value)
            return output

        action_labels = {
            "NO_FURTHER_ACTION": "추가 조치 없이 경과 관찰",
            "CHEST_CT": "흉부 CT 추가 검사",
            "REPEAT_XRAY": "흉부 X-ray 재검",
        }
        treatment_labels = {
            "CHEMOTHERAPY": "항암화학요법",
            "TARGETED_THERAPY": "표적치료",
            "IMMUNOTHERAPY": "면역치료",
            "COMBINATION": "병합치료",
            "RADIATION": "방사선치료",
            "SURGERY": "수술",
            "SUPPORTIVE_CARE": "완화치료",
            "OBSERVATION": "경과관찰",
            "OTHER": "기타 치료",
        }
        safety_labels = {
            "safety_not_run": "처방 안전성 검토 전",
            "safety_completed": "처방 안전성 검토 완료",
            "unresolved_warning": "미해결 안전성 경고 있음",
            "block_present": "처방 차단 항목 있음",
        }
        regimen_labels = {"Osimertinib": "오시머티닙"}
        alteration_labels = {
            "EXON19DEL": "exon 19 결실",
            "EXON19_DEL": "exon 19 결실",
            "EXON_19_DEL": "exon 19 결실",
            "EX19_DEL": "exon 19 결실",
            "EGFR_EX19_DEL": "exon 19 결실",
            "EGFR_EXON19DEL": "exon 19 결실",
            "EGFR_EXON19_DEL": "exon 19 결실",
            "L858R": "L858R 변이",
        }
        pathology_labels = {
            "LUAD": "폐선암",
            "ADENOCARCINOMA": "폐선암",
            "LUSC": "폐편평상피암",
            "SQUAMOUS_CELL_CARCINOMA": "폐편평상피암",
        }

        xray = stage_detail(WorkflowStage.XRAY, "xray")
        ct = stage_detail(WorkflowStage.CT, "ct")
        tnm = stage_detail(WorkflowStage.PET_CT_TNM, "tnm")
        pathology = stage_detail(WorkflowStage.PATHOLOGY_GENE, "pathology")
        gene = stage_detail(WorkflowStage.PATHOLOGY_GENE, "gene")
        pdl1 = stage_detail(WorkflowStage.PDL1, "pdl1")

        nodule_descriptions = []
        for observation in ct.get("nodule_observations") or []:
            location = text(observation.get("lobe_label") or observation.get("location_description"))
            size = observation.get("max_diameter_mm")
            number = observation.get("nodule_no")
            description = f"{location + '에 ' if location else ''}"
            description += f"{number}번 결절" if number is not None else "결절"
            if size is not None:
                description += f"(최대 {size} mm)"
            if observation.get("malignancy_risk") is not None:
                description += f", 악성 위험도 {observation.get('malignancy_risk')}%"
            nodule_descriptions.append(description)

        positive_genes = []
        indeterminate_genes = []
        negative_gene_count = 0
        for finding in gene.get("findings") or []:
            assessment = text(finding.get("assessment")).upper()
            gene_symbol = text(finding.get("gene_symbol"))
            alteration_code = text(finding.get("alteration_code"))
            alteration = alteration_labels.get(alteration_code.upper(), alteration_code)
            finding_label = " ".join(part for part in [gene_symbol, alteration] if part)
            if gene_symbol and not alteration:
                finding_label = f"{gene_symbol} 변이"
            if assessment == "LIKELY_POSITIVE":
                positive_genes.append(finding_label or gene_symbol)
            elif assessment == "INDETERMINATE":
                indeterminate_genes.append(finding_label or gene_symbol)
            elif assessment == "LIKELY_NEGATIVE":
                negative_gene_count += 1

        regimen = evidence.get("regimen") or {}
        regimen_name = text(regimen.get("name"))
        localized_regimen = regimen_labels.get(regimen_name, regimen_name)
        regimen_code = text(regimen.get("code"))
        regimen_display = localized_regimen
        if localized_regimen and regimen_code:
            regimen_display = f"{localized_regimen}({regimen_code})"
        treatment_type = treatment_labels.get(
            text(draft_context.get("treatment_type")).upper(),
            text(draft_context.get("treatment_type")),
        )
        warnings = [
            result.get("message")
            for result in safety_data.get("results") or []
            if result.get("result") in {"WARNING", "BLOCK"} and result.get("message")
        ]

        xray_assessment = text(xray.get("assessment_label") or xray.get("assessment"))
        xray_finding = text(xray.get("finding_summary"))
        xray_finding = xray_finding.replace("결절의심", "결절 의심").replace("결절발견", "결절 발견")
        xray_action = action_labels.get(text(xray.get("recommended_action")), text(xray.get("recommended_action")))
        xray_result = xray_finding or (f"{xray_assessment} 소견" if xray_assessment else "")

        ct_finding = ", ".join(nodule_descriptions) or text(ct.get("finding_summary"))
        ct_assessment = text(ct.get("overall_assessment_label") or ct.get("overall_assessment"))
        ct_assessment = ct_assessment.replace("결절의심", "결절 의심").replace("결절발견", "결절 발견")
        ct_risk = ct.get("overall_malignancy_risk")

        tnm_categories = " ".join(filter(None, [
            text(tnm.get("t_category")), text(tnm.get("n_category")), text(tnm.get("m_category")),
        ]))
        stage_group = text(tnm.get("stage_group"))

        pathology_terms = unique([
            pathology_labels.get(text(value).upper(), value)
            for value in [pathology.get("histologic_type"), pathology.get("subtype"), pathology.get("diagnosis_summary")]
        ])
        pathology_diagnosis = ", ".join(pathology_terms)
        malignancy = text(pathology.get("malignancy_status_label") or pathology.get("malignancy_status"))

        biomarker_sentences = []
        if positive_genes:
            gene_priority = {"EGFR": 0, "ALK": 1, "ROS1": 2, "BRAF": 3, "KRAS": 4, "MET": 5, "RET": 6}
            positive_genes = sorted(
                unique(positive_genes),
                key=lambda value: gene_priority.get(value.split(" ", 1)[0].upper(), 99),
            )
            biomarker_sentences.append(f"유전자 검사에서 {' 및 '.join(positive_genes)} 소견이 확인되었다")
        if indeterminate_genes:
            biomarker_sentences.append(f"{', '.join(unique(indeterminate_genes))}은 판정불가로 추가 확인이 필요하다")
        if negative_gene_count:
            biomarker_sentences.append(
                f"그 외 검사된 주요 유전자 {negative_gene_count}개에서는 양성 변이가 확인되지 않았다"
            )
        if pdl1.get("tps_percent") is not None:
            biomarker_sentences.append(f"PD-L1 TPS는 {pdl1.get('tps_percent')}%로 확정되었다")
        elif text(pdl1.get("indeterminate_reason")):
            biomarker_sentences.append(f"PD-L1은 {text(pdl1.get('indeterminate_reason'))} 사유로 판정불가이다")

        clinical_basis = unique([
            f"Stage {stage_group}" if stage_group else None,
            pathology_diagnosis,
            *positive_genes,
        ])
        treatment_plan = text(draft_context.get("treatment_plan"))
        if treatment_plan in {"예정", "계획", "진행 예정"}:
            treatment_plan_sentence = f"{treatment_type or '치료'}를 진행할 예정이다"
        else:
            treatment_plan_sentence = f"세부 치료계획은 {treatment_plan}" if treatment_plan else ""

        safety_status = text(safety_data.get("safety_status")) or "safety_not_run"
        safety_status_label = safety_labels.get(safety_status, safety_status)
        summaries = {
            "xray_summary": narrative(
                f"흉부 X-ray에서 {xray_result}이 확인되었다" if xray_result else None,
                f"이에 따라 {xray_action}를 권고하였다" if xray_action else None,
            ),
            "ct_summary": narrative(
                f"후속 흉부 CT에서 {ct_finding}가 확인되었다" if ct_finding else None,
                f"전체 악성 위험도는 {ct_risk}%로 평가되었다" if ct_risk is not None else
                f"영상 판정은 {ct_assessment}이다" if ct_assessment and not ct_finding else
                f"악성 위험도는 {ct_risk}%로 평가되었다" if ct_risk is not None else None,
            ),
            "staging_summary": narrative(
                f"병기 평가를 위해 시행한 PET-CT/TNM 검토 결과 {tnm_categories}, Stage {stage_group}로 확정되었다"
                if tnm_categories and stage_group else
                f"PET-CT/TNM 검토 결과 {tnm_categories or stage_group}로 확정되었다"
                if tnm_categories or stage_group else None,
            ),
            "pathology_biomarker_summary": narrative(
                f"조직검사에서 {'악성 ' if malignancy == '악성' else ''}{pathology_diagnosis}이 확인되었다"
                if pathology_diagnosis else f"조직검사 결과는 {malignancy}이다" if malignancy else None,
                *biomarker_sentences,
            ),
            "treatment_summary": narrative(
                f"이상의 {', '.join(clinical_basis)} 결과를 근거로 {regimen_display} {treatment_type}를 선택하였다"
                if clinical_basis and regimen_display else
                f"{regimen_display} {treatment_type}를 선택하였다" if regimen_display else None,
                treatment_plan_sentence,
            ),
            "safety_follow_up": narrative(
                f"현재 상태는 '{safety_status_label}'이다",
                f"확인된 주의사항은 {'; '.join(warnings)}이다" if warnings else "기록된 처방 차단 또는 미해결 경고는 없다",
                "치료 시작 전 의료진의 최종 안전성 확인과 치료계획에 따른 추적 관찰이 필요하다",
            ),
        }
        return json.dumps(summaries, ensure_ascii=False, default=str)

    def get(self, request, case_id):
        case = self._case(request, case_id)
        if case is None:
            return Response({"detail": "담당 중인 활성 Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        opinion = TreatmentAIOpinion.objects.filter(case=case).first()
        if (
            opinion is None
            or not self._is_current_opinion(opinion.opinion)
            or (
                opinion.status.startswith("CONFIRMED_DATA_FALLBACK")
                and opinion.status != "CONFIRMED_DATA_FALLBACK_V3"
            )
        ):
            return Response({
                "case_id": str(case.id),
                "status": "NOT_GENERATED",
                "opinion": None,
                "sources": [],
                "safety_status": "",
                "review_required": True,
                "created_at": None,
                "updated_at": None,
            })
        return Response(TreatmentAIOpinionSerializer(opinion).data)

    def post(self, request, case_id):
        request_serializer = TreatmentOpinionRequestSerializer(data=request.data or {})
        request_serializer.is_valid(raise_exception=True)
        draft_context = request_serializer.validated_data
        started = time.perf_counter()
        evidence_response = DoctorTreatmentEvidenceAPIView().build_response(
            request,
            case_id,
            selected_regimen_id=draft_context.get("selected_regimen"),
            generate_summary=False,
        )
        logger.info("treatment_opinion stage=evidence elapsed_seconds=%.3f", time.perf_counter() - started)
        if evidence_response.status_code != status.HTTP_200_OK:
            return evidence_response
        evidence = evidence_response.data
        if evidence.get("status") != "AVAILABLE":
            return Response(evidence, status=status.HTTP_400_BAD_REQUEST)
        case = self._case(request, case_id)
        if case is None:
            return Response({"detail": "담당 중인 활성 Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        existing_opinion = TreatmentAIOpinion.objects.filter(case=case).first()
        confirmed_decision = TreatmentDecision.objects.filter(
            clinical_result__case=case,
            clinical_result__result_status=ClinicalResult.ResultStatus.CONFIRMED,
        ).exists()
        if (
            confirmed_decision
            and existing_opinion is not None
            and not (
                existing_opinion.status.startswith("CONFIRMED_DATA_FALLBACK")
                and existing_opinion.status != "CONFIRMED_DATA_FALLBACK_V3"
            )
            and self._is_current_opinion(existing_opinion.opinion)
        ):
            return Response(TreatmentAIOpinionSerializer(existing_opinion).data)
        prescription = Prescription.objects.filter(case=case).prefetch_related("items__drug", "safety_check_results").order_by("-created_at").first()
        prescription_data = {"prescription_available": prescription is not None}
        safety_data = {"safety_status": "safety_not_run", "results": []}
        if prescription:
            items = list(prescription.items.all())
            prescription_data.update({"status": prescription.prescription_status, "phase": prescription.phase,
                "cycle_number": prescription.cycle_number, "items": [{"drug": item.drug.drug_name,
                "final_dose": item.final_dose, "calculated_dose": item.calculated_dose, "unit": item.unit,
                "route": item.route, "administration_day": item.administration_day, "frequency": item.frequency} for item in items]})
            results = list(prescription.safety_check_results.all())
            safety_data["results"] = [{"check_type": r.check_type, "result": r.result, "source": r.source,
                "source_code": r.source_code, "message": r.message, "acknowledged": r.acknowledged_at is not None} for r in results]
            safety_data["safety_status"] = ("block_present" if any(r.result == "BLOCK" for r in results)
                else "unresolved_warning" if any(r.result == "WARNING" and r.acknowledged_at is None for r in results)
                else "safety_completed") if results else "safety_not_run"
        clinical_journey = self._confirmed_clinical_journey(case)
        prompt_context = self._opinion_prompt_context(
            clinical_journey, evidence, draft_context, prescription_data, safety_data,
        )
        prompt_json = json.dumps(prompt_context, ensure_ascii=False, default=str, separators=(',', ':'))
        generation_started = time.perf_counter()
        logger.info("treatment_opinion stage=preparation elapsed_seconds=%.3f prompt_chars=%d",
                    generation_started - started, len(prompt_json))
        try:
            opinion = request_chat_completion([{"role": "system", "content": self.SYSTEM_PROMPT},
                {"role": "user", "content": prompt_json}], max_tokens=900, temperature=0)
            if not self._is_current_opinion(opinion):
                opinion = request_chat_completion([
                    {"role": "system", "content": self.KOREAN_REPAIR_PROMPT},
                    {"role": "user", "content": opinion},
                ], max_tokens=900, temperature=0)
        except MedgemmaServiceError as exc:
            logger.warning("MedGemma treatment opinion failed; using confirmed-data fallback: %s", exc)
            opinion = self._confirmed_data_fallback(clinical_journey, evidence, draft_context, safety_data)
            opinion_status = "CONFIRMED_DATA_FALLBACK_V3"
        else:
            opinion_status = "AVAILABLE"
        logger.info("treatment_opinion stage=generation elapsed_seconds=%.3f",
                    time.perf_counter() - generation_started)
        if not self._is_current_opinion(opinion):
            return Response({"status": "MEDGEMMA_FORMAT_ERROR", "review_required": True}, status=502)
        saved_opinion, _ = TreatmentAIOpinion.objects.update_or_create(
            case=case,
            defaults={
                "status": opinion_status,
                "opinion": opinion,
                "sources": evidence["evidence"]["sources"],
                "safety_status": safety_data["safety_status"],
                "review_required": True,
                "selected_regimen_id": draft_context.get("selected_regimen"),
                "treatment_type": draft_context.get("treatment_type", ""),
                "treatment_plan": draft_context.get("treatment_plan", ""),
            },
        )
        response_data = TreatmentAIOpinionSerializer(saved_opinion).data
        response_data.update({"regimen": evidence["regimen"], "treatment_rule": evidence["treatment_rule"]})
        return Response(response_data)


class DoctorPhysicianTreatmentOpinionAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    @staticmethod
    def _case(request, case_id):
        return LungCancerCase.objects.filter(
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
        ).first()

    def get(self, request, case_id):
        case = self._case(request, case_id)
        if case is None:
            return Response({"detail": "Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        opinion = PhysicianTreatmentOpinion.objects.filter(case=case).first()
        if opinion is None:
            return Response({
                "id": None,
                "case": str(case.id),
                "physician_opinion": "",
                "created_at": None,
                "updated_at": None,
            })
        return Response(PhysicianTreatmentOpinionSerializer(opinion).data)

    def put(self, request, case_id):
        case = self._case(request, case_id)
        if case is None:
            return Response({"detail": "Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        if case.current_stage != WorkflowStage.TREATMENT:
            return Response(
                {"detail": "호흡기내과 치료 소견은 치료결정 단계에서만 저장할 수 있습니다."},
                status=status.HTTP_409_CONFLICT,
            )
        request_serializer = PhysicianTreatmentOpinionWriteSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        opinion, created = PhysicianTreatmentOpinion.objects.update_or_create(
            case=case,
            defaults={"physician_opinion": request_serializer.validated_data["physician_opinion"]},
        )
        return Response(
            PhysicianTreatmentOpinionSerializer(opinion).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class DoctorFollowUpPathologyOrderAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get_case(self, request, case_id):
        return (
            LungCancerCase.objects.filter(
                id=case_id,
                primary_doctor=request.user,
                case_status=LungCancerCase.CaseStatus.ACTIVE,
            )
            .first()
        )

    def get(self, request, case_id):
        case = self.get_case(request, case_id)
        if case is None:
            return Response(
                {"detail": "담당 중인 활성 Case를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        pathology_gene_completed = has_pathology_gene_review_completed(case)
        return Response(
            {
                "pathology_gene_review_completed": pathology_gene_completed,
                "active_orders": {
                    "PDL1": has_active_pathology_order(case, ExaminationOrder.OrderType.PDL1),
                    "PATHOLOGY_GENE": has_active_pathology_order(
                        case, ExaminationOrder.OrderType.PATHOLOGY_GENE
                    ),
                },
            }
        )

    def post(self, request, case_id):
        case = self.get_case(request, case_id)
        if case is None:
            return Response(
                {"detail": "담당 중인 활성 Case를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = FollowUpPathologyOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            examination_order, work_item = create_follow_up_pathology_order(
                case=case,
                requesting_doctor=request.user,
                **serializer.validated_data,
            )
        except PathologyOrderCreationError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "examination_order_id": examination_order.id,
                "pathology_work_item_id": work_item.id,
                "order_type": examination_order.order_type,
                "order_type_label": examination_order.get_order_type_display(),
                "order_status": examination_order.status,
                "created_at": examination_order.created_at,
            },
            status=status.HTTP_201_CREATED,
        )


NEXT_WORKFLOW_STAGE = {
    WorkflowStage.XRAY: WorkflowStage.CT,
    WorkflowStage.CT: WorkflowStage.PET_CT_TNM,
    WorkflowStage.PET_CT_TNM: WorkflowStage.PATHOLOGY_GENE,
    WorkflowStage.PATHOLOGY_GENE: WorkflowStage.PDL1,
    WorkflowStage.PDL1: WorkflowStage.TREATMENT,
    WorkflowStage.TREATMENT: WorkflowStage.PRESCRIPTION,
}


class SubmittedPathologyResultConfirmationError(ValueError):
    pass


def _confirm_submitted_pathology_result(*, case, result, confirming_user):
    """Confirm a submitted pathology result inside the caller's transaction."""
    if result.result_status == ClinicalResult.ResultStatus.CONFIRMED:
        return result
    if result.result_status != ClinicalResult.ResultStatus.DRAFT:
        raise SubmittedPathologyResultConfirmationError("Only a draft pathology result can be confirmed.")
    if case.current_stage != result.workflow_stage:
        raise SubmittedPathologyResultConfirmationError(
            "Only a result for the current workflow stage can be confirmed."
        )
    if result.examination_order_id is None:
        raise SubmittedPathologyResultConfirmationError(
            "The pathology result is not linked to an examination order."
        )

    gene_detail = getattr(result, "gene_detail", None)
    if gene_detail is not None:
        for finding in gene_detail.gene_findings.all():
            gene_symbol = finding.gene_symbol.strip().upper()
            supported_codes = CANONICAL_ALTERATIONS.get(gene_symbol)
            if (
                supported_codes
                and finding.assessment == GeneFinding.Assessment.LIKELY_POSITIVE
                and finding.alteration_code not in supported_codes
            ):
                raise SubmittedPathologyResultConfirmationError(
                    f"{gene_symbol} 양성 결과는 구체적인 변이 유형을 확정해야 합니다."
                )

    if result.workflow_stage == WorkflowStage.PDL1:
        pdl1_detail = getattr(result, "pdl1_detail", None)
        if pdl1_detail is None or (
            pdl1_detail.tps_percent is None
            and not (pdl1_detail.indeterminate_reason or "").strip()
        ):
            raise SubmittedPathologyResultConfirmationError(
                "PD-L1 최종 TPS를 입력하거나 판정 불가 사유를 기록해야 합니다."
            )

    review = (
        PathologyWorkItem.objects.select_for_update()
        .filter(
            case=case,
            examination_order_id=result.examination_order_id,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            status__in=[
                PathologyWorkItem.Status.PENDING,
                PathologyWorkItem.Status.IN_PROGRESS,
            ],
        )
        .order_by("-created_at")
        .first()
    )
    if review is None:
        raise SubmittedPathologyResultConfirmationError(
            "The pathology result has not been submitted to the doctor."
        )

    confirmed_at = timezone.now()
    result.result_status = ClinicalResult.ResultStatus.CONFIRMED
    result.confirmed_by_user = confirming_user
    result.confirmed_at = confirmed_at
    result.save(
        update_fields=[
            "result_status",
            "confirmed_by_user",
            "confirmed_at",
            "updated_at",
        ]
    )
    review.status = PathologyWorkItem.Status.COMPLETED
    review.completed_at = confirmed_at
    review.save(update_fields=["status", "completed_at", "updated_at"])
    return result


class DoctorCaseWorkflowDecisionAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    @transaction.atomic
    def post(self, request, case_id):
        case = LungCancerCase.objects.select_for_update().filter(
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
        ).first()
        if case is None:
            return Response({"detail": "담당 중인 활성 Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        serializer = DoctorCaseWorkflowDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        action = values["action"]
        target_stage = values.get("target_stage")
        decision_source_stage = case.current_stage
        source_stages = [case.current_stage]
        if case.current_stage == WorkflowStage.PRESCRIPTION and action in {
            ClinicianDecision.DecisionType.REFERRED_OUT, "CASE_CLOSED",
        }:
            # Prescriptions are not ClinicalResults; retain the confirmed treatment
            # result as the clinical evidence for terminal prescription decisions.
            source_stages.append(WorkflowStage.TREATMENT)
        confirms_pathology_and_advances = (
            case.current_stage == WorkflowStage.PATHOLOGY_GENE
            and action == ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE
            and target_stage == WorkflowStage.PDL1
        )
        source_result_filters = {
            "id": values["source_clinical_result_id"],
            "case": case,
            "workflow_stage__in": source_stages,
        }
        if confirms_pathology_and_advances:
            source_result_filters["result_status__in"] = [
                ClinicalResult.ResultStatus.CONFIRMED,
                ClinicalResult.ResultStatus.DRAFT,
            ]
        else:
            source_result_filters["result_status"] = ClinicalResult.ResultStatus.CONFIRMED
        source_result = ClinicalResult.objects.select_for_update().filter(
            **source_result_filters,
        ).first()
        if source_result is None:
            return Response({"detail": "현재 단계의 확정된 전문의 결과가 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)

        if confirms_pathology_and_advances and source_result.result_status == ClinicalResult.ResultStatus.DRAFT:
            try:
                _confirm_submitted_pathology_result(
                    case=case,
                    result=source_result,
                    confirming_user=request.user,
                )
            except SubmittedPathologyResultConfirmationError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if action == ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE:
            if case.current_stage == WorkflowStage.PET_CT_TNM:
                tnm = getattr(source_result, "tnm_detail", None)
                if tnm is None or not (tnm.stage_group or "").strip():
                    return Response({"detail": "Stage Group 최종 확정 후 다음 단계로 진행할 수 있습니다."}, status=status.HTTP_400_BAD_REQUEST)
            expected_stage = NEXT_WORKFLOW_STAGE.get(case.current_stage)
            if expected_stage is None:
                return Response({"detail": "현재 단계에서는 다음 진료 단계로 진행할 수 없습니다."}, status=status.HTTP_400_BAD_REQUEST)
            if target_stage != expected_stage:
                return Response({"detail": "현재 단계에서 허용되는 다음 진료 단계가 아닙니다."}, status=status.HTTP_400_BAD_REQUEST)
            order_required = target_stage in {
                WorkflowStage.CT,
                WorkflowStage.PET_CT_TNM,
                WorkflowStage.PATHOLOGY_GENE,
                WorkflowStage.PDL1,
            }
            reusable_statuses = list(ACTIVE_ORDER_STATUSES)
            if target_stage == WorkflowStage.PDL1:
                reusable_statuses.append(ExaminationOrder.Status.COMPLETED)
            target_order = None
            target_order_was_created = False
            if order_required:
                target_order = (
                    ExaminationOrder.objects.select_for_update()
                    .filter(
                        case=case,
                        order_type=target_stage,
                        status__in=reusable_statuses,
                    )
                    .order_by("-created_at")
                    .first()
                )
            if order_required and target_order is None:
                try:
                    target_order, _ = create_examination_order(
                        case=case,
                        requesting_doctor=request.user,
                        order_type=target_stage,
                        priority=ExaminationOrder.Priority.NORMAL,
                        purpose=f"{source_result.get_workflow_stage_display()} 확정 후 {target_stage} 진행",
                        clinical_note=values.get("reason", "").strip(),
                    )
                    target_order_was_created = True
                except ExaminationOrderCreationError as exc:
                    transaction.set_rollback(True)
                    return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            if (
                target_stage == WorkflowStage.PDL1
                and target_order is not None
                and not target_order_was_created
                and target_order.status in ACTIVE_ORDER_STATUSES
                and not PathologyWorkItem.objects.filter(
                    examination_order=target_order,
                    task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
                    status__in=[
                        PathologyWorkItem.Status.PENDING,
                        PathologyWorkItem.Status.IN_PROGRESS,
                        PathologyWorkItem.Status.BLOCKED,
                        PathologyWorkItem.Status.COMPLETED,
                    ],
                ).exists()
            ):
                PathologyWorkItem.objects.create(
                    case=case,
                    examination_order=target_order,
                    task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
                    status=PathologyWorkItem.Status.PENDING,
                    priority=target_order.priority,
                )
            if order_required and target_order is None:
                transaction.set_rollback(True)
                return Response({"detail": "다음 단계로 진행하려면 해당 검사 오더가 필요합니다."}, status=status.HTTP_400_BAD_REQUEST)
            case.current_stage = target_stage
            case.save(update_fields=["current_stage", "updated_at"])
        elif action == "RETRY":
            if case.current_stage != WorkflowStage.PATHOLOGY_GENE:
                return Response({"detail": "재생검은 현재 조직/유전자 검사 단계에서만 요청할 수 있습니다."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                create_examination_order(
                    case=case,
                    requesting_doctor=request.user,
                    order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
                    priority=values["retry_priority"],
                    purpose=values["retry_purpose"].strip(),
                    clinical_note=values["retry_clinical_note"].strip(),
                    allow_repeat_current_stage=True,
                )
            except ExaminationOrderCreationError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            action = ClinicianDecision.DecisionType.REPEAT_EXAMINATION
            target_stage = None
        elif action == ClinicianDecision.DecisionType.REFERRED_OUT:
            case.case_status = LungCancerCase.CaseStatus.REFERRED_OUT
            case.closed_at = timezone.now()
            case.save(update_fields=["case_status", "closed_at", "updated_at"])
            target_stage = None
        else:  # CASE_CLOSED
            has_final_prescription = Prescription.objects.filter(
                case=case,
                prescription_status=Prescription.PrescriptionStatus.FINAL,
            ).exists()
            treatment_decision = None
            try:
                treatment_decision = source_result.treatment_detail
            except TreatmentDecision.DoesNotExist:
                pass
            non_drug_without_prescriptions = (
                treatment_decision is not None
                and treatment_decision.requires_drug_prescription is False
                and not Prescription.objects.filter(case=case).exists()
            )
            if not has_final_prescription and not non_drug_without_prescriptions:
                return Response(
                    {
                        "detail": (
                            "Case can only be closed after a FINAL prescription exists, "
                            "unless the confirmed treatment plan does not require medication."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            case.case_status = LungCancerCase.CaseStatus.CLOSED
            case.closed_at = timezone.now()
            case.save(update_fields=["case_status", "closed_at", "updated_at"])
            target_stage = None
            action = ClinicianDecision.DecisionType.CLOSE_CASE

        decision = ClinicianDecision.objects.create(
            case=case,
            source_stage=decision_source_stage,
            source_clinical_result=source_result,
            decision_type=action,
            target_stage=target_stage,
            reason=values.get("reason", "").strip() or None,
            decided_by_user=request.user,
            decided_at=timezone.now(),
        )
        return Response({
            "case_id": str(case.id),
            "current_stage": case.current_stage,
            "case_status": case.case_status,
            "closed_at": case.closed_at,
            "decision": {
                "id": str(decision.id),
                "source_stage": decision.source_stage,
                "decision_type": decision.decision_type,
                "target_stage": decision.target_stage,
                "reason": decision.reason,
                "decided_at": decision.decided_at,
            },
        })


class DoctorSubmittedPathologyResultConfirmAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def _locked_context(self, request, case_id, result_id):
        case = LungCancerCase.objects.select_for_update().filter(
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
        ).first()
        if case is None:
            return None, None

        locked_result = ClinicalResult.objects.select_for_update().filter(
            id=result_id,
            case=case,
            workflow_stage__in=[WorkflowStage.PATHOLOGY_GENE, WorkflowStage.PDL1],
        ).first()
        if locked_result is None:
            return case, None

        result = ClinicalResult.objects.select_related(
            "gene_detail", "pdl1_detail", "reviewed_ai_result"
        ).prefetch_related(
            "reviewed_ai_result__gene_ai_results",
        ).get(pk=locked_result.pk)
        return case, result

    @staticmethod
    def _update_gene_findings(result, payload):
        if result.workflow_stage != WorkflowStage.PATHOLOGY_GENE or not hasattr(result, "gene_detail"):
            raise ValidationError({"gene_findings": "A pathology/gene draft is required."})
        serializer = DoctorPathologyGeneReviewSerializer(
            data=payload,
            context={"result": result},
        )
        serializer.is_valid(raise_exception=True)
        findings_by_symbol = {
            finding.gene_symbol.strip().upper(): finding
            for finding in result.gene_detail.gene_findings.select_for_update()
        }
        for values in serializer.validated_data["gene_findings"]:
            finding = findings_by_symbol[values["gene_symbol"]]
            finding.assessment = values["assessment"]
            finding.alteration_code = values.get("alteration_code")
        GeneFinding.objects.bulk_update(
            findings_by_symbol.values(),
            ["assessment", "alteration_code"],
        )

    @transaction.atomic
    def patch(self, request, case_id, result_id):
        case, result = self._locked_context(request, case_id, result_id)
        if case is None or result is None:
            return Response(
                {"detail": "The submitted pathology result was not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if result.result_status == ClinicalResult.ResultStatus.CONFIRMED:
            return Response(
                {"detail": "The result is already confirmed."},
                status=status.HTTP_409_CONFLICT,
            )
        if case.current_stage != WorkflowStage.PATHOLOGY_GENE:
            return Response(
                {"detail": "PATHOLOGY_GENE is not the current workflow stage."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        self._update_gene_findings(result, request.data)
        return Response(DoctorClinicalResultSerializer(result).data)

    @transaction.atomic
    def post(self, request, case_id, result_id):
        case, result = self._locked_context(request, case_id, result_id)
        if case is None or result is None:
            return Response(
                {"detail": "The submitted pathology result was not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if result.result_status == ClinicalResult.ResultStatus.CONFIRMED:
            return Response(
                {"detail": "The result is already confirmed."},
                status=status.HTTP_409_CONFLICT,
            )
        if result.workflow_stage == WorkflowStage.PATHOLOGY_GENE and "gene_findings" in request.data:
            self._update_gene_findings(result, request.data)
        if result.workflow_stage == WorkflowStage.PDL1:
            detail = getattr(result, "pdl1_detail", None)
            if detail is None:
                return Response(
                    {"detail": "PD-L1 임상 결과가 없습니다."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer = DoctorPdl1ReviewSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            detail.tps_percent = serializer.validated_data.get("tps_percent")
            detail.indeterminate_reason = serializer.validated_data.get("indeterminate_reason")
            detail.save(update_fields=["tps_percent", "indeterminate_reason"])
        try:
            _confirm_submitted_pathology_result(
                case=case,
                result=result,
                confirming_user=request.user,
            )
        except SubmittedPathologyResultConfirmationError as exc:
            transaction.set_rollback(True)
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(DoctorClinicalResultSerializer(result).data)


class DoctorXrayWorkflowAPIView(APIView):
    """Save/finalise X-ray and either order CT or close the case as one unit."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    @transaction.atomic
    def post(self, request, case_id):
        case = LungCancerCase.objects.select_for_update().filter(
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
            current_stage=WorkflowStage.XRAY,
        ).first()
        if case is None:
            return Response({"detail": "X-ray 단계의 담당 활성 Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        serializer = DoctorXrayWorkflowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        submitted_review = (
            RadiologyReview.objects.select_for_update()
            .filter(
                case=case,
                examination_order__order_type=ExaminationOrder.OrderType.XRAY,
                assigned_doctor=request.user,
                status__in=[RadiologyReview.Status.PENDING, RadiologyReview.Status.IN_PROGRESS],
                ai_analysis__status=AiAnalysis.Status.SUCCEEDED,
            )
            .order_by("-submitted_at")
            .first()
        )
        result = ClinicalResult.objects.select_for_update().filter(
            case=case,
            workflow_stage=WorkflowStage.XRAY,
        ).first()
        if result is not None and result.result_status == ClinicalResult.ResultStatus.CONFIRMED:
            return Response({"detail": "이미 확정된 X-ray 결과입니다."}, status=status.HTTP_409_CONFLICT)

        if result is None:
            result = ClinicalResult.objects.create(
                case=case,
                examination_order=(
                    submitted_review.examination_order if submitted_review else None
                ),
                workflow_stage=WorkflowStage.XRAY,
                source_image_asset=(
                    submitted_review.ai_analysis.source_image_asset
                    if submitted_review
                    else None
                ),
                reviewed_ai_result=(
                    submitted_review.ai_analysis.ai_result if submitted_review else None
                ),
                result_status=ClinicalResult.ResultStatus.DRAFT,
            )
            XrayResult.objects.create(
                clinical_result=result,
                assessment=values["assessment"],
                finding_summary=values["finding_summary"].strip() or None,
                recommended_action=(XrayResult.RecommendedAction.CHEST_CT if values["next_action"] == "ORDER_CT" else XrayResult.RecommendedAction.NO_FURTHER_ACTION),
            )
        else:
            detail = result.xray_detail
            detail.assessment = values["assessment"]
            detail.finding_summary = values["finding_summary"].strip() or None
            detail.recommended_action = XrayResult.RecommendedAction.CHEST_CT if values["next_action"] == "ORDER_CT" else XrayResult.RecommendedAction.NO_FURTHER_ACTION
            detail.save(update_fields=["assessment", "finding_summary", "recommended_action"])

        if submitted_review:
            result.examination_order = submitted_review.examination_order
            result.source_image_asset = submitted_review.ai_analysis.source_image_asset
            result.reviewed_ai_result = submitted_review.ai_analysis.ai_result
        result.result_status = ClinicalResult.ResultStatus.CONFIRMED
        result.confirmed_by_user = request.user
        result.confirmed_at = timezone.now()
        result.save(
            update_fields=[
                "examination_order",
                "source_image_asset",
                "reviewed_ai_result",
                "result_status",
                "confirmed_by_user",
                "confirmed_at",
                "updated_at",
            ]
        )
        if submitted_review:
            submitted_review.status = RadiologyReview.Status.COMPLETED
            submitted_review.save(update_fields=["status", "updated_at"])

        order = None
        if values["next_action"] == "ORDER_CT":
            try:
                order, _ = create_examination_order(
                    case=case,
                    requesting_doctor=request.user,
                    order_type=ExaminationOrder.OrderType.CT,
                    priority=values["priority"],
                    purpose=values["purpose"].strip(),
                    clinical_note=values["clinical_note"].strip(),
                )
            except ExaminationOrderCreationError as exc:
                raise ValidationError({"detail": str(exc)})
            case.current_stage = WorkflowStage.CT
            decision_type = ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE
            target_stage = WorkflowStage.CT
        else:
            case.case_status = LungCancerCase.CaseStatus.CLOSED
            case.closed_at = timezone.now()
            decision_type = ClinicianDecision.DecisionType.REFERRED_OUT if values["next_action"] == "REFERRED_OUT" else ClinicianDecision.DecisionType.CLOSE_CASE
            target_stage = None
        case.save(update_fields=["current_stage", "case_status", "closed_at", "updated_at"])
        decision = ClinicianDecision.objects.create(
            case=case,
            source_stage=WorkflowStage.XRAY,
            source_clinical_result=result,
            decision_type=decision_type,
            target_stage=target_stage,
            reason=(values["purpose"] if values["next_action"] == "ORDER_CT" else values["closure_reason"]).strip() or None,
            decided_by_user=request.user,
            decided_at=timezone.now(),
        )
        return Response({
            "clinical_result_id": str(result.id),
            "order_id": str(order.id) if order else None,
            "current_stage": case.current_stage,
            "case_status": case.case_status,
            "closed_at": case.closed_at,
            "decision_id": str(decision.id),
        }, status=status.HTTP_201_CREATED)


class DoctorCaseConsultationRequestAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def _case(self, request, case_id):
        return LungCancerCase.objects.filter(id=case_id, primary_doctor=request.user).first()

    def get(self, request, case_id):
        case = self._case(request, case_id)
        if case is None:
            return Response({"detail": "담당 Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        requests = case.consultation_requests.select_related("requested_by_user", "recipient_user").order_by("-created_at")
        return Response([{
            "id": str(item.id), "target_department_code": item.target_department_code,
            "recipient_user_id": str(item.recipient_user_id) if item.recipient_user_id else None,
            "recipient_name": item.recipient_user.name if item.recipient_user else None,
            "question": item.question, "priority": item.priority, "status": item.status,
            "response_note": item.response_note, "responded_at": item.responded_at, "created_at": item.created_at,
        } for item in requests])

    @transaction.atomic
    def post(self, request, case_id):
        case = LungCancerCase.objects.select_for_update().filter(id=case_id, primary_doctor=request.user, case_status=LungCancerCase.CaseStatus.ACTIVE).first()
        if case is None:
            return Response({"detail": "활성 담당 Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        serializer = DoctorCaseConsultationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        requester_hospital_id = request.user.department_role.department.hospital_id
        target_department_code = "PULMONOLOGY"
        recipients = User.objects.filter(account_status=User.AccountStatus.ACTIVE, department_role__department__hospital_id=requester_hospital_id, department_role__department__code=target_department_code).select_related("department_role__department")
        recipient = None
        if values.get("recipient_user_id"):
            recipient = recipients.filter(id=values["recipient_user_id"]).first()
            if recipient is None:
                return Response({"detail": "같은 병원의 선택 진료과 활성 의료진만 지정할 수 있습니다."}, status=status.HTTP_400_BAD_REQUEST)
            recipients = [recipient]
        else:
            recipients = list(recipients)
        consultation = CaseConsultationRequest.objects.create(case=case, requested_by_user=request.user, recipient_user=recipient, target_department_code=target_department_code, question=values["question"], priority=values["priority"])
        transaction.on_commit(lambda: create_in_app_staff_notifications(recipients=recipients, case=case, notification_type="CONSULTATION_REQUEST", title="협진 요청", message=f"{case.case_code} 협진 요청이 도착했습니다.", payload={"consultation_request_id": str(consultation.id)}))
        return Response({"id": str(consultation.id), "status": consultation.status, "target_department_code": consultation.target_department_code, "created_at": consultation.created_at}, status=status.HTTP_201_CREATED)


class DoctorCaseConsultationResponseAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor]

    @transaction.atomic
    def patch(self, request, case_id, consultation_id):
        consultation = CaseConsultationRequest.objects.select_for_update(of=("self",)).filter(
            id=consultation_id,
            case_id=case_id,
        ).first()
        if consultation is None:
            return Response({"detail": "협진 요청을 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        consultation_case = LungCancerCase.objects.select_related("patient").get(id=consultation.case_id)
        department = getattr(getattr(request.user, "department_role", None), "department", None)
        can_respond = consultation.recipient_user_id == request.user.id or (consultation.recipient_user_id is None and department is not None and department.code == consultation.target_department_code and department.hospital_id == consultation_case.patient.hospital_id)
        if not can_respond:
            return Response({"detail": "이 협진 요청에 회신할 권한이 없습니다."}, status=status.HTTP_403_FORBIDDEN)
        serializer = DoctorCaseConsultationResponseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        consultation.status = values["status"]
        if values["status"] == CaseConsultationRequest.Status.RESPONDED:
            consultation.response_note = values["response_note"].strip()
            consultation.responded_at = timezone.now()
        consultation.save(update_fields=["status", "response_note", "responded_at", "updated_at"])
        return Response({"id": str(consultation.id), "status": consultation.status, "response_note": consultation.response_note, "responded_at": consultation.responded_at})


class DoctorMyConsultationRequestAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor]

    def get(self, request):
        department = getattr(getattr(request.user, "department_role", None), "department", None)
        if department is None:
            return Response([])
        requests = CaseConsultationRequest.objects.filter(
            Q(recipient_user=request.user) | Q(recipient_user__isnull=True, target_department_code=department.code, case__patient__hospital_id=department.hospital_id)
        ).select_related("case__patient", "requested_by_user").order_by("priority", "created_at")
        return Response([{
            "id": str(item.id), "case_id": str(item.case_id), "case_code": item.case.case_code,
            "patient_name": item.case.patient.name, "requested_by": item.requested_by_user.name,
            "question": item.question, "priority": item.priority, "status": item.status,
            "created_at": item.created_at, "response_note": item.response_note,
        } for item in requests])


class DoctorExaminationOrderAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get_case(self, request, case_id):
        return LungCancerCase.objects.filter(
            id=case_id,
            primary_doctor=request.user,
            case_status=LungCancerCase.CaseStatus.ACTIVE,
        ).first()

    def get(self, request, case_id):
        case = self.get_case(request, case_id)
        if case is None:
            return Response({"detail": "담당 중인 활성 Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        orders = list(case.examination_orders.order_by("-created_at"))
        appointments_by_order_id = {}
        for appointment in Appointment.objects.filter(
            examination_order__in=orders,
        ).exclude(
            appointment_status=Appointment.AppointmentStatus.CANCELLED,
        ).order_by("examination_order_id", "-scheduled_at"):
            appointments_by_order_id.setdefault(
                appointment.examination_order_id,
                appointment,
            )
        return Response([
            {
                "id": order.id,
                "case_id": order.case_id,
                "order_type": order.order_type,
                "order_type_label": order.get_order_type_display(),
                "priority": order.priority,
                "status": order.status,
                "purpose": order.purpose,
                "clinical_note": order.clinical_note,
                "created_at": order.created_at,
                "scheduled_at": appointments_by_order_id[order.id].scheduled_at if order.id in appointments_by_order_id else None,
                "appointment_status": appointments_by_order_id[order.id].appointment_status if order.id in appointments_by_order_id else None,
            }
            for order in orders
        ])

    def post(self, request, case_id):
        case = self.get_case(request, case_id)
        if case is None:
            return Response({"detail": "담당 중인 활성 Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ExaminationOrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order, work_item = create_examination_order(
                case=case,
                requesting_doctor=request.user,
                **serializer.validated_data,
            )
        except ExaminationOrderCreationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "id": order.id,
                "case_id": order.case_id,
                "order_type": order.order_type,
                "order_type_label": order.get_order_type_display(),
                "priority": order.priority,
                "status": order.status,
                "pathology_work_item_id": work_item.id if work_item else None,
                "created_at": order.created_at,
                "scheduled_at": None,
                "appointment_status": None,
            },
            status=status.HTTP_201_CREATED,
        )


class DoctorExaminationOrderDetailAPIView(DoctorExaminationOrderAPIView):
    def get_order(self, request, case_id, order_id):
        case = self.get_case(request, case_id)
        if case is None:
            return None, Response({"detail": "담당 중인 활성 Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        order = case.examination_orders.filter(id=order_id).first()
        if order is None:
            return None, Response({"detail": "검사 오더를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        return order, None

    @staticmethod
    def serialize_order(order):
        appointment = DoctorExaminationOrderDetailAPIView._latest_active_appointment(order)
        return {
            "id": order.id,
            "case_id": order.case_id,
            "order_type": order.order_type,
            "order_type_label": order.get_order_type_display(),
            "priority": order.priority,
            "status": order.status,
            "purpose": order.purpose,
            "clinical_note": order.clinical_note,
            "created_at": order.created_at,
            "scheduled_at": appointment.scheduled_at if appointment else None,
            "appointment_status": appointment.appointment_status if appointment else None,
        }

    @staticmethod
    def _latest_active_appointment(order):
        return order.appointments.exclude(
            appointment_status=Appointment.AppointmentStatus.CANCELLED,
        ).order_by("-scheduled_at").first()

    def patch(self, request, case_id, order_id):
        order, error_response = self.get_order(request, case_id, order_id)
        if error_response:
            return error_response
        serializer = ExaminationOrderUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            updated = update_examination_order(order=order, requesting_doctor=request.user, **serializer.validated_data)
        except ExaminationOrderUpdateError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.serialize_order(updated))

    def delete(self, request, case_id, order_id):
        order, error_response = self.get_order(request, case_id, order_id)
        if error_response:
            return error_response
        try:
            cancelled = cancel_examination_order(order=order, requesting_doctor=request.user)
        except ExaminationOrderUpdateError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.serialize_order(cancelled))
