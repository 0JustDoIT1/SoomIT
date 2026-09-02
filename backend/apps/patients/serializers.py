# flutter용
from rest_framework import serializers
from .models import PatientAccount, SocialAccount


# 원무과(coordinator)
from .models import Patient


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