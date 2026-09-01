# 원무과
from rest_framework.generics import ListAPIView

from .models import Patient
from .serializers import PatientSerializer


class PatientListAPIView(ListAPIView):
    queryset = Patient.objects.all().order_by("-created_at")
    serializer_class = PatientSerializer