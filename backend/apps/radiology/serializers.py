from django.utils import timezone
from rest_framework import serializers

from apps.cases.models import ExaminationOrder

from .services.workflow import calculate_workflow_status, get_workflow_status_label


class RadiologyWorklistQuerySerializer(serializers.Serializer):
    exam_type = serializers.ChoiceField(
        choices=[ExaminationOrder.ExamType.XRAY, ExaminationOrder.ExamType.CT],
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
    exam_type_label = serializers.CharField(source="get_exam_type_display", read_only=True)
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


class RadiologyImageAssetSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    image_type = serializers.CharField(read_only=True)
    storage_type = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    acquired_at = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)


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
