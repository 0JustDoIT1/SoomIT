from rest_framework import serializers

from .models import CaseImageAsset, ClinicianDecision, ExaminationOrder, LungCancerCase, WorkflowStage


class DoctorCaseImageAssetSerializer(serializers.ModelSerializer):
    preview_url = serializers.SerializerMethodField()

    class Meta:
        model = CaseImageAsset
        fields = [
            "id",
            "workflow_stage",
            "image_type",
            "file_format",
            "status",
            "storage_type",
            "acquired_at",
            "study_instance_uid",
            "series_instance_uid",
            "orthanc_study_id",
            "orthanc_series_id",
            "preview_url",
        ]

    def get_preview_url(self, obj):
        if (
            obj.workflow_stage == WorkflowStage.XRAY
            and obj.image_type == CaseImageAsset.ImageType.XRAY
            and obj.storage_type == CaseImageAsset.StorageType.GCS
            and obj.status == CaseImageAsset.Status.READY
        ):
            return f"/api/doctor/cases/{obj.case_id}/image-assets/{obj.id}/preview/"
        return None


class FollowUpPathologyOrderCreateSerializer(serializers.Serializer):
    pathology_test_type = serializers.ChoiceField(
        choices=["SUBTYPE", "GENE", "PDL1", "PATHOLOGY_GENE"]
    )
    priority = serializers.ChoiceField(
        choices=ExaminationOrder.Priority.choices,
        default=ExaminationOrder.Priority.NORMAL,
    )
    purpose = serializers.CharField()
    clinical_note = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=""
    )


class ExaminationOrderCreateSerializer(serializers.Serializer):
    order_type = serializers.ChoiceField(
        choices=[
            ExaminationOrder.OrderType.XRAY,
            ExaminationOrder.OrderType.CT,
            ExaminationOrder.OrderType.PET_CT_TNM,
            ExaminationOrder.OrderType.PATHOLOGY_GENE,
            ExaminationOrder.OrderType.PDL1,
        ]
    )
    priority = serializers.ChoiceField(
        choices=ExaminationOrder.Priority.choices,
        default=ExaminationOrder.Priority.NORMAL,
    )
    purpose = serializers.CharField(max_length=500)
    clinical_note = serializers.CharField(required=False, allow_blank=True, allow_null=True, default="")


class ExaminationOrderUpdateSerializer(serializers.Serializer):
    priority = serializers.ChoiceField(choices=ExaminationOrder.Priority.choices, required=False)
    purpose = serializers.CharField(max_length=500, required=False)
    clinical_note = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("수정할 오더 정보가 없습니다.")
        return attrs


class MedicalOpinionRequestSerializer(serializers.Serializer):
    instruction = serializers.CharField(
        required=False,
        allow_blank=False,
        max_length=2000,
        default="임상 결과를 종합한 간결한 소견 초안을 작성해주세요.",
    )


class MedicalOpinionSourceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    workflow_stage = serializers.CharField()
    confirmed_at = serializers.DateTimeField(allow_null=True)


class MedicalOpinionResponseSerializer(serializers.Serializer):
    opinion = serializers.CharField()
    source_results = MedicalOpinionSourceSerializer(many=True)


# 원무과 - Case 목록 조회용
class LungCancerCaseSerializer(serializers.ModelSerializer):
    patient_code = serializers.CharField(
        source="patient.patient_code",
        read_only=True,
    )

    patient_name = serializers.CharField(
        source="patient.name",
        read_only=True,
    )

    class Meta:
        model = LungCancerCase
        fields = [
            "id",
            "case_code",
            "patient_code",
            "patient_name",
            "current_stage",
            "case_status",
            "created_at",
            "updated_at",
        ]


# 원무과 - 최근 의료진 결정 요약
class ClinicianDecisionSummarySerializer(serializers.ModelSerializer):
    decided_by = serializers.SerializerMethodField()

    class Meta:
        model = ClinicianDecision
        fields = [
            "id",
            "source_stage",
            "decision_type",
            "target_stage",
            "reason",
            "decided_by",
            "decided_at",
        ]

    def get_decided_by(self, obj):
        user = obj.decided_by_user

        if hasattr(user, "get_full_name"):
            full_name = user.get_full_name()

            if full_name:
                return full_name

        return getattr(user, "username", str(user))


# 원무과 - Case 상세 조회용
class LungCancerCaseDetailSerializer(serializers.ModelSerializer):
    patient_code = serializers.CharField(
        source="patient.patient_code",
        read_only=True,
    )

    patient_name = serializers.CharField(
        source="patient.name",
        read_only=True,
    )

    latest_clinician_decision = serializers.SerializerMethodField()

    class Meta:
        model = LungCancerCase
        fields = [
            "id",
            "case_code",
            "patient_code",
            "patient_name",
            "current_stage",
            "case_status",
            "created_at",
            "updated_at",
            "latest_clinician_decision",
        ]

    def get_latest_clinician_decision(self, obj):
        decision = (
            obj.clinician_decisions
            .select_related("decided_by_user")
            .order_by("-decided_at")
            .first()
        )

        if decision is None:
            return None

        return ClinicianDecisionSummarySerializer(decision).data

# 호흡기내과 - 담당 Case 목록 조회용
class DoctorLungCancerCaseSerializer(serializers.ModelSerializer):
    patient_code = serializers.CharField(source="patient.patient_code", read_only=True)
    patient_name = serializers.CharField(source="patient.name", read_only=True)
    patient_sex = serializers.CharField(source="patient.sex", read_only=True)
    patient_birth_date = serializers.DateField(source="patient.birth_date", read_only=True)
    primary_doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = LungCancerCase
        fields = [
            "id",
            "case_code",
            "patient_code",
            "patient_name",
            "patient_sex",
            "patient_birth_date",
            "primary_doctor_name",
            "current_stage",
            "case_status",
            "created_at",
            "updated_at",
        ]

    def get_primary_doctor_name(self, obj):
        user = obj.primary_doctor

        if user is None:
            return None

        if hasattr(user, "get_full_name"):
            full_name = user.get_full_name()

            if full_name:
                return full_name

        return getattr(user, "username", str(user))

# 호흡기내과 - 담당 Case 상세 조회용
class DoctorLungCancerCaseDetailSerializer(serializers.ModelSerializer):
    patient_code = serializers.CharField(source="patient.patient_code", read_only=True)
    patient_name = serializers.CharField(source="patient.name", read_only=True)
    patient_sex = serializers.CharField(source="patient.sex", read_only=True)
    patient_birth_date = serializers.DateField(source="patient.birth_date", read_only=True)
    primary_doctor_name = serializers.SerializerMethodField()
    latest_clinician_decision = serializers.SerializerMethodField()

    class Meta:
        model = LungCancerCase
        fields = [
            "id",
            "case_code",
            "patient_code",
            "patient_name",
            "patient_sex",
            "patient_birth_date",
            "primary_doctor_name",
            "current_stage",
            "case_status",
            "created_at",
            "updated_at",
            "latest_clinician_decision",
        ]

    def get_primary_doctor_name(self, obj):
        user = obj.primary_doctor

        if user is None:
            return None

        if hasattr(user, "get_full_name"):
            full_name = user.get_full_name()

            if full_name:
                return full_name

        return getattr(user, "login_id", str(user))

    def get_latest_clinician_decision(self, obj):
        decision = (
            obj.clinician_decisions
            .select_related("decided_by_user")
            .order_by("-decided_at")
            .first()
        )

        if decision is None:
            return None

        return ClinicianDecisionSummarySerializer(decision).data
