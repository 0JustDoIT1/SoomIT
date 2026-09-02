from rest_framework import serializers

from .models import LungCancerCase


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