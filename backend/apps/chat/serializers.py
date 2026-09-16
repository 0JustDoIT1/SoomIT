from rest_framework import serializers
from django.utils.html import strip_tags

from .models import CaseChatMessage


class CaseChatMessageSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()

    class Meta:
        model = CaseChatMessage
        fields = ("id", "case_id", "sender", "body", "created_at")

    def get_sender(self, obj):
        department_role = obj.sender.department_role
        return {
            "id": obj.sender_id,
            "name": obj.sender.name,
            "department": department_role.department.code,
            "role": department_role.role,
        }


class CaseChatMessageCreateSerializer(serializers.Serializer):
    client_message_id = serializers.UUIDField()
    body = serializers.CharField(max_length=2000, allow_blank=False, trim_whitespace=True)

    def validate_body(self, value):
        if strip_tags(value) != value:
            raise serializers.ValidationError("HTML은 메시지에 사용할 수 없습니다.")
        return value
