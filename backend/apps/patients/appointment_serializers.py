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

            # 환자
            "patient_code",
            "patient_name",

            # Case
            "case_code",

            # 담당 의료진
            "doctor_name",

            # 예약
            "scheduled_at",
            "appointment_status",
            "created_by_type",

            # 방문
            "visit_status",
            "checked_in_at",

            # 확정
            "confirmed_at",

            # 취소
            "cancelled_at",
            "cancellation_reason",

            # 생성 / 수정
            "created_at",
            "updated_at",
        ]
        