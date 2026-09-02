# 원무과
from rest_framework.generics import ListAPIView, RetrieveAPIView

from .models import Patient
from .serializers import PatientSerializer


class PatientListAPIView(ListAPIView): # 환자 전체 목록 조회
    queryset = Patient.objects.all().order_by("-created_at")
    serializer_class = PatientSerializer


class PatientDetailAPIView(RetrieveAPIView): # PatientDetailAPIView
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    lookup_field = "id"