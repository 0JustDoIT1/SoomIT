from rest_framework import serializers
from django.conf import settings

from apps.ai_results.serializers import DoctorAiAnalysisSerializer
from apps.clinical.models import ClinicalResult, PathologyResult

from .models import PathologySpecimen, PathologyWorkItem, WholeSlideImage
from .services.workflow import calculate_workflow_status, workflow_label


class PathologyAiAnalysisSerializer(DoctorAiAnalysisSerializer):
    class Meta(DoctorAiAnalysisSerializer.Meta):
        fields = [
            "case_id",
            "source_image_asset_id",
            *DoctorAiAnalysisSerializer.Meta.fields,
        ]


class PDL1AnalysisRunSerializer(serializers.Serializer):
    feature_file = serializers.FileField(write_only=True)
    wsi_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_feature_file(self, value):
        if not value.name.lower().endswith(".pt"):
            raise serializers.ValidationError(".pt feature 파일만 사용할 수 있습니다.")
        if value.size < 1:
            raise serializers.ValidationError("빈 feature 파일은 사용할 수 없습니다.")
        if value.size > settings.PDL1_FEATURE_MAX_UPLOAD_BYTES:
            raise serializers.ValidationError("feature 파일 크기 제한을 초과했습니다.")
        return value

    def validate_wsi_id(self, value):
        if value is None:
            return value
        case = self.context["case"]
        if not WholeSlideImage.objects.filter(id=value, specimen__case=case).exists():
            raise serializers.ValidationError("해당 Case의 WSI가 아닙니다.")
        return value


class PathologyReviewSubmissionSerializer(serializers.Serializer):
    work_item_id = serializers.UUIDField()
    ai_analysis_id = serializers.UUIDField()


class PathologyDiagnosisSerializer(serializers.ModelSerializer):
    result_status_label = serializers.CharField(
        source="get_result_status_display",
        read_only=True,
    )
    confirmed_by_name = serializers.CharField(
        source="confirmed_by_user.name",
        read_only=True,
        allow_null=True,
    )
    pathology = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalResult
        fields = [
            "id",
            "case_id",
            "source_image_asset_id",
            "reviewed_ai_result_id",
            "result_status",
            "result_status_label",
            "confirmed_by_user_id",
            "confirmed_by_name",
            "confirmed_at",
            "pathology",
            "created_at",
            "updated_at",
        ]

    def get_pathology(self, obj):
        if not hasattr(obj, "pathology_detail"):
            return None

        detail = obj.pathology_detail
        return {
            "malignancy_status": detail.malignancy_status,
            "malignancy_status_label": detail.get_malignancy_status_display(),
            "histologic_type": detail.histologic_type,
            "subtype": detail.subtype,
            "diagnosis_summary": detail.diagnosis_summary,
        }


class PathologyDiagnosisWriteSerializer(serializers.Serializer):
    work_item_id = serializers.UUIDField(write_only=True, required=False)
    malignancy_status = serializers.ChoiceField(
        choices=PathologyResult.MalignancyStatus.choices,
    )
    histologic_type = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    subtype = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    diagnosis_summary = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    source_image_asset_id = serializers.UUIDField(
        required=False,
        allow_null=True,
    )
    reviewed_ai_result_id = serializers.UUIDField(
        required=False,
        allow_null=True,
    )

    def validate(self, attrs):
        case = self.context["case"]

        work_item_id = attrs.pop("work_item_id", None)
        if self.instance is None:
            if work_item_id is None:
                raise serializers.ValidationError(
                    {"work_item_id": "판독 작업 ID가 필요합니다."},
                )

            work_item = (
                PathologyWorkItem.objects.select_for_update()
                .filter(
                    id=work_item_id,
                    case=case,
                    task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
                )
                .first()
            )
            if work_item is None:
                raise serializers.ValidationError(
                    {"work_item_id": "해당 Case의 병리 판독 작업이 아닙니다."},
                )
            if work_item.status not in {
                PathologyWorkItem.Status.PENDING,
                PathologyWorkItem.Status.IN_PROGRESS,
            }:
                raise serializers.ValidationError(
                    {"work_item_id": "진행할 수 있는 상태의 판독 작업이 아닙니다."},
                )
            self.context["work_item"] = work_item
            order_ids = {work_item.examination_order_id}
            if work_item.specimen_id:
                order_ids.add(work_item.specimen.examination_order_id)
            order_ids.discard(None)
            if len(order_ids) != 1:
                raise serializers.ValidationError(
                    {"work_item_id": "판독 작업의 병리 오더를 확인할 수 없습니다."},
                )
            examination_order_id = order_ids.pop()
            examination_order = (
                work_item.examination_order
                if work_item.examination_order_id == examination_order_id
                else work_item.specimen.examination_order
            )
            self.context["examination_order"] = examination_order
        elif work_item_id is not None:
            raise serializers.ValidationError(
                {"work_item_id": "초안 수정 시 작업 ID를 변경할 수 없습니다."},
            )

        source_image_asset_id = attrs.get("source_image_asset_id")
        if source_image_asset_id:
            source_image_asset = case.image_assets.filter(id=source_image_asset_id).first()
            if source_image_asset is None:
                raise serializers.ValidationError(
                    {"source_image_asset_id": "해당 Case의 이미지가 아닙니다."},
                )
            if self.instance is None and source_image_asset.examination_order_id != self.context["examination_order"].id:
                raise serializers.ValidationError(
                    {"source_image_asset_id": "현재 병리 오더의 이미지가 아닙니다."},
                )

        reviewed_ai_result_id = attrs.get("reviewed_ai_result_id")
        if reviewed_ai_result_id:
            analysis = (
                case.ai_analyses.select_related(
                    "examination_order",
                    "source_image_asset__examination_order",
                )
                .filter(ai_result__id=reviewed_ai_result_id)
                .first()
            )
            if analysis is None:
                raise serializers.ValidationError(
                    {"reviewed_ai_result_id": "해당 Case의 AI 결과가 아닙니다."},
                )
            analysis_order_id = analysis.examination_order_id
            if analysis_order_id is None and analysis.source_image_asset_id:
                analysis_order_id = analysis.source_image_asset.examination_order_id
            if self.instance is None and analysis_order_id != self.context["examination_order"].id:
                raise serializers.ValidationError(
                    {"reviewed_ai_result_id": "현재 병리 오더의 AI 결과가 아닙니다."},
                )

        return attrs

    def create(self, validated_data):
        case = self.context["case"]
        detail_data = {
            field: validated_data.pop(field, None)
            for field in (
                "malignancy_status",
                "histologic_type",
                "subtype",
                "diagnosis_summary",
            )
        }
        clinical_result = ClinicalResult.objects.create(
            case=case,
            examination_order=self.context["examination_order"],
            stage="PATHOLOGY",
            result_status=ClinicalResult.ResultStatus.DRAFT,
            **validated_data,
        )
        PathologyResult.objects.create(
            clinical_result=clinical_result,
            **detail_data,
        )
        work_item = self.context["work_item"]
        if work_item.status == PathologyWorkItem.Status.PENDING:
            work_item.status = PathologyWorkItem.Status.IN_PROGRESS
            work_item.save(update_fields=["status", "updated_at"])
        return clinical_result

    def update(self, instance, validated_data):
        if instance.result_status != ClinicalResult.ResultStatus.DRAFT:
            raise serializers.ValidationError(
                "확정된 병리 판독은 수정할 수 없습니다.",
            )

        detail = instance.pathology_detail
        for field in (
            "malignancy_status",
            "histologic_type",
            "subtype",
            "diagnosis_summary",
        ):
            if field in validated_data:
                setattr(detail, field, validated_data.pop(field))
        detail.save()

        for field in ("source_image_asset_id", "reviewed_ai_result_id"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        return instance


class PathologyDiagnosisConfirmSerializer(serializers.Serializer):
    work_item_id = serializers.UUIDField()

    def validate_work_item_id(self, value):
        diagnosis = self.context["diagnosis"]
        work_item = (
            PathologyWorkItem.objects.select_for_update()
            .filter(
                id=value,
                case=diagnosis.case,
                task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            )
            .first()
        )
        if work_item is None:
            raise serializers.ValidationError(
                "해당 Case의 병리 판독 작업이 아닙니다.",
            )
        if work_item.status not in {
            PathologyWorkItem.Status.PENDING,
            PathologyWorkItem.Status.IN_PROGRESS,
            PathologyWorkItem.Status.COMPLETED,
        }:
            raise serializers.ValidationError(
                "완료할 수 있는 상태의 판독 작업이 아닙니다.",
            )
        self.context["work_item"] = work_item
        return value


class PathologyReportSerializer(serializers.ModelSerializer):
    case_code = serializers.CharField(source="case.case_code", read_only=True)
    patient_code = serializers.CharField(
        source="case.patient.patient_code",
        read_only=True,
    )
    patient_name = serializers.CharField(
        source="case.patient.name",
        read_only=True,
    )
    confirmed_by_name = serializers.CharField(
        source="confirmed_by_user.name",
        read_only=True,
        allow_null=True,
    )
    specimen = serializers.SerializerMethodField()
    wsi = serializers.SerializerMethodField()
    diagnosis = serializers.SerializerMethodField()

    class Meta:
        model = ClinicalResult
        fields = [
            "id",
            "case_id",
            "case_code",
            "patient_code",
            "patient_name",
            "source_image_asset_id",
            "reviewed_ai_result_id",
            "confirmed_by_user_id",
            "confirmed_by_name",
            "confirmed_at",
            "specimen",
            "wsi",
            "diagnosis",
            "created_at",
            "updated_at",
        ]

    def _get_wsi(self, obj):
        source_image_asset = obj.source_image_asset
        if source_image_asset is None or not hasattr(
            source_image_asset,
            "whole_slide_image",
        ):
            return None
        return source_image_asset.whole_slide_image

    def get_specimen(self, obj):
        wsi = self._get_wsi(obj)
        if wsi is None:
            return None
        return {
            "id": wsi.specimen_id,
            "specimen_code": wsi.specimen.specimen_code,
            "specimen_type": wsi.specimen.specimen_type,
            "body_site": wsi.specimen.body_site,
        }

    def get_wsi(self, obj):
        wsi = self._get_wsi(obj)
        if wsi is None:
            return None
        return {
            "id": wsi.id,
            "slide_code": wsi.slide_code,
            "stain": wsi.stain,
            "original_filename": wsi.original_filename,
        }

    def get_diagnosis(self, obj):
        detail = obj.pathology_detail
        return {
            "malignancy_status": detail.malignancy_status,
            "malignancy_status_label": detail.get_malignancy_status_display(),
            "histologic_type": detail.histologic_type,
            "subtype": detail.subtype,
            "diagnosis_summary": detail.diagnosis_summary,
        }


class WholeSlideImageSerializer(serializers.ModelSerializer):
    storage_uri = serializers.CharField(
        source="image_asset.storage_uri",
        read_only=True,
    )
    file_format = serializers.CharField(
        source="image_asset.file_format",
        read_only=True,
    )
    image_status = serializers.CharField(
        source="image_asset.status",
        read_only=True,
    )

    class Meta:
        model = WholeSlideImage
        fields = [
            "id",
            "specimen_id",
            "image_asset_id",
            "slide_code",
            "block_code",
            "version",
            "stain",
            "original_filename",
            "sha256",
            "mpp",
            "is_current",
            "storage_uri",
            "file_format",
            "image_status",
            "orthanc_series_id",
            "orthanc_instance_id",
            "study_instance_uid",
            "series_instance_uid",
            "sop_instance_uid",
            "invalidated_at",
            "invalidation_reason",
            "created_at",
            "updated_at",
        ]


class PathologySpecimenSerializer(serializers.ModelSerializer):
    case_code = serializers.CharField(source="case.case_code", read_only=True)
    patient_id = serializers.UUIDField(source="case.patient.id", read_only=True)
    patient_code = serializers.CharField(
        source="case.patient.patient_code",
        read_only=True,
    )
    patient_name = serializers.CharField(
        source="case.patient.name",
        read_only=True,
    )
    wsi_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PathologySpecimen
        fields = [
            "id",
            "case_id",
            "case_code",
            "patient_id",
            "patient_code",
            "patient_name",
            "examination_order_id",
            "specimen_code",
            "specimen_type",
            "body_site",
            "collected_at",
            "received_at",
            "status",
            "wsi_count",
            "created_at",
            "updated_at",
        ]


class PathologyWorkItemSerializer(serializers.ModelSerializer):
    case_code = serializers.CharField(source="case.case_code", read_only=True)
    patient_code = serializers.CharField(
        source="case.patient.patient_code",
        read_only=True,
    )
    patient_name = serializers.CharField(
        source="case.patient.name",
        read_only=True,
    )
    specimen_code = serializers.CharField(
        source="specimen.specimen_code",
        read_only=True,
        allow_null=True,
    )
    slide_code = serializers.CharField(
        source="wsi.slide_code",
        read_only=True,
        allow_null=True,
    )
    assigned_to_name = serializers.CharField(
        source="assigned_to.name",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = PathologyWorkItem
        fields = [
            "id",
            "case_id",
            "case_code",
            "patient_code",
            "patient_name",
            "specimen_id",
            "specimen_code",
            "wsi_id",
            "slide_code",
            "task_type",
            "status",
            "priority",
            "assigned_to_id",
            "assigned_to_name",
            "due_at",
            "completed_at",
            "created_at",
            "updated_at",
        ]


class PathologyWorkstationSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.CharField(source="assigned_to.name", read_only=True, allow_null=True)
    patient = serializers.SerializerMethodField()
    case = serializers.SerializerMethodField()
    specimen = serializers.SerializerMethodField()
    pathology_test_type = serializers.SerializerMethodField()
    pathology_test_type_label = serializers.SerializerMethodField()

    current_exam_or_task = serializers.SerializerMethodField()
    requesting_doctor = serializers.SerializerMethodField()
    wsi_count = serializers.SerializerMethodField()
    latest_wsi = serializers.SerializerMethodField()
    latest_ai_analysis = serializers.SerializerMethodField()
    latest_gene_analysis = serializers.SerializerMethodField()
    diagnostic_review_status = serializers.SerializerMethodField()
    diagnostic_review = serializers.SerializerMethodField()
    clinical_result = serializers.SerializerMethodField()
    examination_order = serializers.SerializerMethodField()
    workflow_status = serializers.SerializerMethodField()
    workflow_status_label = serializers.SerializerMethodField()

    class Meta:
        model = PathologyWorkItem
        fields = [
            "id", "case_id", "patient", "case", "specimen",
            "pathology_test_type", "pathology_test_type_label",
            "current_exam_or_task", "task_type", "status", "priority",
            "assigned_to_id", "assigned_to_name", "requesting_doctor",
            "wsi_count", "latest_wsi", "latest_ai_analysis", "latest_gene_analysis",
            "diagnostic_review_status", "diagnostic_review", "clinical_result",
            "examination_order", "workflow_status", "workflow_status_label",
            "due_at", "completed_at", "created_at", "updated_at",
        ]
    def _pathology_order(self, obj):
        if obj.examination_order:
            return obj.examination_order
        if obj.specimen and obj.specimen.examination_order:
            return obj.specimen.examination_order
        if obj.wsi and obj.wsi.specimen.examination_order:
            return obj.wsi.specimen.examination_order
        return None

    def get_pathology_test_type(self, obj):
        order = self._pathology_order(obj)
        return order.pathology_test_type if order else None

    def get_pathology_test_type_label(self, obj):
        order = self._pathology_order(obj)
        return order.get_pathology_test_type_display() if order and order.pathology_test_type else None

    def get_current_exam_or_task(self, obj):
        return self.get_pathology_test_type_label(obj) or "-"

    def get_patient(self, obj):
        patient = obj.case.patient
        return {"id": patient.id, "name": patient.name, "patient_code": patient.patient_code, "birth_date": patient.birth_date, "sex": patient.sex}

    def get_case(self, obj):
        return {"id": obj.case_id, "case_code": obj.case.case_code, "current_stage": obj.case.current_stage, "case_status": obj.case.case_status}

    def get_specimen(self, obj):
        if not obj.specimen:
            return None
        return {"id": obj.specimen_id, "specimen_code": obj.specimen.specimen_code, "specimen_type": obj.specimen.specimen_type, "body_site": obj.specimen.body_site, "status": obj.specimen.status}

    def get_requesting_doctor(self, obj):
        order = self._pathology_order(obj)
        if not order:
            return None
        return {"id": order.requesting_doctor_id, "name": order.requesting_doctor.name}

    def _wsis(self, obj):
        return getattr(obj.specimen, "workstation_wsis", []) if obj.specimen else []

    def get_wsi_count(self, obj):
        return len(self._wsis(obj))

    def get_latest_wsi(self, obj):
        wsis = self._wsis(obj)
        return WholeSlideImageSerializer(wsis[0]).data if wsis else None

    def get_latest_ai_analysis(self, obj):
        analyses = self._order_analyses(obj)
        return PathologyAiAnalysisSerializer(analyses[0]).data if analyses else None

    def get_latest_gene_analysis(self, obj):
        analysis = next(
            (
                item
                for item in self._order_analyses(obj)
                if item.analysis_type == "GENE_PREDICTION"
            ),
            None,
        )
        return PathologyAiAnalysisSerializer(analysis).data if analysis else None

    def get_diagnostic_review_status(self, obj):
        order = self._pathology_order(obj)
        items = [
            item
            for item in getattr(obj.case, "workstation_review_items", [])
            if order and self._work_item_order_id(item) == order.id
        ]
        return items[0].status if items else None

    def get_diagnostic_review(self, obj):
        order = self._pathology_order(obj)
        items = [
            item
            for item in getattr(obj.case, "workstation_review_items", [])
            if order and self._work_item_order_id(item) == order.id
        ]
        if not items:
            return None
        review = items[0]
        return {
            "id": review.id,
            "status": review.status,
            "assigned_to_id": review.assigned_to_id,
            "completed_at": review.completed_at,
        }

    def get_clinical_result(self, obj):
        order = self._pathology_order(obj)
        results = [
            result
            for result in getattr(obj.case, "workstation_confirmed_results", [])
            if order and self._clinical_result_order_id(result) == order.id
        ]
        return PathologyDiagnosisSerializer(results[0]).data if results else None

    def get_examination_order(self, obj):
        order = self._pathology_order(obj)
        if order is None:
            return None
        return {
            "id": order.id,
            "status": order.status,
            "priority": order.priority,
            "pathology_test_type": order.pathology_test_type,
            "pathology_test_type_label": (
                order.get_pathology_test_type_display()
                if order.pathology_test_type
                else None
            ),
            "created_at": order.created_at,
        }

    def _order_analyses(self, obj):
        order = self._pathology_order(obj)
        if order is None:
            return []
        return [
            analysis
            for analysis in getattr(obj.case, "workstation_analyses", [])
            if self._analysis_order_id(analysis) == order.id
        ]

    @staticmethod
    def _analysis_order_id(analysis):
        if analysis.examination_order_id:
            return analysis.examination_order_id
        if analysis.source_image_asset_id:
            return analysis.source_image_asset.examination_order_id
        return None

    @staticmethod
    def _work_item_order_id(work_item):
        if work_item.examination_order_id:
            return work_item.examination_order_id
        if work_item.specimen_id:
            return work_item.specimen.examination_order_id
        if work_item.wsi_id:
            return work_item.wsi.specimen.examination_order_id
        return None

    @classmethod
    def _clinical_result_order_id(cls, result):
        if result.examination_order_id:
            return result.examination_order_id
        source_order_id = (
            result.source_image_asset.examination_order_id
            if result.source_image_asset_id
            else None
        )
        analysis_order_id = (
            cls._analysis_order_id(result.reviewed_ai_result.ai_analysis)
            if result.reviewed_ai_result_id
            else None
        )
        if source_order_id and analysis_order_id and source_order_id != analysis_order_id:
            return None
        return source_order_id or analysis_order_id

    def get_workflow_status(self, obj):
        return calculate_workflow_status(obj)

    def get_workflow_status_label(self, obj):
        return workflow_label(calculate_workflow_status(obj))
