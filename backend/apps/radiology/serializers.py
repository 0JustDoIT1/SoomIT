from django.utils import timezone
from rest_framework import serializers

from apps.ai_results.models import AiAnalysis
from apps.cases.models import CaseImageAsset, ExaminationOrder

from .services.workflow import (
    calculate_workflow_status,
    get_workflow_status_label,
    is_pet_ct_tnm_order,
)


class RadiologyWorklistQuerySerializer(serializers.Serializer):
    exam_type = serializers.ChoiceField(
        choices=[ExaminationOrder.ExamType.XRAY, ExaminationOrder.ExamType.CT, "STAGING"],
        required=False,
    )
    status = serializers.ChoiceField(
        choices=ExaminationOrder.Status.choices,
        required=False,
    )
    priority = serializers.ChoiceField(
        choices=ExaminationOrder.Priority.choices,
        required=False,
    )
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)

    def validate(self, attrs):
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError(
                {"date_to": "종료일은 시작일보다 빠를 수 없습니다."},
            )
        return attrs


class RadiologyPatientSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    patient_code = serializers.CharField(read_only=True)
    name = serializers.CharField(read_only=True)
    birth_date = serializers.DateField(read_only=True)
    sex = serializers.CharField(read_only=True)


class RadiologyCaseSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    case_code = serializers.CharField(read_only=True)
    current_stage = serializers.CharField(read_only=True)
    case_status = serializers.CharField(read_only=True)


class RadiologyDoctorSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)


class RadiologyExaminationOrderSummarySerializer(serializers.ModelSerializer):
    exam_type_label = serializers.SerializerMethodField()
    priority_label = serializers.CharField(source="get_priority_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ExaminationOrder
        fields = [
            "id",
            "exam_type",
            "exam_type_label",
            "priority",
            "priority_label",
            "status",
            "status_label",
            "purpose",
            "clinical_note",
            "created_at",
            "updated_at",
        ]

    def get_exam_type_label(self, obj):
        if is_pet_ct_tnm_order(obj.worklist_image_assets):
            return "PET-CT / TNM"
        return obj.get_exam_type_display()


class RadiologyImageAssetSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    image_type = serializers.CharField(read_only=True)
    storage_type = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    acquired_at = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)


class RadiologyImageAssetCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CaseImageAsset
        fields = [
            "id",
            "storage_type",
            "storage_uri",
            "file_format",
            "acquired_at",
            "metadata",
            "status",
            "image_type",
            "uploaded_stage",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "status",
            "image_type",
            "uploaded_stage",
            "created_at",
        ]

    def validate_storage_uri(self, value):
        order = self.context["order"]
        if CaseImageAsset.objects.filter(
            examination_order=order,
            storage_uri=value,
        ).exists():
            raise serializers.ValidationError("동일한 영상 자산이 이미 등록되어 있습니다.")
        if CaseImageAsset.objects.filter(storage_uri=value).exists():
            raise serializers.ValidationError("이미 사용 중인 영상 저장 위치입니다.")
        return value


class RadiologyAiAnalysisSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    analysis_type = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    model_name = serializers.CharField(source="model_version.model_name", read_only=True)
    model_version = serializers.CharField(source="model_version.version", read_only=True)
    started_at = serializers.DateTimeField(read_only=True, allow_null=True)
    completed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    error_message = serializers.CharField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)


class RadiologyAiAnalysisDetailSerializer(serializers.ModelSerializer):
    analysis_id = serializers.UUIDField(source="id", read_only=True)
    case_id = serializers.UUIDField(read_only=True)
    order_id = serializers.UUIDField(
        source="source_image_asset.examination_order_id",
        read_only=True,
        allow_null=True,
    )
    model_version = serializers.SerializerMethodField()
    source_image_asset = serializers.SerializerMethodField()

    class Meta:
        model = AiAnalysis
        fields = [
            "analysis_id",
            "case_id",
            "order_id",
            "analysis_type",
            "status",
            "started_at",
            "completed_at",
            "error_message",
            "model_version",
            "source_image_asset",
            "created_at",
        ]

    def get_model_version(self, obj):
        return {
            "id": obj.model_version_id,
            "model_name": obj.model_version.model_name,
            "version": obj.model_version.version,
        }

    def get_source_image_asset(self, obj):
        asset = obj.source_image_asset
        if asset is None:
            return None
        return {
            "id": asset.id,
            "image_type": asset.image_type,
            "uploaded_stage": asset.uploaded_stage,
            "storage_type": asset.storage_type,
            "status": asset.status,
        }


class RadiologyAiResultSerializer(serializers.Serializer):
    analysis_id = serializers.UUIDField(source="id", read_only=True)
    analysis_type = serializers.CharField(read_only=True)
    result = serializers.SerializerMethodField()

    def get_result(self, obj):
        ai_result = obj.ai_result
        if obj.analysis_type == "XRAY_SCREENING" and hasattr(ai_result, "xray_detail"):
            detail = ai_result.xray_detail
            return {
                "assessment": detail.assessment,
                "assessment_label": detail.get_assessment_display(),
                "suspicion_score": detail.suspicion_score,
            }
        if obj.analysis_type == "CT_NODULE" and hasattr(ai_result, "ct_detail"):
            detail = ai_result.ct_detail
            return {
                "overall_malignancy_risk": detail.overall_malignancy_risk,
                "nodules": [
                    {
                        "nodule_no": nodule.nodule_no,
                        "detection_confidence": nodule.detection_confidence,
                        "malignancy_risk": nodule.malignancy_risk,
                        "finding_payload": nodule.finding_payload,
                    }
                    for nodule in detail.nodule_results.all()
                ],
            }
        if obj.analysis_type == "TNM_STAGING" and hasattr(ai_result, "tnm_detail"):
            detail = ai_result.tnm_detail
            return {
                "predicted_t": detail.predicted_t,
                "predicted_n": detail.predicted_n,
                "predicted_m": detail.predicted_m,
                "predicted_stage_group": detail.predicted_stage_group,
                "confidence": detail.confidence,
            }
        return None


class RadiologyWorklistSerializer(serializers.Serializer):
    patient = serializers.SerializerMethodField()
    case = serializers.SerializerMethodField()
    examination_order = serializers.SerializerMethodField()
    requesting_doctor = RadiologyDoctorSummarySerializer(read_only=True)
    scheduled_at = serializers.SerializerMethodField()
    image_asset_count = serializers.SerializerMethodField()
    latest_image_asset = serializers.SerializerMethodField()
    latest_ai_analysis = serializers.SerializerMethodField()
    workflow_status = serializers.SerializerMethodField()
    workflow_status_label = serializers.SerializerMethodField()

    def get_patient(self, obj):
        return RadiologyPatientSummarySerializer(obj.case.patient).data

    def get_case(self, obj):
        return RadiologyCaseSummarySerializer(obj.case).data

    def get_examination_order(self, obj):
        return RadiologyExaminationOrderSummarySerializer(obj).data

    def get_scheduled_at(self, obj):
        appointments = obj.worklist_appointments
        if not appointments:
            return None

        now = timezone.now()
        upcoming = [item for item in appointments if item.scheduled_at >= now]
        appointment = min(upcoming, key=lambda item: item.scheduled_at) if upcoming else max(
            appointments,
            key=lambda item: item.scheduled_at,
        )
        return appointment.scheduled_at

    def get_image_asset_count(self, obj):
        return len(obj.worklist_image_assets)

    def get_latest_image_asset(self, obj):
        assets = obj.worklist_image_assets
        if not assets:
            return None
        return RadiologyImageAssetSummarySerializer(assets[0]).data

    def get_latest_ai_analysis(self, obj):
        analysis = self._get_latest_ai_analysis(obj)
        if analysis is None:
            return None
        return RadiologyAiAnalysisSummarySerializer(analysis).data

    def get_workflow_status(self, obj):
        return self._get_workflow_status(obj)

    def get_workflow_status_label(self, obj):
        return get_workflow_status_label(self._get_workflow_status(obj))

    def _get_workflow_status(self, obj):
        cached_status = getattr(obj, "_worklist_workflow_status", None)
        if cached_status is None:
            cached_status = calculate_workflow_status(
                obj,
                obj.worklist_image_assets,
                self._get_latest_ai_analysis(obj),
            )
            obj._worklist_workflow_status = cached_status
        return cached_status

    def _get_latest_ai_analysis(self, obj):
        cached_analysis = getattr(obj, "_worklist_latest_ai_analysis", None)
        if cached_analysis is not None:
            return cached_analysis

        analyses = [
            analysis
            for asset in obj.worklist_image_assets
            for analysis in asset.worklist_ai_analyses
        ]
        if not analyses:
            return None

        cached_analysis = max(analyses, key=lambda analysis: analysis.created_at)
        obj._worklist_latest_ai_analysis = cached_analysis
        return cached_analysis
