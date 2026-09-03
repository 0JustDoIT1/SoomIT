from rest_framework import serializers

from .models import Appointment


# 원무과 - 예약 목록 / 상세 조회용
class AppointmentSerializer(serializers.ModelSerializer):
    patient_code = serializers.CharField(
        source="patient.patient_code",
        read_only=True,
    )

    patient_name = serializers.CharField(
        source="patient.name",
        read_only=True,
    )

    case_code = serializers.CharField(
        source="case.case_code",
        read_only=True,
        allow_null=True,
    )

    doctor_name = serializers.CharField(
        source="doctor.name",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Appointment
        fields = [
            "id",
            "patient_code",
            "patient_name",
            "case_code",
            "doctor_name",
            "scheduled_at",
            "appointment_status",
            "created_by_type",
            "visit_status",
            "checked_in_at",
            "confirmed_at",
            "cancelled_at",
            "cancellation_reason",
            "created_at",
            "updated_at",
        ]


# 원무과 - 예약 취소 요청값
class AppointmentCancelSerializer(serializers.Serializer):
    cancellation_reason = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=1000,
    )