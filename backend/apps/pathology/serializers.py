from rest_framework import serializers
from django.conf import settings

from apps.ai_results.serializers import DoctorAiAnalysisSerializer
from apps.clinical.models import ClinicalResult, PathologyResult

from .models import PathologySpecimen, PathologyWorkItem, WholeSlideImage


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
        elif work_item_id is not None:
            raise serializers.ValidationError(
                {"work_item_id": "초안 수정 시 작업 ID를 변경할 수 없습니다."},
            )

        source_image_asset_id = attrs.get("source_image_asset_id")
        if source_image_asset_id and not case.image_assets.filter(
            id=source_image_asset_id,
        ).exists():
            raise serializers.ValidationError(
                {"source_image_asset_id": "해당 Case의 이미지가 아닙니다."},
            )

        reviewed_ai_result_id = attrs.get("reviewed_ai_result_id")
        if reviewed_ai_result_id and not case.ai_analyses.filter(
            ai_result__id=reviewed_ai_result_id,
        ).exists():
            raise serializers.ValidationError(
                {"reviewed_ai_result_id": "해당 Case의 AI 결과가 아닙니다."},
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
