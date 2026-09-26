from rest_framework import serializers
from django.utils.html import strip_tags

from .models import CaseChatMessage, GlobalChatMessage


class CaseChatMessageSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()
    recipient_ids = serializers.SerializerMethodField()
    read_by = serializers.SerializerMethodField()

    class Meta:
        model = CaseChatMessage
        fields = (
            "id",
            "case_id",
            "client_message_id",
            "sender",
            "body",
            "is_private",
            "recipient_ids",
            "read_by",
            "created_at",
        )

    def get_sender(self, obj):
        department_role = obj.sender.department_role
        return {
            "id": obj.sender_id,
            "name": obj.sender.name,
            "department": department_role.department.code,
            "role": department_role.role,
        }

    def get_recipient_ids(self, obj):
        return [str(recipient_id) for recipient_id in obj.recipients.values_list("id", flat=True)]

    def get_read_by(self, obj):
        request = self.context.get("request")
        if not request or request.user.id != obj.sender_id:
            return []
        return [
            {"id": str(receipt.reader_id), "name": receipt.reader.name, "read_at": receipt.created_at}
            for receipt in obj.read_receipts.all()
        ]


class CaseChatMessageCreateSerializer(serializers.Serializer):
    client_message_id = serializers.UUIDField()
    body = serializers.CharField(max_length=2000, allow_blank=False, trim_whitespace=True)
    is_private = serializers.BooleanField(default=False)
    recipient_ids = serializers.ListField(child=serializers.UUIDField(), required=False, allow_empty=False)

    def validate_body(self, value):
        if strip_tags(value) != value:
            raise serializers.ValidationError("HTML은 메시지에 사용할 수 없습니다.")
        return value

    def validate(self, attrs):
        recipient_ids = attrs.get("recipient_ids", [])
        if len(recipient_ids) != len(set(recipient_ids)):
            raise serializers.ValidationError({"recipient_ids": "수신자는 중복해서 지정할 수 없습니다."})
        if attrs["is_private"] and not attrs.get("recipient_ids"):
            raise serializers.ValidationError({"recipient_ids": "개인 메시지는 수신자를 한 명 이상 지정해야 합니다."})
        if not attrs["is_private"] and attrs.get("recipient_ids"):
            raise serializers.ValidationError({"recipient_ids": "공용 메시지에는 수신자를 지정할 수 없습니다."})
        return attrs


class GlobalChatMessageSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()
    read_by = serializers.SerializerMethodField()

    class Meta:
        model = GlobalChatMessage
        fields = ("id", "client_message_id", "sender", "body", "read_by", "created_at")

    def get_sender(self, obj):
        role = obj.sender.department_role
        return {"id": obj.sender_id, "name": obj.sender.name, "department": role.department.code, "role": role.role}

    def get_read_by(self, obj):
        request = self.context.get("request")
        if not request or request.user.id != obj.sender_id:
            return []
        return [{"id": str(r.reader_id), "name": r.reader.name, "read_at": r.created_at} for r in obj.read_receipts.all()]


class GlobalChatMessageCreateSerializer(serializers.Serializer):
    client_message_id = serializers.UUIDField()
    body = serializers.CharField(max_length=2000, allow_blank=False, trim_whitespace=True)

    def validate_body(self, value):
        if strip_tags(value) != value:
            raise serializers.ValidationError("HTML is not allowed.")
        return value
