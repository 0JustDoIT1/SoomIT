from rest_framework import serializers

from .models import ClinicianDecision, LungCancerCase


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