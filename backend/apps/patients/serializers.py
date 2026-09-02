import hashlib

from rest_framework import serializers

from .models import Patient, PatientAccount, SocialAccount


# ─────────────────────────────────────────────
# Flutter용
# 기존 Flutter serializer가 추가되면 이 아래에 유지
# ─────────────────────────────────────────────


# ─────────────────────────────────────────────
# 원무과(coordinator) - 환자 조회용
# ─────────────────────────────────────────────
class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = [
            "id",
            "patient_code",
            "name",
            "birth_date",
            "sex",
            "phone_number",
            "address",
            "created_at",
            "updated_at",
        ]


# ─────────────────────────────────────────────
# 원무과(coordinator) - 신규 환자 등록용
# ─────────────────────────────────────────────
class PatientCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = [
            "patient_code",
            "name",
            "birth_date",
            "sex",
            "phone_number",
            "address",
        ]


# ─────────────────────────────────────────────
# 원무과(coordinator) - 환자정보 수정용
# ─────────────────────────────────────────────
class PatientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = [
            "name",
            "birth_date",
            "sex",
            "phone_number",
            "address",
        ]

    def update(self, instance, validated_data):
        # 연락처가 수정된 경우 phone_number_hash도 함께 갱신
        if "phone_number" in validated_data:
            phone_number = validated_data["phone_number"]

            normalized_phone = "".join(
                char for char in phone_number if char.isdigit()
            )

            instance.phone_number_hash = hashlib.sha256(
                normalized_phone.encode("utf-8")
            ).hexdigest()

        instance.name = validated_data.get(
            "name",
            instance.name,
        )

        instance.birth_date = validated_data.get(
            "birth_date",
            instance.birth_date,
        )

        instance.sex = validated_data.get(
            "sex",
            instance.sex,
        )

        instance.phone_number = validated_data.get(
            "phone_number",
            instance.phone_number,
        )

        instance.address = validated_data.get(
            "address",
            instance.address,
        )

        instance.save()

        return instance