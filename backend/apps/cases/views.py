from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsActiveStaff, IsDoctor, IsPulmonologyStaff, get_token_hospital_id
from apps.knowledge.services.medgemma_client import MedgemmaServiceError
from apps.radiology.services.xray_storage import XrayStorageError, download_xray_image_bytes

from .models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
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
)
from .services.examination_orders import ExaminationOrderCreationError, create_examination_order
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
            patient__hospital=request.user.department_role.department,
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
            patient__hospital=request.user.department_role.department,
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
