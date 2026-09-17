from rest_framework import serializers

from .models import DoctorSchedule, DoctorWeeklyAvailability


class DoctorWeeklyAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorWeeklyAvailability
        fields = ["id", "weekday", "start_time", "end_time", "slot_minutes", "enabled", "created_at", "updated_at"]
        read_only_fields = ["id", "slot_minutes", "created_at", "updated_at"]

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start is not None and end is not None and end <= start:
            raise serializers.ValidationError({"end_time": "end_time must be after start_time."})
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
