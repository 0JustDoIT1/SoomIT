import json

from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.negotiation import BaseContentNegotiation
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsActiveStaff, IsDoctor, IsPulmonologyStaff, get_token_hospital_id
from apps.pathology.models import PathologySpecimen, WholeSlideImage
from apps.pathology.services.orthanc import OrthancError, get_wsi_pyramid, get_wsi_tile
from apps.knowledge.services.medgemma_client import MedgemmaServiceError
from apps.radiology.services.xray_storage import XrayStorageError, download_xray_image_bytes
from apps.radiology.services.ct_cornerstone_storage import CtCornerstoneStorageError, download_ct_cornerstone_object
from apps.radiology.services.ct_visualization_storage import CtVisualizationStorageError, download_ct_visualization
from apps.radiology.services.orthanc_dicomweb import (
    OrthancDicomWebError,
    get_series_metadata,
    list_series_instances,
    retrieve_instance,
)

from .models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.ai_results.models import AiAnalysis, AnalysisType
from .serializers import (
    DoctorCaseImageAssetSerializer,
    DoctorLungCancerCaseDetailSerializer,
    DoctorLungCancerCaseSerializer,
    LungCancerCaseDetailSerializer,
    LungCancerCaseSerializer,
    MedicalOpinionRequestSerializer,
    MedicalOpinionResponseSerializer,
    FollowUpPathologyOrderCreateSerializer,
    ExaminationOrderCreateSerializer,
    ExaminationOrderUpdateSerializer,
)
from .services.examination_orders import (
    ExaminationOrderCreationError,
    ExaminationOrderUpdateError,
    cancel_examination_order,
    create_examination_order,
    update_examination_order,
)
from .services.medical_opinion import NoConfirmedClinicalResults, generate_medical_opinion
from .services.pathology_orders import (
    PathologyOrderCreationError,
    create_follow_up_pathology_order,
    has_active_pathology_order,
    has_confirmed_pathology_gene_result,
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


class DoctorSlideViewerAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor, IsPulmonologyStaff]

    def get(self, request, slide_id):
        slide = _doctor_slide_or_404(request, slide_id)
        if not slide.orthanc_series_id:
            return Response({"detail": "WSI viewer is not ready for this slide."}, status=status.HTTP_409_CONFLICT)
        try:
            pyramid = get_wsi_pyramid(slide.orthanc_series_id)
        except OrthancError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
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
            "mpp": slide.mpp,
            "thumbnail_url": f"{base}/thumbnail/",
            "tile_url_template": f"{base}/tiles/{{level}}/{{x}}/{{y}}.jpg",
        })


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
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        response = HttpResponse(tile.content, content_type=tile.content_type)
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
            tile = get_wsi_tile(slide.orthanc_series_id, level, x, y)
        except OrthancError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
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
        return HttpResponse(result.content, content_type=result.content_type)


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
        accept = request.headers.get("Accept")
        if accept not in {"application/dicom", 'multipart/related; type="application/dicom"'}:
            accept = "application/dicom"
        try:
            result = retrieve_instance(asset.study_instance_uid, asset.series_instance_uid, sop_instance_uid, accept=accept)
        except OrthancDicomWebError:
            return Response({"detail": "DICOM instance를 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
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
        except (CtCornerstoneStorageError, ValueError, UnicodeDecodeError):
            return Response({"detail": "CT 분할 geometry를 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
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

    def get(self, request, case_id, analysis_id):
        analysis = self.get_ct_analysis(request, case_id, analysis_id)
        payload = analysis.ai_result.result_payload if hasattr(analysis, "ai_result") else None
        segmentation = payload.get("cornerstone_segmentation") if isinstance(payload, dict) else None
        if not isinstance(segmentation, dict) or not segmentation.get("labelmap_uri"):
            return Response({"detail": "CT 분할 결과가 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        try:
            content = download_ct_cornerstone_object(segmentation["labelmap_uri"])
        except CtCornerstoneStorageError:
            return Response({"detail": "CT 분할 labelmap을 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
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

        pathology_gene_completed = has_confirmed_pathology_gene_result(case)
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
        orders = case.examination_orders.order_by("-created_at")
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
        }

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
