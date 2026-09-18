from django.db import transaction
from django.db.models import Case, Count, IntegerField, Prefetch, Q, When
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.utils import timezone
from hashlib import sha256
from pathlib import Path
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.permissions import IsActiveStaff, IsPathologyStaff, IsTechnologist
from apps.ai_results.models import AiAnalysis, AnalysisType, ModelVersion
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.clinical.models import ClinicalResult
from apps.radiology.views import _PassthroughContentNegotiation

from .models import PathologySpecimen, PathologyWorkItem, WholeSlideImage
from .serializers import (
    PathologyAiAnalysisSerializer,
    PathologyGeneAnalysisRunSerializer,
    PDL1AnalysisRunSerializer,
    PDL1InputUploadSerializer,
    PathologyDiagnosisSerializer,
    PathologyDiagnosisConfirmSerializer,
    PathologyDiagnosisWriteSerializer,
    PathologyReviewSubmissionSerializer,
    PathologyReportSerializer,
    PathologySpecimenSerializer,
    PathologyWorkItemSerializer,
    PathologyWorkstationSerializer,
    WholeSlideImageSerializer,
    PathologyGeneInputUploadSerializer,
)
from .services.pdl1_sample_catalog import PDL1SampleCatalogError, list_pdl1_test_samples
from .services.review_submission import ReviewSubmissionError, submit_for_review
from .services.orthanc import OrthancError, get_wsi_pyramid, get_wsi_tile
from .services.workflow import PathologyWorkflowStatus, calculate_workflow_status
from .tasks import run_pathology_gene_analysis, run_pdl1_analysis
from .services.pdl1_storage import PDL1StorageError, delete_pdl1_input, upload_pdl1_input
from .services.pathology_storage import (
    PathologyStorageError,
    download_pathology_wsi_preview,
    upload_pathology_wsi,
)

PATHOLOGY_STAFF_PERMISSIONS = [IsAuthenticated, IsActiveStaff, IsTechnologist, IsPathologyStaff]


def pathology_hospital_id(request):
    return request.user.department_role.department.hospital_id


class PathologyStaffAPIViewMixin:
    authentication_classes = [JWTAuthentication]
    permission_classes = PATHOLOGY_STAFF_PERMISSIONS


class PathologyWorkstationPagination(PageNumberPagination):
    page_size = 10


def _pathology_order(work_item):
    if work_item.examination_order_id:
        return work_item.examination_order
    if work_item.specimen_id:
        return work_item.specimen.examination_order
    if work_item.wsi_id:
        return work_item.wsi.specimen.examination_order
    return None


def _workstation_queryset(request):
    analysis_queryset = (
        AiAnalysis.objects.filter(
            analysis_type__in=[
                AnalysisType.PATHOLOGY_GENE_ANALYSIS,
                AnalysisType.PDL1_ANALYSIS,
            ],
        )
        .select_related(
            "examination_order", "source_image_asset__examination_order",
            "model_version", "ai_result", "ai_result__pathology_detail",
            "ai_result__pdl1_detail",
        )
        .prefetch_related("ai_result__gene_ai_results")
        .order_by("-created_at")
    )
    review_queryset = PathologyWorkItem.objects.filter(
        task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
    ).select_related(
        "examination_order", "specimen__examination_order",
        "wsi__specimen__examination_order",
    ).order_by("-created_at")
    confirmed_queryset = ClinicalResult.objects.filter(
        workflow_stage__in=["PATHOLOGY_GENE", "PDL1"],
        result_status=ClinicalResult.ResultStatus.CONFIRMED,
    ).select_related(
        "pathology_detail", "confirmed_by_user", "examination_order",
        "source_image_asset__examination_order",
        "reviewed_ai_result__ai_analysis__examination_order",
        "reviewed_ai_result__ai_analysis__source_image_asset__examination_order",
    ).order_by("-confirmed_at", "-created_at")
    wsi_queryset = WholeSlideImage.objects.select_related("image_asset").order_by("-created_at")
    return (
        PathologyWorkItem.objects.filter(
            case__patient__hospital_id=pathology_hospital_id(request),
        )
        .select_related(
            "case", "case__patient", "examination_order",
            "examination_order__requesting_doctor", "specimen",
            "specimen__examination_order", "specimen__examination_order__requesting_doctor",
            "wsi__specimen__examination_order",
            "wsi__specimen__examination_order__requesting_doctor", "assigned_to",
        )
        .prefetch_related(
            Prefetch("specimen__wsis", queryset=wsi_queryset, to_attr="workstation_wsis"),
            Prefetch("case__ai_analyses", queryset=analysis_queryset, to_attr="workstation_analyses"),
            Prefetch("case__pathology_work_items", queryset=review_queryset, to_attr="workstation_review_items"),
            Prefetch("case__clinical_results", queryset=confirmed_queryset, to_attr="workstation_confirmed_results"),
        )
        .order_by("-updated_at")
    )


class CasePathologyDiagnosisListAPIView(ListAPIView):
    serializer_class = PathologyDiagnosisSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            ClinicalResult.objects.filter(
                case_id=self.kwargs["case_id"],
                workflow_stage="PATHOLOGY_GENE",
            )
            .select_related(
                "pathology_detail",
                "gene_detail",
                "confirmed_by_user",
            )
            .prefetch_related("gene_detail__gene_findings")
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
                workflow_stage="PATHOLOGY_GENE",
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
                "gene_detail",
                "confirmed_by_user",
            ).prefetch_related("gene_detail__gene_findings"),
            id=diagnosis_id,
            workflow_stage="PATHOLOGY_GENE",
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


class CasePathologyAiAnalysisListAPIView(PathologyStaffAPIViewMixin, ListAPIView):
    serializer_class = PathologyAiAnalysisSerializer

    def get_queryset(self):
        return (
            AiAnalysis.objects.filter(
                case_id=self.kwargs["case_id"],
                analysis_type="PATHOLOGY_GENE_ANALYSIS",
            )
            .select_related(
                "case",
                "model_version",
                "ai_result",
                "ai_result__pathology_detail",
            )
            .order_by("-created_at")
        )


class PathologyOrderPathologyGeneInputUploadAPIView(PathologyStaffAPIViewMixin, APIView):
    def post(self, request, order_id):
        hospital_id = pathology_hospital_id(request)

        order = get_object_or_404(
            ExaminationOrder.objects.select_related("case"),
            id=order_id,
            case__patient__hospital_id=hospital_id,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
        )

        serializer = PathologyGeneInputUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        wsi_file = serializer.validated_data["wsi_file"]
        original_filename = wsi_file.name

        try:
            wsi_uri = upload_pathology_wsi(
                hospital_id=hospital_id,
                case_id=order.case_id,
                order_id=order.id,
                uploaded_file=wsi_file,
            )

            wsi_file.seek(0)
            file_sha256 = sha256(wsi_file.read()).hexdigest()

            with transaction.atomic():
                specimen, _ = PathologySpecimen.objects.get_or_create(
                    case=order.case,
                    examination_order=order,
                    defaults={
                        "specimen_code": f"HE-{order.id}",
                        "specimen_type": PathologySpecimen.SpecimenType.OTHER,
                        "status": PathologySpecimen.Status.READY,
                        "created_by_user": request.user,
                    },
                )

                WholeSlideImage.objects.filter(
                    specimen=specimen,
                    stain=WholeSlideImage.Stain.HE,
                    is_current=True,
                ).update(is_current=False)

                image_asset = CaseImageAsset.objects.create(
                    case=order.case,
                    examination_order=order,
                    workflow_stage=WorkflowStage.PATHOLOGY_GENE,
                    image_type=CaseImageAsset.ImageType.WSI,
                    storage_type=CaseImageAsset.StorageType.GCS,
                    storage_uri=wsi_uri,
                    file_format=".svs",
                    status=CaseImageAsset.Status.READY,
                )

                wsi = WholeSlideImage.objects.create(
                    specimen=specimen,
                    image_asset=image_asset,
                    slide_code=f"HE-{order.id}",
                    stain=WholeSlideImage.Stain.HE,
                    original_filename=original_filename,
                    sha256=file_sha256,
                    is_current=True,
                    uploaded_by_user=request.user,
                )

                PathologyWorkItem.objects.filter(
                    case=order.case,
                    examination_order=order,
                ).update(
                    specimen=specimen,
                    wsi=wsi,
                )

        except Exception:
            raise

        return Response(
            {
                "wsi_id": wsi.id,
                "storage_uri": wsi_uri,
                "original_filename": original_filename,
            },
            status=status.HTTP_201_CREATED,
        )


class CasePathologyGeneAnalysisRunAPIView(PathologyStaffAPIViewMixin, APIView):
    @transaction.atomic
    def post(self, request, case_id):
        case = get_object_or_404(
            LungCancerCase,
            id=case_id,
            patient__hospital_id=pathology_hospital_id(request),
        )
        serializer = PathologyGeneAnalysisRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        wsi_id = serializer.validated_data["wsi_id"]
        wsi = WholeSlideImage.objects.select_related(
            "image_asset",
            "specimen__examination_order",
        ).filter(
            id=wsi_id,
            specimen__case=case,
            specimen__examination_order__order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
        ).exclude(
            specimen__examination_order__status=ExaminationOrder.Status.CANCELLED,
        ).filter(
            stain=WholeSlideImage.Stain.HE,
            is_current=True,
            image_asset__storage_type=CaseImageAsset.StorageType.GCS,
            image_asset__status=CaseImageAsset.Status.READY,
        ).first()
        if wsi is None or not wsi.image_asset.storage_uri.startswith("gs://"):
            raise ValidationError({"detail": "A READY H&E WSI stored in GCS is required."})
        order = ExaminationOrder.objects.select_for_update().get(
            id=wsi.specimen.examination_order_id,
        )
        if AiAnalysis.objects.filter(
            examination_order=order,
            analysis_type=AnalysisType.PATHOLOGY_GENE_ANALYSIS,
            status__in=[AiAnalysis.Status.PENDING, AiAnalysis.Status.RUNNING],
        ).exists():
            raise ValidationError({"detail": "A pathology/gene analysis is already pending or running."})
        model_version = ModelVersion.objects.filter(
            model_name="pathology-analysis",
            version="pathology-analysis-v1",
            analysis_type=AnalysisType.PATHOLOGY_GENE_ANALYSIS,
        ).first()
        if model_version is None:
            return Response(
                {"detail": "No pathology/gene model version is available."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        analysis = AiAnalysis.objects.create(
            case=case,
            examination_order=order,
            source_image_asset=wsi.image_asset,
            analysis_type=AnalysisType.PATHOLOGY_GENE_ANALYSIS,
            model_version=model_version,
            status=AiAnalysis.Status.PENDING,
            input_metadata={"wsi_id": str(wsi.id)},
        )
        transaction.on_commit(
            lambda analysis_id=str(analysis.id): run_pathology_gene_analysis.delay(analysis_id)
        )
        return Response(PathologyAiAnalysisSerializer(analysis).data, status=status.HTTP_201_CREATED)


class CasePathologyGeneAnalysisCancelAPIView(PathologyStaffAPIViewMixin, APIView):
    @transaction.atomic
    def post(self, request, case_id, analysis_id):
        case = get_object_or_404(
            LungCancerCase,
            id=case_id,
            patient__hospital_id=pathology_hospital_id(request),
        )
        analysis = get_object_or_404(
            AiAnalysis.objects.select_for_update().filter(
                id=analysis_id,
                case=case,
                analysis_type=AnalysisType.PATHOLOGY_GENE_ANALYSIS,
            ),
        )
        if not WholeSlideImage.objects.filter(
            specimen__case=case,
            specimen__examination_order__order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            image_asset_id=analysis.source_image_asset_id,
            stain=WholeSlideImage.Stain.HE,
            is_current=True,
        ).exists():
            raise ValidationError({"detail": "This analysis is not linked to the current H&E WSI."})
        if analysis.status not in [AiAnalysis.Status.PENDING, AiAnalysis.Status.RUNNING]:
            raise ValidationError({"detail": "Only pending or running pathology/gene analyses can be cancelled."})

        analysis.status = AiAnalysis.Status.CANCELLED
        analysis.completed_at = timezone.now()
        analysis.error_message = None
        analysis.save(update_fields=["status", "completed_at", "error_message"])
        return Response(PathologyAiAnalysisSerializer(analysis).data)



class CasePDL1AiAnalysisListAPIView(PathologyStaffAPIViewMixin, ListAPIView):
    serializer_class = PathologyAiAnalysisSerializer

    def get_queryset(self):
        return (
            AiAnalysis.objects.filter(
                case_id=self.kwargs["case_id"],
                case__patient__hospital_id=pathology_hospital_id(self.request),
                analysis_type="PDL1_ANALYSIS",
            )
            .select_related(
                "case",
                "model_version",
                "ai_result",
                "ai_result__pdl1_detail",
            )
            .order_by("-created_at")
        )


class PDL1TestSampleListAPIView(PathologyStaffAPIViewMixin, APIView):
    def get(self, request):
        try:
            return Response({"results": list_pdl1_test_samples()})
        except PDL1SampleCatalogError:
            return Response(
                {"detail": "PD-L1 test sample catalog is unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class PathologyOrderPDL1InputUploadAPIView(PathologyStaffAPIViewMixin, APIView):
    @transaction.atomic
    def post(self, request, order_id):
        order = get_object_or_404(
            ExaminationOrder.objects.select_for_update().select_related("case__patient"),
            id=order_id,
            case__patient__hospital_id=pathology_hospital_id(request),
            order_type=ExaminationOrder.OrderType.PDL1,
        )
        if WholeSlideImage.objects.filter(
            specimen__examination_order=order,
            stain=WholeSlideImage.Stain.PDL1,
            is_current=True,
            image_asset__status=CaseImageAsset.Status.READY,
        ).exists():
            raise ValidationError({"wsi_file": "A READY PD-L1 input is already linked to this order."})
        serializer = PDL1InputUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        wsi_file = serializer.validated_data["wsi_file"]
        annotation_file = serializer.validated_data["annotation_file"]
        wsi_bytes = wsi_file.read()
        annotation_bytes = annotation_file.read()
        hospital_id, case_id = order.case.patient.hospital_id, order.case_id
        wsi_uri = annotation_uri = None
        try:
            wsi_uri = upload_pdl1_input(
                data=wsi_bytes, hospital_id=hospital_id, case_id=case_id, order_id=order.id,
                kind="wsi", filename=wsi_file.name, content_type=wsi_file.content_type,
            )
            annotation_uri = upload_pdl1_input(
                data=annotation_bytes, hospital_id=hospital_id, case_id=case_id, order_id=order.id,
                kind="annotation", filename=annotation_file.name, content_type=annotation_file.content_type,
            )
        except PDL1StorageError:
            if wsi_uri:
                delete_pdl1_input(wsi_uri)
            return Response({"detail": "PD-L1 input upload failed."}, status=status.HTTP_502_BAD_GATEWAY)
        try:
            specimen, _ = PathologySpecimen.objects.get_or_create(
                case=order.case,
                examination_order=order,
                defaults={
                    "specimen_code": f"PDL1-{order.id}",
                    "specimen_type": PathologySpecimen.SpecimenType.OTHER,
                    "status": PathologySpecimen.Status.READY,
                    "created_by_user": request.user,
                },
            )
            asset = CaseImageAsset.objects.create(
                case=order.case, examination_order=order, workflow_stage=WorkflowStage.PDL1,
                image_type=CaseImageAsset.ImageType.WSI, storage_type=CaseImageAsset.StorageType.GCS,
                storage_uri=wsi_uri, file_format=Path(wsi_file.name).suffix.lstrip(".").upper(),
                status=CaseImageAsset.Status.READY,
                metadata={"pdl1_annotation": {"storage_uri": annotation_uri, "roi_layer": serializer.validated_data["roi_layer"]}},
            )
            wsi = WholeSlideImage.objects.create(
                specimen=specimen, image_asset=asset, slide_code=Path(wsi_file.name).stem[:50],
                stain=WholeSlideImage.Stain.PDL1, original_filename=wsi_file.name,
                sha256=sha256(wsi_bytes).hexdigest(), uploaded_by_user=request.user,
            )
            PathologyWorkItem.objects.filter(case=order.case, examination_order=order).update(specimen=specimen, wsi=wsi)
        except Exception:
            if annotation_uri:
                delete_pdl1_input(annotation_uri)
            if wsi_uri:
                delete_pdl1_input(wsi_uri)
            raise
        return Response({"wsi": WholeSlideImageSerializer(wsi).data, "upload_ready": True}, status=status.HTTP_201_CREATED)


class CasePDL1AnalysisRunAPIView(PathologyStaffAPIViewMixin, APIView):
    @transaction.atomic
    def post(self, request, case_id):
        case = get_object_or_404(LungCancerCase, id=case_id, patient__hospital_id=pathology_hospital_id(request))
        PDL1AnalysisRunSerializer(data=request.data).is_valid(raise_exception=True)
        order = (
            ExaminationOrder.objects.select_for_update().filter(
                case=case,
                order_type=ExaminationOrder.OrderType.PDL1,
            ).exclude(status=ExaminationOrder.Status.CANCELLED).order_by("-created_at").first()
        )
        if order is None:
            raise ValidationError({"detail": "This case has no active independent PD-L1 order."})
        wsi = WholeSlideImage.objects.select_related("image_asset").filter(
            specimen__examination_order=order, stain=WholeSlideImage.Stain.PDL1,
            is_current=True, image_asset__storage_type=CaseImageAsset.StorageType.GCS,
            image_asset__status=CaseImageAsset.Status.READY,
        ).order_by("-created_at").first()
        if wsi is None or not (wsi.image_asset.metadata or {}).get("pdl1_annotation", {}).get("storage_uri"):
            raise ValidationError({"detail": "Upload both PD-L1 WSI and HALO annotation before analysis."})
        if AiAnalysis.objects.filter(examination_order=order, analysis_type=AnalysisType.PDL1_ANALYSIS, status__in=[AiAnalysis.Status.PENDING, AiAnalysis.Status.RUNNING]).exists():
            raise ValidationError({"detail": "A PD-L1 analysis is already pending or running."})
        model_version = ModelVersion.objects.filter(model_name="pdl1-amd-mil", version="final_model", analysis_type=AnalysisType.PDL1_ANALYSIS).first()
        if model_version is None:
            return Response({"detail": "No PD-L1 model version is available."}, status=status.HTTP_400_BAD_REQUEST)
        analysis = AiAnalysis.objects.create(
            case=case, examination_order=order, source_image_asset=wsi.image_asset,
            analysis_type=AnalysisType.PDL1_ANALYSIS, model_version=model_version,
            status=AiAnalysis.Status.PENDING,
            input_metadata={"roi_layer": wsi.image_asset.metadata["pdl1_annotation"]["roi_layer"]},
        )
        transaction.on_commit(lambda analysis_id=str(analysis.id): run_pdl1_analysis.delay(analysis_id))
        return Response(PathologyAiAnalysisSerializer(analysis).data, status=status.HTTP_201_CREATED)


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


class PathologyWorkstationListAPIView(PathologyStaffAPIViewMixin, ListAPIView):
    serializer_class = PathologyWorkstationSerializer
    pagination_class = PathologyWorkstationPagination

    def get_queryset(self):
        queryset = _workstation_queryset(self.request)
        workflow_status_value = self.request.query_params.get("workflow_status")
        task_type_value = self.request.query_params.get("task_type")
        assigned_to_value = self.request.query_params.get("assigned_to")
        order_type_value = self.request.query_params.get("order_type")

        if task_type_value:
            queryset = queryset.filter(task_type=task_type_value)

        if assigned_to_value:
            queryset = queryset.filter(assigned_to_id=assigned_to_value)

        if order_type_value:
            queryset = queryset.filter(
                Q(examination_order__order_type=order_type_value)
                | Q(
                    examination_order__isnull=True,
                    specimen__examination_order__order_type=order_type_value,
                )
                | Q(
                    examination_order__isnull=True,
                    specimen__examination_order__isnull=True,
                    wsi__specimen__examination_order__order_type=order_type_value,
                )
            ).distinct()

        representatives = []
        seen_case_ids = set()
        ordered_work_items = sorted(
            queryset,
            key=lambda item: (
                _pathology_order(item).created_at
                if _pathology_order(item) is not None
                else item.created_at,
                item.updated_at,
            ),
            reverse=True,
        )
        for work_item in ordered_work_items:
            if work_item.case_id in seen_case_ids:
                continue
            seen_case_ids.add(work_item.case_id)
            representatives.append(work_item)

        representatives = [
            work_item
            for work_item in representatives
            if calculate_workflow_status(work_item) != PathologyWorkflowStatus.REVIEW_COMPLETED
        ]

        if workflow_status_value:
            public_workflow_statuses = {
                PathologyWorkflowStatus.SCHEDULED,
                PathologyWorkflowStatus.SPECIMEN_COMPLETED,
                PathologyWorkflowStatus.AI_COMPLETED,
                PathologyWorkflowStatus.REVIEW_COMPLETED,
            }
            if workflow_status_value not in public_workflow_statuses:
                raise ValidationError(
                    {"workflow_status": "吏?먰븯吏 ?딅뒗 蹂묐━ workflow ?곹깭?낅땲??"}
                )

            representatives = [
                work_item
                for work_item in representatives
                if calculate_workflow_status(work_item) == workflow_status_value
            ]

        return representatives


class PathologyCaseWorkflowAPIView(PathologyStaffAPIViewMixin, APIView):
    order_rank = {
        ExaminationOrder.OrderType.PATHOLOGY_GENE: 0,
        ExaminationOrder.OrderType.PDL1: 1,
    }

    def get(self, request, case_id):
        case = get_object_or_404(
            LungCancerCase.objects.select_related("patient"),
            id=case_id,
            patient__hospital_id=pathology_hospital_id(request),
        )
        work_items_by_order = {}
        for work_item in _workstation_queryset(request).filter(case=case):
            order = _pathology_order(work_item)
            if order is None or order.order_type not in self.order_rank:
                continue
            current = work_items_by_order.get(order.id)
            if current is None or (
                current.task_type == PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW
                and work_item.task_type != PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW
            ):
                work_items_by_order[order.id] = work_item

        work_items = sorted(
            work_items_by_order.values(),
            key=lambda item: (
                self.order_rank[_pathology_order(item).order_type],
                _pathology_order(item).created_at,
            ),
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
                    "name": case.patient.name,
                    "patient_code": case.patient.patient_code,
                    "birth_date": case.patient.birth_date,
                    "sex": case.patient.sex,
                },
                "orders": PathologyWorkstationSerializer(work_items, many=True).data,
            }
        )


class PathologyCompletedExamHistoryAPIView(PathologyStaffAPIViewMixin, APIView):
    def get(self, request):
        work_items_by_order = {}
        for work_item in _workstation_queryset(request):
            order = _pathology_order(work_item)
            if order is None or order.order_type not in {
                ExaminationOrder.OrderType.PATHOLOGY_GENE,
                ExaminationOrder.OrderType.PDL1,
            }:
                continue
            current = work_items_by_order.get(order.id)
            if current is None or (
                current.task_type == PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW
                and work_item.task_type != PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW
            ):
                work_items_by_order[order.id] = work_item

        serializer = PathologyWorkstationSerializer()
        histories_by_case = {}
        for work_item in work_items_by_order.values():
            item = serializer.to_representation(work_item)
            if item["workflow_status"] != PathologyWorkflowStatus.REVIEW_COMPLETED:
                continue

            item["completed_at"] = self._completed_at(work_item)
            history = histories_by_case.setdefault(
                work_item.case_id,
                {
                    "patient": item["patient"],
                    "case": item["case"],
                    "completed_exams": [],
                },
            )
            history["completed_exams"].append(item)

        histories = list(histories_by_case.values())
        for history in histories:
            history["completed_exams"].sort(
                key=lambda item: (
                    item["completed_at"] is not None,
                    item["completed_at"],
                ),
                reverse=True,
            )
        return Response(histories)

    @staticmethod
    def _completed_at(work_item):
        order = _pathology_order(work_item)
        confirmed_results = [
            result
            for result in getattr(work_item.case, "workstation_confirmed_results", [])
            if order and PathologyWorkstationSerializer._clinical_result_order_id(result) == order.id
        ]
        confirmed_at = next(
            (result.confirmed_at for result in confirmed_results if result.confirmed_at is not None),
            None,
        )
        if confirmed_at is not None:
            return confirmed_at

        completed_reviews = [
            item
            for item in getattr(work_item.case, "workstation_review_items", [])
            if (
                order
                and PathologyWorkstationSerializer._work_item_order_id(item) == order.id
                and item.status == PathologyWorkItem.Status.COMPLETED
            )
        ]
        return next(
            (item.completed_at for item in completed_reviews if item.completed_at is not None),
            None,
        )


class PathologySubmitForReviewAPIView(PathologyStaffAPIViewMixin, APIView):
    analysis_types_by_test = {
        ExaminationOrder.OrderType.PATHOLOGY_GENE: AnalysisType.PATHOLOGY_GENE_ANALYSIS,
        ExaminationOrder.OrderType.PDL1: AnalysisType.PDL1_ANALYSIS,
    }

    def post(self, request, case_id):
        serializer = PathologyReviewSubmissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        hospital_id = pathology_hospital_id(request)

        case = get_object_or_404(
            LungCancerCase.objects.select_related("patient"),
            id=case_id,
            patient__hospital_id=hospital_id,
        )
        work_item = get_object_or_404(
            PathologyWorkItem.objects.select_related(
                "examination_order",
                "specimen__examination_order",
                "wsi__specimen__examination_order",
            ),
            id=serializer.validated_data["work_item_id"],
            case=case,
        )

        order = (
            work_item.examination_order
            or (
                work_item.specimen.examination_order
                if work_item.specimen and work_item.specimen.examination_order
                else None
            )
        )
        expected_analysis_type = self.analysis_types_by_test.get(
            order.order_type if order else None,
        )
        if expected_analysis_type is None:
            raise ValidationError(
                {"order_type": "?꾩옱 ?ㅻ뜑??寃??醫낅쪟瑜??뺤씤?????놁뒿?덈떎."}
            )

        analysis = get_object_or_404(
            AiAnalysis.objects.select_related(
                "ai_result",
                "examination_order",
                "source_image_asset__examination_order",
            ),
            id=serializer.validated_data["ai_analysis_id"],
            case=case,
        )
        if analysis.analysis_type != expected_analysis_type:
            raise ValidationError(
                {"ai_analysis_id": "?꾩옱 寃??醫낅쪟? ?쇱튂?섎뒗 AI 遺꾩꽍???꾨떃?덈떎."}
            )
        analysis_order_id = analysis.examination_order_id
        if analysis_order_id is None and analysis.source_image_asset_id:
            analysis_order_id = analysis.source_image_asset.examination_order_id
        if analysis_order_id != order.id:
            raise ValidationError(
                {"ai_analysis_id": "?꾩옱 蹂묐━ ?ㅻ뜑??AI 遺꾩꽍???꾨떃?덈떎."}
            )
        if analysis.status != AiAnalysis.Status.SUCCEEDED or not hasattr(analysis, "ai_result"):
            raise ValidationError(
                {"ai_analysis_id": "?꾨즺??AI 遺꾩꽍 寃곌낵留??쒖텧?????덉뒿?덈떎."}
            )

        latest_analysis = (
            AiAnalysis.objects.filter(
                case=case,
                analysis_type=expected_analysis_type,
            )
            .filter(
                Q(examination_order=order)
                | Q(
                    examination_order__isnull=True,
                    source_image_asset__examination_order=order,
                )
            )
            .order_by("-created_at")
            .first()
        )
        if latest_analysis is None or latest_analysis.id != analysis.id:
            raise ValidationError(
                {"ai_analysis_id": "?꾩옱 寃?ъ쓽 理쒖떊 AI 遺꾩꽍留??쒖텧?????덉뒿?덈떎."}
            )

        try:
            review_work_item, created = submit_for_review(work_item)
        except ReviewSubmissionError as exc:
            raise ValidationError({"work_item_id": str(exc)}) from exc
        return Response(
            {
                "review_work_item_id": review_work_item.id,
                "case_id": review_work_item.case_id,
                "status": review_work_item.status,
                "task_type": review_work_item.task_type,
                "submitted": created,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


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


class CasePathologySpecimenListAPIView(PathologyStaffAPIViewMixin, ListAPIView):
    serializer_class = PathologySpecimenSerializer

    def get_queryset(self):
        return (
            PathologySpecimen.objects.filter(
                case_id=self.kwargs["case_id"],
                case__patient__hospital_id=pathology_hospital_id(self.request),
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


class SpecimenWholeSlideImageListAPIView(PathologyStaffAPIViewMixin, ListAPIView):
    serializer_class = WholeSlideImageSerializer

    def get_queryset(self):
        return (
            WholeSlideImage.objects.filter(
                specimen_id=self.kwargs["specimen_id"],
                specimen__case__patient__hospital_id=pathology_hospital_id(self.request),
            )
            .select_related(
                "specimen",
                "image_asset",
                "uploaded_by_user",
            )
            .order_by("slide_code", "-version")
        )


class WholeSlideImagePyramidAPIView(PathologyStaffAPIViewMixin, APIView):

    def get(self, request, wsi_id):
        wsi = get_object_or_404(
            WholeSlideImage,
            id=wsi_id,
            specimen__case__patient__hospital_id=pathology_hospital_id(request),
        )
        if not wsi.orthanc_series_id:
            return Response(
                {"detail": "??WSI??Orthanc series媛 ?곌껐?섏? ?딆븯?듬땲??"},
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


class WholeSlideImageTileAPIView(PathologyStaffAPIViewMixin, APIView):

    def get(self, request, wsi_id, level, x, y):
        wsi = get_object_or_404(
            WholeSlideImage,
            id=wsi_id,
            specimen__case__patient__hospital_id=pathology_hospital_id(request),
        )
        if not wsi.orthanc_series_id:
            return Response(
                {"detail": "??WSI??Orthanc series媛 ?곌껐?섏? ?딆븯?듬땲??"},
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


class WholeSlideImagePreviewAPIView(PathologyStaffAPIViewMixin, APIView):
    content_negotiation_class = _PassthroughContentNegotiation

    def get(self, request, wsi_id):
        wsi = get_object_or_404(
            WholeSlideImage.objects.select_related("image_asset"),
            id=wsi_id,
            specimen__case__patient__hospital_id=pathology_hospital_id(request),
        )
        try:
            content, content_type = download_pathology_wsi_preview(
                wsi.image_asset.storage_uri,
            )
        except PathologyStorageError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)
        response = HttpResponse(content, content_type=content_type)
        response["Cache-Control"] = "private, max-age=3600"
        return response
