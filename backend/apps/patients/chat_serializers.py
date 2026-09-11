from rest_framework import serializers


class PatientChatMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField(max_length=12000, trim_whitespace=False)


class PatientChatRequestSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=4000, trim_whitespace=False)
    history = PatientChatMessageSerializer(
        many=True,
        required=False,
        default=list,
    )

    def validate_history(self, value):
        if len(value) > 20:
            raise serializers.ValidationError("대화 기록은 최대 20개까지 전송할 수 있습니다.")
        return value


class PatientChatResponseSerializer(serializers.Serializer):
    answer = serializers.CharField(read_only=True)
