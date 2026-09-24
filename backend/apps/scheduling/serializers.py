from rest_framework import serializers

from apps.patients.models import Appointment

from .models import DoctorSchedule, DoctorSchedulingPreference, DoctorWeeklyAvailability


class DoctorSchedulingPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorSchedulingPreference
        fields = ["slot_capacity", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]


class DoctorWeeklyAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorWeeklyAvailability
        fields = ["id", "weekday", "start_time", "end_time", "slot_minutes", "enabled", "created_at", "updated_at"]
        read_only_fields = ["id", "slot_minutes", "created_at", "updated_at"]

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        weekday = attrs.get("weekday", getattr(self.instance, "weekday", None))
        if start is not None and end is not None and end <= start:
            raise serializers.ValidationError({"end_time": "end_time must be after start_time."})
        doctor = getattr(self.instance, "doctor", None) or self.context["request"].user
        overlaps = DoctorWeeklyAvailability.objects.filter(
            doctor=doctor,
            weekday=weekday,
            start_time__lt=end,
            end_time__gt=start,
        )
        if self.instance is not None:
            overlaps = overlaps.exclude(id=self.instance.id)
        if overlaps.exists():
            raise serializers.ValidationError({"start_time": "This interval overlaps an existing clinic-hours interval."})
        return attrs


class DoctorUnavailableSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorSchedule
        fields = ["id", "start_at", "end_at", "reason", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        start = attrs.get("start_at", getattr(self.instance, "start_at", None))
        end = attrs.get("end_at", getattr(self.instance, "end_at", None))
        if start is not None and end is not None and end <= start:
            raise serializers.ValidationError({"end_at": "end_at must be after start_at."})
        return attrs


class DoctorAppointmentSerializer(serializers.ModelSerializer):
    patient_code = serializers.CharField(source="patient.patient_code", read_only=True)
    patient_name = serializers.CharField(source="patient.name", read_only=True)
    case_code = serializers.CharField(source="case.case_code", read_only=True, allow_null=True)
    appointment_status_label = serializers.CharField(
        source="get_appointment_status_display", read_only=True
    )

    class Meta:
        model = Appointment
        fields = [
            "id",
            "patient_code",
            "patient_name",
            "case_code",
            "scheduled_at",
            "appointment_status",
            "appointment_status_label",
            "created_by_type",
            "visit_status",
        ]
