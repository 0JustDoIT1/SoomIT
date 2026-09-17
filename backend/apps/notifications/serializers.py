from rest_framework import serializers

from .models import NotificationLog


class StaffNotificationSerializer(serializers.ModelSerializer):
    case_id = serializers.UUIDField(read_only=True)
    case_code = serializers.CharField(source="case.case_code", read_only=True, allow_null=True)

    class Meta:
        model = NotificationLog
        fields = [
            "id",
            "notification_type",
            "title",
            "message",
            "payload",
            "case_id",
            "case_code",
            "created_at",
            "read_at",
        ]


class StaffNotificationSettingSerializer(serializers.Serializer):
    notification_type = serializers.ChoiceField(choices=["EXAMINATION_ORDER"])
    enabled = serializers.BooleanField()
