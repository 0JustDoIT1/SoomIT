# 원무과
from django.urls import path

from .views import PatientListAPIView


urlpatterns = [
    path("", PatientListAPIView.as_view(), name="patient-list"),
]