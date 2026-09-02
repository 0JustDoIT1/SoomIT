# flutter용
from rest_framework import serializers

from .models import Patient, PatientAccount, SocialAccount


# 원무과(coordinator) - 조회용
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


# 원무과(coordinator) - 신규 등록용
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