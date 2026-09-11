from django.db import transaction
from django.db.models import Exists, OuterRef, Prefetch, Q
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.permissions import (
    IsActiveStaff,
    IsRadiologyStaff,
    IsTechnologist,
    get_token_hospital_id,
)
from apps.ai_results.models import AiAnalysis, AnalysisType, ModelVersion
from apps.cases.models import CaseImageAsset, ExaminationOrder, Stage
from apps.clinical.models import ClinicalResult
from apps.patients.models import Appointment

from .serializers import (
    RadiologyAiAnalysisDetailSerializer,
    RadiologyAiResultSerializer,
    RadiologyImageAssetCreateSerializer,
    RadiologyWorklistQuerySerializer,
    RadiologyWorklistSerializer,
)


class RadiologyPermissionMixin:
    authentication_classes = [JWTAuthentication]
    permission_classes = [
        IsAuthenticated,
        IsActiveStaff,
        IsTechnologist,
        IsRadiologyStaff,
    ]

    def get_hospital_id(self):
        hospital_id = get_token_hospital_id(self.request)
        if hospital_id is None:
            raise PermissionDenied("병원 정보가 확인되지 않습니다.")
        return hospital_id

    def get_order(self, order_id, *, for_update=False):
        queryset = ExaminationOrder.objects.select_related("case", "case__patient")
        if for_update:
            queryset = queryset.select_for_update()
        return queryset.filter(
            id=order_id,
            case__patient__hospital_id=self.get_hospital_id(),
            exam_type__in=[ExaminationOrder.ExamType.XRAY, ExaminationOrder.ExamType.CT],
        ).first()

    def get_analysis(self, analysis_id):
        return (
            AiAnalysis.objects.filter(
                id=analysis_id,
                case__patient__hospital_id=self.get_hospital_id(),
                analysis_type__in=[
                    AnalysisType.XRAY_SCREENING,
                    AnalysisType.CT_NODULE,
                    AnalysisType.TNM_STAGING,
                ],
                source_image_asset__examination_order__exam_type__in=[
                    ExaminationOrder.ExamType.XRAY,
                    ExaminationOrder.ExamType.CT,
                ],
            )
            .select_related(
                "case",
                "model_version",
                "source_image_asset",
                "source_image_asset__examination_order",
                "ai_result",
                "ai_result__xray_detail",
                "ai_result__ct_detail",
                "ai_result__tnm_detail",
            )
            .prefetch_related("ai_result__ct_detail__nodule_results")
            .first()
        )


class RadiologyWorklistAPIView(RadiologyPermissionMixin, ListAPIView):
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
            exam_type = filters["exam_type"]
            staging_relation = Q(image_assets__uploaded_stage="STAGING") | Q(
                image_assets__ai_analyses__analysis_type="TNM_STAGING",
            )
            if exam_type == "STAGING":
                queryset = queryset.filter(staging_relation).distinct()
            elif exam_type == ExaminationOrder.ExamType.CT:
                queryset = queryset.filter(exam_type=exam_type).exclude(staging_relation).distinct()
            else:
                queryset = queryset.filter(exam_type=exam_type)
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


class RadiologyOrderImageCreateAPIView(RadiologyPermissionMixin, APIView):
    @transaction.atomic
    def post(self, request, order_id):
        order = self.get_order(order_id, for_update=True)
        if order is None:
            return Response({"detail": "검사 오더를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        is_staging_order = order.image_assets.filter(
            Q(uploaded_stage=Stage.STAGING)
            | Q(ai_analyses__analysis_type=AnalysisType.TNM_STAGING),
        ).exists()
        image_type = (
            CaseImageAsset.ImageType.XRAY
            if order.exam_type == ExaminationOrder.ExamType.XRAY
            else CaseImageAsset.ImageType.CT
        )
        uploaded_stage = (
            Stage.XRAY
            if order.exam_type == ExaminationOrder.ExamType.XRAY
            else Stage.STAGING if is_staging_order else Stage.CT
        )

        serializer = RadiologyImageAssetCreateSerializer(
            data=request.data,
            context={"order": order},
        )
        serializer.is_valid(raise_exception=True)
        asset = serializer.save(
            case=order.case,
            examination_order=order,
            image_type=image_type,
            uploaded_stage=uploaded_stage,
            status=CaseImageAsset.Status.READY,
        )
        return Response(
            RadiologyImageAssetCreateSerializer(asset).data,
            status=status.HTTP_201_CREATED,
        )


class RadiologyOrderAnalysisCreateAPIView(RadiologyPermissionMixin, APIView):
    @transaction.atomic
    def post(self, request, order_id):
        order = self.get_order(order_id, for_update=True)
        if order is None:
            return Response({"detail": "검사 오더를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        is_staging_order = order.image_assets.filter(
            Q(uploaded_stage=Stage.STAGING)
            | Q(ai_analyses__analysis_type=AnalysisType.TNM_STAGING),
        ).exists()
        if order.exam_type == ExaminationOrder.ExamType.XRAY:
            analysis_type = AnalysisType.XRAY_SCREENING
            assets = order.image_assets.filter(
                status=CaseImageAsset.Status.READY,
                image_type=CaseImageAsset.ImageType.XRAY,
            )
        elif is_staging_order:
            analysis_type = AnalysisType.TNM_STAGING
            assets = order.image_assets.filter(
                status=CaseImageAsset.Status.READY,
                image_type=CaseImageAsset.ImageType.CT,
                uploaded_stage=Stage.STAGING,
            )
        else:
            analysis_type = AnalysisType.CT_NODULE
            assets = order.image_assets.filter(
                status=CaseImageAsset.Status.READY,
                image_type=CaseImageAsset.ImageType.CT,
                uploaded_stage=Stage.CT,
            )

        asset = assets.order_by("-created_at").first()
        if asset is None:
            return Response(
                {"detail": "분석에 사용할 READY 영상 자산이 없습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if AiAnalysis.objects.filter(
            source_image_asset__examination_order=order,
            analysis_type=analysis_type,
            status__in=[AiAnalysis.Status.PENDING, AiAnalysis.Status.RUNNING],
        ).exists():
            return Response(
                {"detail": "이미 대기 중이거나 실행 중인 분석이 있습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        model_version = ModelVersion.objects.filter(
            analysis_type=analysis_type,
        ).order_by("-created_at").first()
        if model_version is None:
            return Response(
                {"detail": "사용 가능한 AI 모델 버전이 없습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = AiAnalysis.objects.create(
            case=order.case,
            source_image_asset=asset,
            analysis_type=analysis_type,
            model_version=model_version,
            status=AiAnalysis.Status.PENDING,
        )
        return Response(
            RadiologyAiAnalysisDetailSerializer(analysis).data,
            status=status.HTTP_201_CREATED,
        )


class RadiologyAnalysisDetailAPIView(RadiologyPermissionMixin, APIView):
    def get(self, request, analysis_id):
        analysis = self.get_analysis(analysis_id)
        if analysis is None:
            return Response({"detail": "AI 분석을 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        return Response(RadiologyAiAnalysisDetailSerializer(analysis).data)


class RadiologyAnalysisResultAPIView(RadiologyPermissionMixin, APIView):
    def get(self, request, analysis_id):
        analysis = self.get_analysis(analysis_id)
        if analysis is None:
            return Response({"detail": "AI 분석을 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        if analysis.status != AiAnalysis.Status.SUCCEEDED or not hasattr(analysis, "ai_result"):
            return Response(
                {"detail": "AI 분석 결과가 아직 생성되지 않았습니다."},
                status=status.HTTP_409_CONFLICT,
            )
        serializer = RadiologyAiResultSerializer(analysis)
        if serializer.data["result"] is None:
            return Response(
                {"detail": "분석 유형에 맞는 상세 결과가 없습니다."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(serializer.data)
