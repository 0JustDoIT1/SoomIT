from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from django.utils import timezone
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
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, Stage
from apps.clinical.models import ClinicalResult
from apps.patients.models import Appointment

from .models import RadiologyReview
from .services.workflow import is_pet_ct_tnm_order
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
        radiology_reviews = RadiologyReview.objects.filter(ai_analysis_id=OuterRef("pk"))
        analysis_queryset = (
            AiAnalysis.objects.select_related("ai_result", "model_version")
            .annotate(
                has_confirmed_review=Exists(confirmed_review),
                has_completed_review=Exists(
                    radiology_reviews.filter(status=RadiologyReview.Status.COMPLETED)
                ),
                has_radiology_review=Exists(radiology_reviews),
            )
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


def _workflow_order_queryset(hospital_id):
    confirmed_review = ClinicalResult.objects.filter(
        reviewed_ai_result__ai_analysis_id=OuterRef("pk"),
        result_status=ClinicalResult.ResultStatus.CONFIRMED,
    )
    radiology_reviews = RadiologyReview.objects.filter(ai_analysis_id=OuterRef("pk"))
    review_queryset = RadiologyReview.objects.select_related(
        "assigned_doctor",
        "submitted_by",
    ).order_by("-submitted_at")
    analysis_queryset = (
        AiAnalysis.objects.select_related("ai_result", "model_version")
        .annotate(
            has_confirmed_review=Exists(confirmed_review),
            has_completed_review=Exists(
                radiology_reviews.filter(status=RadiologyReview.Status.COMPLETED)
            ),
            has_radiology_review=Exists(radiology_reviews),
        )
        .prefetch_related(
            "ai_result__ct_detail__nodule_results",
            Prefetch(
                "radiology_reviews",
                queryset=review_queryset,
                to_attr="workflow_reviews",
            ),
        )
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
    return (
        ExaminationOrder.objects.filter(
            case__patient__hospital_id=hospital_id,
            exam_type__in=[ExaminationOrder.ExamType.XRAY, ExaminationOrder.ExamType.CT],
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


def _filter_radiology_orders(queryset, filters):
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
            appointment_filters["appointments__scheduled_at__date__gte"] = filters["date_from"]
        if "date_to" in filters:
            appointment_filters["appointments__scheduled_at__date__lte"] = filters["date_to"]
        queryset = queryset.filter(**appointment_filters).distinct()
    return queryset


class RadiologyCaseWorklistAPIView(RadiologyPermissionMixin, APIView):
    """Return exactly one row per case; filtering happens before case grouping."""

    def get(self, request):
        query_serializer = RadiologyWorklistQuerySerializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        hospital_id = self.get_hospital_id()
        matched_orders = list(_filter_radiology_orders(
            _workflow_order_queryset(hospital_id),
            query_serializer.validated_data,
        ))
        matched_case_ids = list(dict.fromkeys(order.case_id for order in matched_orders))
        all_orders = list(
            _workflow_order_queryset(hospital_id).filter(case_id__in=matched_case_ids)
        )
        exam_counts = dict(
            ExaminationOrder.objects.filter(
                case__patient__hospital_id=hospital_id,
                exam_type__in=[ExaminationOrder.ExamType.XRAY, ExaminationOrder.ExamType.CT],
            )
            .values("case_id")
            .annotate(total=Count("id"))
            .values_list("case_id", "total")
        )

        rows = []
        seen_case_ids = set()
        serializer = RadiologyWorklistSerializer()
        orders_by_case = {}
        for order in all_orders:
            orders_by_case.setdefault(order.case_id, []).append(order)

        def exam_rank(order):
            if is_pet_ct_tnm_order(order.worklist_image_assets):
                return 2
            if order.exam_type == ExaminationOrder.ExamType.CT:
                return 1
            return 0

        for case_id in matched_case_ids:
            case_orders = orders_by_case[case_id]
            order = max(case_orders, key=lambda item: (exam_rank(item), item.created_at))
            if order.case_id in seen_case_ids:
                continue
            seen_case_ids.add(order.case_id)
            current_order = serializer.to_representation(order)
            rows.append(
                {
                    "patient": current_order["patient"],
                    "case": current_order["case"],
                    "responsible_doctor": current_order["responsible_doctor"],
                    "exam_count": exam_counts[order.case_id],
                    "current_exam": current_order,
                    "workflow_status": current_order["workflow_status"],
                    "workflow_status_label": current_order["workflow_status_label"],
                }
            )
        return Response(rows)


class RadiologyCaseWorkflowAPIView(RadiologyPermissionMixin, APIView):
    def get(self, request, case_id):
        case = (
            LungCancerCase.objects.select_related("patient", "primary_doctor")
            .filter(id=case_id, patient__hospital_id=self.get_hospital_id())
            .first()
        )
        if case is None:
            return Response({"detail": "Case를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        orders = list(_workflow_order_queryset(self.get_hospital_id()).filter(case_id=case_id))
        serializer = RadiologyWorklistSerializer()
        exam_rank = {"XRAY": 0, "CT": 1, "STAGING": 2}
        exams = []
        for order in orders:
            item = serializer.to_representation(order)
            analysis = serializer._get_latest_ai_analysis(order)
            review = None
            if analysis is not None:
                reviews = getattr(analysis, "workflow_reviews", [])
                if reviews:
                    review_item = reviews[0]
                    review = {
                        "id": review_item.id,
                        "status": review_item.status,
                        "assigned_doctor": {
                            "id": review_item.assigned_doctor_id,
                            "name": review_item.assigned_doctor.name,
                        },
                        "submitted_at": review_item.submitted_at,
                    }
            ai_result = None
            if (
                analysis is not None
                and analysis.status == AiAnalysis.Status.SUCCEEDED
                and hasattr(analysis, "ai_result")
            ):
                ai_result = RadiologyAiResultSerializer(analysis).data["result"]
            item["ai_result"] = ai_result
            item["review"] = review
            exams.append(item)

        exams.sort(
            key=lambda item: (
                exam_rank.get(
                    "STAGING"
                    if item["examination_order"]["exam_type_label"] == "PET-CT"
                    else item["examination_order"]["exam_type"],
                    99,
                ),
                item["examination_order"]["created_at"],
            )
        )
        return Response(
            {
                "case": {
                    "id": case.id,
                    "case_code": case.case_code,
                    "current_stage": case.current_stage,
                    "case_status": case.case_status,
                },
                "patient": {
                    "id": case.patient_id,
                    "patient_code": case.patient.patient_code,
                    "name": case.patient.name,
                    "birth_date": case.patient.birth_date,
                    "sex": case.patient.sex,
                },
                "responsible_doctor": (
                    {"id": case.primary_doctor_id, "name": case.primary_doctor.name}
                    if case.primary_doctor_id
                    else None
                ),
                "exams": exams,
            }
        )


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


class RadiologyAnalysisSubmitForReviewAPIView(RadiologyPermissionMixin, APIView):
    @transaction.atomic
    def post(self, request, analysis_id):
        analysis = self.get_analysis(analysis_id)
        if analysis is None:
            return Response(
                {"detail": "AI 분석을 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if analysis.status != AiAnalysis.Status.SUCCEEDED or not hasattr(analysis, "ai_result"):
            return Response(
                {"detail": "완료된 AI 분석 결과만 제출할 수 있습니다."},
                status=status.HTTP_409_CONFLICT,
            )

        asset = analysis.source_image_asset
        order = asset.examination_order if asset else None
        if order is None or order.case_id != analysis.case_id:
            return Response(
                {"detail": "분석에 연결된 검사 오더를 확인할 수 없습니다."},
                status=status.HTTP_409_CONFLICT,
            )
        if order.case.primary_doctor_id is None:
            return Response(
                {"detail": "현재 Case에 연결된 담당 의사가 없어 제출할 수 없습니다."},
                status=status.HTTP_409_CONFLICT,
            )

        # Lock the order so simultaneous submissions cannot create duplicate reviews.
        ExaminationOrder.objects.select_for_update().get(pk=order.pk)
        review, created = RadiologyReview.objects.get_or_create(
            case=analysis.case,
            examination_order=order,
            ai_analysis=analysis,
            defaults={
                "assigned_doctor": order.case.primary_doctor,
                "submitted_by": request.user,
                "submitted_at": timezone.now(),
                "status": RadiologyReview.Status.PENDING,
            },
        )
        return Response(
            {
                "submitted": created,
                "review_id": review.id,
                "case_id": review.case_id,
                "examination_order_id": review.examination_order_id,
                "analysis_id": review.ai_analysis_id,
                "assigned_doctor": {
                    "id": review.assigned_doctor_id,
                    "name": review.assigned_doctor.name,
                },
                "review_status": review.status,
                "submitted_at": review.submitted_at,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
