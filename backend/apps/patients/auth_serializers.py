from django.utils import timezone
from rest_framework import serializers

from .models import Patient

class GoogleSocialLoginSerializer(serializers.Serializer):
    id_token = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=False,
        max_length=10000,
    )
    
class PatientRegistrationSerializer(
    serializers.Serializer
):
    registration_token = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=False,
        max_length=10000,
    )
    name = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=100,
    )
    birth_date = serializers.DateField(
        required=True,
    )
    sex = serializers.ChoiceField(
        required=True,
        choices=Patient.Sex.choices,
    )
    phone_number = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=20,
    )
    postal_code = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=10,
    )
    address = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=255,
    )
    address_detail = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=255,
    )
    patient_code = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=50,
    )

    def validate_birth_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError(
                "생년월일은 오늘 이후일 수 없습니다."
            )

        return value

    def validate_phone_number(self, value):
        normalized_phone = (
            value.replace("-", "")
            .replace(" ", "")
        )

        if not normalized_phone.isdigit():
            raise serializers.ValidationError(
                "휴대전화번호는 숫자와 하이픈만 "
                "입력할 수 있습니다."
            )

        if (
            len(normalized_phone) != 11
            or not normalized_phone.startswith("010")
        ):
            raise serializers.ValidationError(
                "휴대전화번호는 010으로 시작하는 "
                "11자리여야 합니다."
            )

        return normalized_phone

    def validate_postal_code(self, value):
        normalized_postal_code = value.strip()

        if (
            not normalized_postal_code.isdigit()
            or len(normalized_postal_code) != 5
        ):
            raise serializers.ValidationError(
                "우편번호는 숫자 5자리여야 합니다."
            )

        return normalized_postal_code

    def validate_patient_code(self, value):
        return value.strip().upper()    

class PatientTokenRefreshSerializer(
    serializers.Serializer
):
    refresh = serializers.CharField(
        required=True,
        allow_blank=False,
        trim_whitespace=False,
        max_length=10000,
    )
    
class PatientLinkSerializer(
    serializers.Serializer
):
    patient_code = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=50,
    )

    def validate_patient_code(self, value):
        patient_code = value.strip().upper()

        if not patient_code:
            raise serializers.ValidationError(
                "환자코드를 입력해주세요."
            )

        return patient_code