from rest_framework import serializers

from .models import CaseImageAsset, ClinicianDecision, ExaminationOrder, LungCancerCase, PhysicianTreatmentOpinion, WorkflowStage


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


class DoctorCaseWorkflowDecisionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=[
            ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE,
            "RETRY",
            ClinicianDecision.DecisionType.REFERRED_OUT,
            "CASE_CLOSED",
        ]
    )
    source_clinical_result_id = serializers.UUIDField()
    target_stage = serializers.ChoiceField(
        choices=WorkflowStage.choices,
        required=False,
        allow_null=True,
    )
    reason = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")
    retry_priority = serializers.ChoiceField(choices=ExaminationOrder.Priority.choices, default=ExaminationOrder.Priority.NORMAL)
    retry_purpose = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    retry_clinical_note = serializers.CharField(max_length=5000, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        action = attrs["action"]
        target_stage = attrs.get("target_stage")
        if action == ClinicianDecision.DecisionType.PROCEED_NEXT_STAGE and not target_stage:
            raise serializers.ValidationError({"target_stage": "다음 진료 단계를 선택하세요."})
        if action == ClinicianDecision.DecisionType.CLOSE_CASE:
            if target_stage:
                raise serializers.ValidationError({"target_stage": "Case 종결에는 다음 단계를 지정할 수 없습니다."})
            if not attrs.get("reason", "").strip():
                raise serializers.ValidationError({"reason": "Case 종결 사유를 입력하세요."})
        if action in {"RETRY", ClinicianDecision.DecisionType.REFERRED_OUT, "CASE_CLOSED"}:
            if target_stage:
                raise serializers.ValidationError({"target_stage": "이 결정에는 다음 단계를 지정할 수 없습니다."})
            if not attrs.get("reason", "").strip():
                raise serializers.ValidationError({"reason": "결정 사유를 입력하세요."})
        if action == "RETRY" and not attrs.get("retry_purpose", "").strip():
            raise serializers.ValidationError({"retry_purpose": "재검 오더 목적을 입력하세요."})
        return attrs


class DoctorXrayWorkflowSerializer(serializers.Serializer):
    """Finalise an X-ray result and make its case decision atomically."""

    assessment = serializers.ChoiceField(choices=["NEGATIVE", "SUSPICIOUS", "INDETERMINATE"])
    finding_summary = serializers.CharField(max_length=5000, required=False, allow_blank=True, default="")
    next_action = serializers.ChoiceField(choices=["ORDER_CT", "REFERRED_OUT", "CLOSE_CASE"])
    priority = serializers.ChoiceField(choices=ExaminationOrder.Priority.choices, default=ExaminationOrder.Priority.NORMAL)
    purpose = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    clinical_note = serializers.CharField(max_length=5000, required=False, allow_blank=True, default="")
    closure_reason = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["next_action"] == "ORDER_CT" and not attrs.get("purpose", "").strip():
            raise serializers.ValidationError({"purpose": "흉부 CT 오더 목적을 입력하세요."})
        if attrs["next_action"] in {"REFERRED_OUT", "CLOSE_CASE"} and not attrs.get("closure_reason", "").strip():
            raise serializers.ValidationError({"closure_reason": "검사 종료 사유를 입력하세요."})
        return attrs


class DoctorCaseConsultationRequestSerializer(serializers.Serializer):
    recipient_user_id = serializers.UUIDField(required=False, allow_null=True)
    question = serializers.CharField(max_length=5000)
    priority = serializers.ChoiceField(choices=["NORMAL", "URGENT"], default="NORMAL")


class DoctorCaseConsultationResponseSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["ACKNOWLEDGED", "RESPONDED", "CANCELLED"])
    response_note = serializers.CharField(max_length=5000, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["status"] == "RESPONDED" and not attrs.get("response_note", "").strip():
            raise serializers.ValidationError({"response_note": "회신 내용을 입력하세요."})
        return attrs


class MedicalOpinionRequestSerializer(serializers.Serializer):
    instruction = serializers.CharField(
        required=False,
        allow_blank=False,
        max_length=2000,
        default="임상 결과를 종합한 간결한 소견 초안을 작성해주세요.",
    )


class DoctorCaseAssistantMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField(min_length=1, max_length=12000, trim_whitespace=False)


class DoctorCaseAssistantRequestSerializer(serializers.Serializer):
    message = serializers.CharField(min_length=1, max_length=4000, trim_whitespace=False)
    history = DoctorCaseAssistantMessageSerializer(many=True, required=False, default=list)

    def validate_history(self, value):
        if len(value) > 20:
            raise serializers.ValidationError("대화 기록은 최대 20개까지 전송할 수 있습니다.")
        return value


class MedicalOpinionSourceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    workflow_stage = serializers.CharField()
    confirmed_at = serializers.DateTimeField(allow_null=True)


class MedicalOpinionResponseSerializer(serializers.Serializer):
    opinion = serializers.CharField()
    source_results = MedicalOpinionSourceSerializer(many=True)


class TreatmentOpinionRequestSerializer(serializers.Serializer):
    selected_regimen = serializers.UUIDField(required=False, allow_null=True)
    treatment_type = serializers.CharField(required=False, allow_blank=True, max_length=20)
    treatment_plan = serializers.CharField(required=False, allow_blank=True, max_length=20000)


class PhysicianTreatmentOpinionWriteSerializer(serializers.Serializer):
    physician_opinion = serializers.CharField(
        allow_blank=True,
        max_length=20000,
        trim_whitespace=False,
    )


class PhysicianTreatmentOpinionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PhysicianTreatmentOpinion
        fields = ["id", "case", "physician_opinion", "created_at", "updated_at"]
        read_only_fields = fields


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
