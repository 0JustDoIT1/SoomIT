import json

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Prefetch, Q
from django.http import HttpResponse
from django.urls import reverse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.negotiation import BaseContentNegotiation
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
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.clinical.models import ClinicalResult
from apps.patients.models import Appointment

from .models import RadiologyReview
from .tasks import run_ct_analysis, run_tnm_analysis, run_xray_analysis
from .services.xray_storage import (
    XrayStorageError,
    build_xray_object_path,
    delete_xray_image,
    download_xray_image_bytes,
    upload_xray_image,
)
from .services.workflow import is_pet_ct_tnm_order
from .services.dicom_validation import CtSeriesValidationError, parse_ct_headers, validate_ct_series, validate_pet_series
from .services.orthanc_storage import OrthancError, delete_orthanc_series, upload_ct_series
from .services.orthanc_dicomweb import (
    OrthancDicomWebError,
    get_series_metadata,
    list_series_instances,
    retrieve_instance,
    retrieve_instance_frame,
)
from .services.ct_visualization_storage import (
    CtVisualizationStorageError,
    download_ct_visualization,
)
from .services.ct_cornerstone_storage import (
    CtCornerstoneStorageError,
    download_ct_cornerstone_object,
)
from .serializers import (
    CtSeriesUploadSerializer, PetSeriesUploadSerializer,
    RadiologyAiAnalysisDetailSerializer,
    RadiologyAiResultSerializer,
    RadiologyImageAssetCreateSerializer,
    RadiologyXrayImageUploadSerializer,
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
            order_type__in=[ExaminationOrder.OrderType.XRAY, ExaminationOrder.OrderType.CT, ExaminationOrder.OrderType.PET_CT_TNM],
        ).first()

    def get_analysis(self, analysis_id):
        return (
            AiAnalysis.objects.filter(
                id=analysis_id,
                case__patient__hospital_id=self.get_hospital_id(),
                analysis_type__in=[
                    AnalysisType.XRAY_ANALYSIS,
                    AnalysisType.CT_ANALYSIS,
                    AnalysisType.PET_CT_TNM_ANALYSIS,
                ],
                source_image_asset__examination_order__order_type__in=[
                    ExaminationOrder.OrderType.XRAY,
                    ExaminationOrder.OrderType.CT,
                    ExaminationOrder.OrderType.PET_CT_TNM,
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
                order_type__in=[
                    ExaminationOrder.OrderType.XRAY,
                    ExaminationOrder.OrderType.CT,
                    ExaminationOrder.OrderType.PET_CT_TNM,
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

        if "order_type" in filters:
            order_type = filters["order_type"]
            queryset = queryset.filter(order_type=order_type)
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


def _workflow_order_queryset(hospital_id, *, include_confirmed_results=False):
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
    if include_confirmed_results:
        analysis_queryset = analysis_queryset.prefetch_related(
            Prefetch(
                "ai_result__clinical_results",
                queryset=ClinicalResult.objects.filter(
                    result_status=ClinicalResult.ResultStatus.CONFIRMED,
                ).order_by("-confirmed_at"),
                to_attr="workflow_confirmed_results",
            )
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
            order_type__in=[ExaminationOrder.OrderType.XRAY, ExaminationOrder.OrderType.CT, ExaminationOrder.OrderType.PET_CT_TNM],
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


def _serialize_workflow_exam(order, serializer):
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
    return item, analysis


def _completed_at_for_analysis(analysis):
    if analysis is None or not hasattr(analysis, "ai_result"):
        return None

    confirmed_results = getattr(analysis.ai_result, "workflow_confirmed_results", [])
    confirmed_at = next(
        (
            result.confirmed_at
            for result in confirmed_results
            if result.confirmed_at is not None
        ),
        None,
    )
    return confirmed_at.isoformat().replace("+00:00", "Z") if confirmed_at else None


def _filter_radiology_orders(queryset, filters):
    if "order_type" in filters:
        order_type = filters["order_type"]
        queryset = queryset.filter(order_type=order_type)
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
                order_type__in=[ExaminationOrder.OrderType.XRAY, ExaminationOrder.OrderType.CT, ExaminationOrder.OrderType.PET_CT_TNM],
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
            if order.order_type == ExaminationOrder.OrderType.PET_CT_TNM:
                return 2
            if order.order_type == ExaminationOrder.OrderType.CT:
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
        exam_rank = {"XRAY": 0, "CT": 1, "PET_CT_TNM": 2}
        exams = []
        for order in orders:
            item, _ = _serialize_workflow_exam(order, serializer)
            exams.append(item)

        exams.sort(
            key=lambda item: (
                exam_rank.get(item["examination_order"]["order_type"], 99),
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


class RadiologyCompletedExamHistoryAPIView(RadiologyPermissionMixin, APIView):
    def get(self, request):
        orders = list(
            _workflow_order_queryset(
                self.get_hospital_id(),
                include_confirmed_results=True,
            )
        )
        serializer = RadiologyWorklistSerializer()
        history_by_case = {}

        for order in orders:
            item, analysis = _serialize_workflow_exam(order, serializer)
            if item["workflow_status"] != "REVIEW_COMPLETED":
                continue

            item["completed_at"] = _completed_at_for_analysis(analysis)
            history = history_by_case.setdefault(
                order.case_id,
                {
                    "patient": item["patient"],
                    "case": item["case"],
                    "responsible_doctor": item["responsible_doctor"],
                    "completed_exams": [],
                },
            )
            history["completed_exams"].append(item)

        histories = list(history_by_case.values())
        for history in histories:
            history["completed_exams"].sort(
                key=lambda item: (
                    item["completed_at"] is not None,
                    item["completed_at"],
                ),
                reverse=True,
            )
        return Response(histories)


class RadiologyOrderImageCreateAPIView(RadiologyPermissionMixin, APIView):
    @transaction.atomic
    def post(self, request, order_id):
        order = self.get_order(order_id, for_update=True)
        if order is None:
            return Response({"detail": "검사 오더를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        if order.order_type == ExaminationOrder.OrderType.XRAY:
            image_type = CaseImageAsset.ImageType.XRAY
            workflow_stage = WorkflowStage.XRAY
        elif order.order_type == ExaminationOrder.OrderType.PET_CT_TNM:
            image_type = request.data.get("image_type", CaseImageAsset.ImageType.CT)
            if image_type not in {CaseImageAsset.ImageType.CT, CaseImageAsset.ImageType.PET}:
                return Response(
                    {"image_type": "PET-CT 오더에는 CT 또는 PET 자산만 등록할 수 있습니다."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            workflow_stage = WorkflowStage.PET_CT_TNM
        else:
            image_type = CaseImageAsset.ImageType.CT
            workflow_stage = WorkflowStage.CT

        serializer = RadiologyImageAssetCreateSerializer(
            data=request.data,
            context={"order": order},
        )
        serializer.is_valid(raise_exception=True)
        asset = serializer.save(
            case=order.case,
            examination_order=order,
            image_type=image_type,
            workflow_stage=workflow_stage,
            status=CaseImageAsset.Status.READY,
        )
        return Response(
            RadiologyImageAssetCreateSerializer(asset).data,
            status=status.HTTP_201_CREATED,
        )


class RadiologyOrderXrayImageUploadAPIView(RadiologyPermissionMixin, APIView):
    """Upload original PNG/JPEG bytes before creating a READY X-ray asset."""

    @transaction.atomic
    def post(self, request, order_id):
        order = self.get_order(order_id, for_update=True)
        if order is None:
            return Response({"detail": "검사 오더를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        if order.order_type != ExaminationOrder.OrderType.XRAY:
            return Response({"detail": "X-ray 오더에만 영상을 업로드할 수 있습니다."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = RadiologyXrayImageUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded_file = serializer.validated_data["image"]
        image_bytes = uploaded_file.read()
        content_type = uploaded_file.content_type.lower()
        is_png = image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
        is_jpeg = image_bytes.startswith(b"\xff\xd8\xff")
        if not ((content_type == "image/png" and is_png) or (content_type == "image/jpeg" and is_jpeg)):
            return Response(
                {"image": ["파일 내용이 PNG 또는 JPEG 형식이 아닙니다."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        extensions = (".png",) if content_type == "image/png" else (".jpg", ".jpeg")
        object_path = build_xray_object_path(
            hospital_id=order.case.patient.hospital_id,
            case_id=order.case_id,
            order_id=order.id,
            filename=uploaded_file.name,
            allowed_extensions=extensions,
        )
        storage_uri = f"gs://{settings.XRAY_GCS_BUCKET}/{object_path}"
        if CaseImageAsset.objects.filter(storage_uri=storage_uri).exists():
            return Response(
                {"image": ["동일한 영상 자산이 이미 등록되어 있습니다."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            storage_uri = upload_xray_image(
                image_bytes,
                content_type=content_type,
                hospital_id=order.case.patient.hospital_id,
                case_id=order.case_id,
                order_id=order.id,
                filename=uploaded_file.name,
            )
        except XrayStorageError:
            return Response({"detail": "X-ray 영상을 저장하지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)

        try:
            asset = CaseImageAsset.objects.create(
                case=order.case,
                examination_order=order,
                storage_type=CaseImageAsset.StorageType.GCS,
                storage_uri=storage_uri,
                image_type=CaseImageAsset.ImageType.XRAY,
                workflow_stage=WorkflowStage.XRAY,
                status=CaseImageAsset.Status.READY,
                file_format="PNG" if content_type == "image/png" else "JPEG",
                metadata=None,
            )
        except Exception:
            try:
                delete_xray_image(storage_uri)
            except XrayStorageError:
                pass
            raise
        return Response(RadiologyImageAssetCreateSerializer(asset).data, status=status.HTTP_201_CREATED)


class RadiologyOrderCtSeriesUploadAPIView(RadiologyPermissionMixin, APIView):
    """Upload one CT Series' original DICOM files to Orthanc and register a READY asset.

    Idempotent per (order, series_instance_uid): if a READY asset already exists for
    the requested Series, it is returned as-is without re-uploading to Orthanc.
    """

    @transaction.atomic
    def post(self, request, order_id):
        order = self.get_order(order_id, for_update=True)
        if order is None:
            return Response({"detail": "검사 오더를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        if order.order_type != ExaminationOrder.OrderType.CT:
            return Response({"detail": "CT 오더에만 영상을 업로드할 수 있습니다."}, status=status.HTTP_400_BAD_REQUEST)

        serializer = CtSeriesUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded_files = serializer.validated_data["files"]
        series_instance_uid = serializer.validated_data["series_instance_uid"]

        existing_asset = CaseImageAsset.objects.filter(
            examination_order=order,
            series_instance_uid=series_instance_uid,
            status=CaseImageAsset.Status.READY,
        ).first()
        if existing_asset is not None:
            return Response(RadiologyImageAssetCreateSerializer(existing_asset).data, status=status.HTTP_200_OK)

        try:
            headers = parse_ct_headers(uploaded_files)
            validate_ct_series(headers, expected_series_instance_uid=series_instance_uid)
        except CtSeriesValidationError as exc:
            return Response({"files": exc.errors}, status=status.HTTP_400_BAD_REQUEST)

        try:
            upload_result = upload_ct_series([header.dicom_bytes for header in headers])
        except OrthancError:
            return Response({"detail": "CT 영상을 Orthanc에 저장하지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)

        storage_uri = f"orthanc://series/{upload_result.orthanc_series_id}"
        if CaseImageAsset.objects.filter(storage_uri=storage_uri).exists():
            return Response(
                {"detail": "동일한 영상 자산이 이미 등록되어 있습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            asset = CaseImageAsset.objects.create(
                case=order.case,
                examination_order=order,
                storage_type=CaseImageAsset.StorageType.ORTHANC,
                storage_uri=storage_uri,
                image_type=CaseImageAsset.ImageType.CT,
                workflow_stage=WorkflowStage.CT,
                status=CaseImageAsset.Status.READY,
                file_format="DICOM",
                study_instance_uid=headers[0].study_instance_uid,
                series_instance_uid=series_instance_uid,
                orthanc_study_id=upload_result.orthanc_study_id,
                orthanc_series_id=upload_result.orthanc_series_id,
                metadata=None,
            )
        except Exception:
            try:
                delete_orthanc_series(upload_result.orthanc_series_id)
            except OrthancError:
                pass
            raise
        return Response(RadiologyImageAssetCreateSerializer(asset).data, status=status.HTTP_201_CREATED)


class RadiologyOrderPetSeriesUploadAPIView(RadiologyPermissionMixin, APIView):
    @transaction.atomic
    def post(self, request, order_id):
        order = self.get_order(order_id, for_update=True)
        if order is None:
            return Response({"detail": "검사 오더를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        if order.order_type != ExaminationOrder.OrderType.PET_CT_TNM:
            return Response({"detail": "PET-CT TNM 오더에서만 PET 영상을 업로드할 수 있습니다."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = PetSeriesUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        files = serializer.validated_data["files"]
        series_uid = serializer.validated_data["series_instance_uid"]
        existing = CaseImageAsset.objects.filter(examination_order=order, series_instance_uid=series_uid, status=CaseImageAsset.Status.READY).first()
        if existing:
            return Response(RadiologyImageAssetCreateSerializer(existing).data, status=status.HTTP_200_OK)
        try:
            headers = parse_ct_headers(files)
            validate_pet_series(headers, expected_series_instance_uid=series_uid)
        except CtSeriesValidationError as exc:
            return Response({"files": exc.errors}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = upload_ct_series([header.dicom_bytes for header in headers])
        except OrthancError:
            return Response({"detail": "PET 영상을 Orthanc에 저장하지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        storage_uri = f"orthanc://series/{result.orthanc_series_id}"
        if CaseImageAsset.objects.filter(storage_uri=storage_uri).exists():
            try:
                delete_orthanc_series(result.orthanc_series_id)
            except OrthancError:
                pass
            return Response({"detail": "동일한 영상 자산이 이미 등록되어 있습니다."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            asset = CaseImageAsset.objects.create(
                case=order.case, examination_order=order,
                storage_type=CaseImageAsset.StorageType.ORTHANC, storage_uri=storage_uri,
                image_type=CaseImageAsset.ImageType.PET, workflow_stage=WorkflowStage.PET_CT_TNM,
                status=CaseImageAsset.Status.READY, file_format="DICOM",
                study_instance_uid=headers[0].study_instance_uid, series_instance_uid=series_uid,
                orthanc_study_id=result.orthanc_study_id, orthanc_series_id=result.orthanc_series_id,
                metadata=None,
            )
        except Exception:
            try:
                delete_orthanc_series(result.orthanc_series_id)
            except OrthancError:
                pass
            raise
        return Response(RadiologyImageAssetCreateSerializer(asset).data, status=status.HTTP_201_CREATED)


class RadiologyOrderPetTnmAnalysisResetAPIView(RadiologyPermissionMixin, APIView):
    """Return a failed PET-CT/TNM order to the PET upload step without erasing history."""

    @transaction.atomic
    def post(self, request, order_id):
        order = self.get_order(order_id, for_update=True)
        if order is None:
            return Response({"detail": "검사 오더를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        if order.order_type != ExaminationOrder.OrderType.PET_CT_TNM:
            return Response(
                {"detail": "PET-CT/TNM 오더에서만 실패 분석을 초기화할 수 있습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = (
            AiAnalysis.objects.select_for_update()
            .filter(
                case=order.case,
                source_image_asset__examination_order=order,
                analysis_type=AnalysisType.PET_CT_TNM_ANALYSIS,
            )
            .select_related("source_image_asset")
            .order_by("-created_at")
            .first()
        )
        if analysis is None or analysis.status != AiAnalysis.Status.FAILED:
            return Response(
                {"detail": "실패한 PET-CT/TNM 분석에서만 업로드 단계로 되돌릴 수 있습니다."},
                status=status.HTTP_409_CONFLICT,
            )

        asset = analysis.source_image_asset
        if (
            asset is None
            or asset.examination_order_id != order.id
            or asset.image_type != CaseImageAsset.ImageType.PET
            or asset.workflow_stage != WorkflowStage.PET_CT_TNM
            or asset.status != CaseImageAsset.Status.READY
        ):
            return Response(
                {"detail": "초기화할 READY PET 영상 자산을 찾을 수 없습니다."},
                status=status.HTTP_409_CONFLICT,
            )

        metadata = asset.metadata if isinstance(asset.metadata, dict) else {}
        metadata = {
            **metadata,
            "pet_tnm_reset": {
                "analysis_id": str(analysis.id),
                "storage_uri": asset.storage_uri,
                "series_instance_uid": asset.series_instance_uid,
                "orthanc_study_id": asset.orthanc_study_id,
                "orthanc_series_id": asset.orthanc_series_id,
                "reset_at": timezone.now().isoformat(),
            },
        }
        asset.status = CaseImageAsset.Status.INVALID
        asset.storage_uri = f"reset://pet-tnm/{asset.id}"
        asset.series_instance_uid = None
        asset.orthanc_study_id = None
        asset.orthanc_series_id = None
        asset.metadata = metadata
        asset.save(
            update_fields=[
                "status",
                "storage_uri",
                "series_instance_uid",
                "orthanc_study_id",
                "orthanc_series_id",
                "metadata",
                "updated_at",
            ]
        )

        return Response(
            {
                "order_id": str(order.id),
                "analysis_id": str(analysis.id),
                "invalidated_asset_id": str(asset.id),
            },
            status=status.HTTP_200_OK,
        )


class RadiologyOrderXrayImageContentAPIView(RadiologyPermissionMixin, APIView):
    """Return an authorized X-ray asset without exposing its gs:// URI to the browser."""

    def get(self, request, order_id, asset_id):
        order = self.get_order(order_id)
        if order is None:
            return Response({"detail": "검사 오더를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        asset = CaseImageAsset.objects.filter(
            id=asset_id,
            examination_order=order,
            image_type=CaseImageAsset.ImageType.XRAY,
            storage_type=CaseImageAsset.StorageType.GCS,
            status=CaseImageAsset.Status.READY,
        ).first()
        if asset is None:
            return Response({"detail": "X-ray 영상 자산을 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        try:
            image_bytes = download_xray_image_bytes(asset.storage_uri)
        except XrayStorageError:
            return Response({"detail": "X-ray 영상을 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        content_type = "image/png" if asset.file_format.upper() == "PNG" else "image/jpeg"
        return HttpResponse(image_bytes, content_type=content_type)


class _PassthroughContentNegotiation(BaseContentNegotiation):
    """Skip Accept-header negotiation for views that hand back a raw proxied body.

    DRF's default negotiation 406s any Accept value that doesn't match a
    configured Renderer (JSON/browsable API), but these views forward a
    DICOMweb client's own Accept header (application/dicom, dicom+json, ...)
    straight through to Orthanc and return whatever it sends back.
    """

    def select_parser(self, request, parsers):
        return parsers[0] if parsers else None

    def select_renderer(self, request, renderers, format_suffix):
        return renderers[0], renderers[0].media_type


# The X-ray content view returns a raw image response, so it must bypass DRF's
# JSON renderer negotiation just like the DICOM proxy views below.
RadiologyOrderXrayImageContentAPIView.content_negotiation_class = _PassthroughContentNegotiation


class RadiologyOrderCtDicomWebMixin(RadiologyPermissionMixin):
    content_negotiation_class = _PassthroughContentNegotiation

    """Scope every DICOMweb call to one authorized, already-uploaded CT Series."""

    def get_ct_asset(self, order_id, asset_id):
        order = self.get_order(order_id)
        if order is None:
            return None
        return CaseImageAsset.objects.filter(
            id=asset_id,
            examination_order=order,
            image_type=CaseImageAsset.ImageType.CT,
            storage_type=CaseImageAsset.StorageType.ORTHANC,
            status=CaseImageAsset.Status.READY,
        ).first()

    def get_ct_asset_or_404(self, order_id, asset_id):
        asset = self.get_ct_asset(order_id, asset_id)
        if asset is None or not asset.study_instance_uid or not asset.series_instance_uid:
            return None
        return asset


class RadiologyOrderCtDicomWebMetadataAPIView(RadiologyOrderCtDicomWebMixin, APIView):
    """WADO-RS Series metadata for an already-uploaded CT Series, proxied without Orthanc credentials."""

    def get(self, request, order_id, asset_id):
        asset = self.get_ct_asset_or_404(order_id, asset_id)
        if asset is None:
            return Response({"detail": "CT 영상 자산을 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        try:
            result = get_series_metadata(asset.study_instance_uid, asset.series_instance_uid)
        except OrthancDicomWebError:
            return Response({"detail": "CT Series metadata를 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        return HttpResponse(result.content, content_type=result.content_type)


class RadiologyOrderCtDicomWebInstancesAPIView(RadiologyOrderCtDicomWebMixin, APIView):
    """QIDO-RS Instance list for an already-uploaded CT Series."""

    def get(self, request, order_id, asset_id):
        asset = self.get_ct_asset_or_404(order_id, asset_id)
        if asset is None:
            return Response({"detail": "CT 영상 자산을 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        try:
            result = list_series_instances(asset.study_instance_uid, asset.series_instance_uid)
        except OrthancDicomWebError:
            return Response({"detail": "CT Series instance 목록을 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        return HttpResponse(result.content, content_type=result.content_type)


class RadiologyOrderCtDicomWebInstanceAPIView(RadiologyOrderCtDicomWebMixin, APIView):
    """WADO-RS single Instance retrieval, scoped to its own Study/Series."""

    def get(self, request, order_id, asset_id, sop_instance_uid):
        asset = self.get_ct_asset_or_404(order_id, asset_id)
        if asset is None:
            return Response({"detail": "CT 영상 자산을 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        try:
            result = retrieve_instance(asset.study_instance_uid, asset.series_instance_uid, sop_instance_uid)
        except OrthancDicomWebError:
            return Response({"detail": "CT instance를 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        response = HttpResponse(result.content, content_type=result.content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class RadiologyOrderCtDicomWebFrameAPIView(RadiologyOrderCtDicomWebMixin, APIView):
    """Proxy one WADO-RS frame while keeping its multipart envelope intact."""

    def get(self, request, order_id, asset_id, sop_instance_uid, frame_number):
        asset = self.get_ct_asset_or_404(order_id, asset_id)
        if asset is None:
            return Response({"detail": "CT 영상 자산을 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)
        try:
            result = retrieve_instance_frame(
                asset.study_instance_uid,
                asset.series_instance_uid,
                sop_instance_uid,
                frame_number,
            )
        except OrthancDicomWebError:
            return Response({"detail": "CT frame을 불러오지 못했습니다."}, status=status.HTTP_502_BAD_GATEWAY)
        response = HttpResponse(result.content, content_type=result.content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response


class RadiologyOrderAnalysisCreateAPIView(RadiologyPermissionMixin, APIView):
    @transaction.atomic
    def post(self, request, order_id):
        order = self.get_order(order_id, for_update=True)
        if order is None:
            return Response({"detail": "검사 오더를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        if order.order_type == ExaminationOrder.OrderType.XRAY:
            analysis_type = AnalysisType.XRAY_ANALYSIS
            assets = order.image_assets.filter(
                status=CaseImageAsset.Status.READY,
                image_type=CaseImageAsset.ImageType.XRAY,
            )
        elif order.order_type == ExaminationOrder.OrderType.PET_CT_TNM:
            analysis_type = AnalysisType.PET_CT_TNM_ANALYSIS
            assets = order.image_assets.filter(
                status=CaseImageAsset.Status.READY,
                image_type=CaseImageAsset.ImageType.PET,
                workflow_stage=WorkflowStage.PET_CT_TNM,
            )
        else:
            analysis_type = AnalysisType.CT_ANALYSIS
            assets = order.image_assets.filter(
                status=CaseImageAsset.Status.READY,
                image_type=CaseImageAsset.ImageType.CT,
                workflow_stage=WorkflowStage.CT,
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
            examination_order=order,
            source_image_asset=asset,
            analysis_type=analysis_type,
            model_version=model_version,
            status=AiAnalysis.Status.PENDING,
        )
        if analysis_type == AnalysisType.XRAY_ANALYSIS:
            transaction.on_commit(
                lambda analysis_id=str(analysis.id): run_xray_analysis.delay(analysis_id)
            )
        elif analysis_type == AnalysisType.CT_ANALYSIS:
            transaction.on_commit(
                lambda analysis_id=str(analysis.id): run_ct_analysis.delay(analysis_id)
            )
        elif analysis_type == AnalysisType.PET_CT_TNM_ANALYSIS:
            transaction.on_commit(
                lambda analysis_id=str(analysis.id): run_tnm_analysis.delay(analysis_id)
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
        serializer = RadiologyAiResultSerializer(analysis, context={"request": request})
        if serializer.data["result"] is None:
            return Response(
                {"detail": "분석 유형에 맞는 상세 결과가 없습니다."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(serializer.data)


class RadiologyAnalysisVisualizationAPIView(RadiologyPermissionMixin, APIView):
    """Proxy an authorized private CT GLB layer without exposing its GCS URI."""

    content_negotiation_class = _PassthroughContentNegotiation

    def get(self, request, analysis_id, layer_id):
        analysis = self.get_analysis(analysis_id)
        if (
            analysis is None
            or analysis.analysis_type != AnalysisType.CT_ANALYSIS
            or analysis.status != AiAnalysis.Status.SUCCEEDED
            or not hasattr(analysis, "ai_result")
        ):
            return Response({"detail": "CT visualization was not found."}, status=status.HTTP_404_NOT_FOUND)

        payload = analysis.ai_result.result_payload
        visualization = payload.get("visualization") if isinstance(payload, dict) else None
        layers = visualization.get("layers", []) if isinstance(visualization, dict) else []
        layer = next(
            (item for item in layers if isinstance(item, dict) and item.get("id") == layer_id),
            None,
        )
        if layer is None or not layer.get("mesh_uri"):
            return Response({"detail": "CT visualization layer was not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            content = download_ct_visualization(layer["mesh_uri"])
        except CtVisualizationStorageError:
            return Response({"detail": "CT visualization could not be loaded."}, status=status.HTTP_502_BAD_GATEWAY)
        response = HttpResponse(content, content_type="model/gltf-binary")
        response["Cache-Control"] = "private, max-age=3600"
        return response


def _get_cornerstone_segmentation(analysis):
    if (
        analysis is None
        or analysis.analysis_type != AnalysisType.CT_ANALYSIS
        or analysis.status != AiAnalysis.Status.SUCCEEDED
        or not hasattr(analysis, "ai_result")
    ):
        return None
    payload = analysis.ai_result.result_payload
    cornerstone = payload.get("cornerstone_segmentation") if isinstance(payload, dict) else None
    return cornerstone if isinstance(cornerstone, dict) else None


class RadiologyAnalysisCornerstoneSegmentationAPIView(RadiologyPermissionMixin, APIView):
    """Return Cornerstone3D labelmap metadata without exposing its private GCS URIs."""

    def get(self, request, analysis_id):
        analysis = self.get_analysis(analysis_id)
        cornerstone = _get_cornerstone_segmentation(analysis)
        if cornerstone is None or not cornerstone.get("geometry_uri"):
            return Response({"detail": "CT Cornerstone segmentation was not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            geometry = json.loads(download_ct_cornerstone_object(cornerstone["geometry_uri"]).decode("utf-8"))
        except (CtCornerstoneStorageError, ValueError, UnicodeDecodeError):
            return Response({"detail": "CT Cornerstone segmentation could not be loaded."}, status=status.HTTP_502_BAD_GATEWAY)

        labelmap_path = reverse(
            "radiology:analysis-cornerstone-labelmap",
            kwargs={"analysis_id": analysis.id},
        )
        return Response({
            "schema_version": cornerstone.get("schema_version"),
            "scalar_type": cornerstone.get("scalar_type"),
            "dimensions": cornerstone.get("dimensions"),
            "spacing": geometry.get("spacing"),
            "origin": geometry.get("origin"),
            "direction": geometry.get("direction"),
            "segments": cornerstone.get("segments", []),
            "labelmap_url": request.build_absolute_uri(labelmap_path),
        })


class RadiologyAnalysisCornerstoneLabelmapAPIView(RadiologyPermissionMixin, APIView):
    """Proxy an authorized private Cornerstone3D labelmap without exposing its GCS URI."""

    content_negotiation_class = _PassthroughContentNegotiation

    def get(self, request, analysis_id):
        analysis = self.get_analysis(analysis_id)
        cornerstone = _get_cornerstone_segmentation(analysis)
        if cornerstone is None or not cornerstone.get("labelmap_uri"):
            return Response({"detail": "CT Cornerstone segmentation was not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            content = download_ct_cornerstone_object(cornerstone["labelmap_uri"])
        except CtCornerstoneStorageError:
            return Response({"detail": "CT Cornerstone segmentation could not be loaded."}, status=status.HTTP_502_BAD_GATEWAY)
        response = HttpResponse(content, content_type="application/octet-stream")
        response["Cache-Control"] = "private, max-age=3600"
        return response


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
