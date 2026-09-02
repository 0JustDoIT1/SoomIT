# 원무과
from django.urls import path

from .views import PatientListAPIView, PatientDetailAPIView


urlpatterns = [
    path("", PatientListAPIView.as_view(), name="patient-list"),
    path("<uuid:id>/", PatientDetailAPIView.as_view(), name="patient-detail"),
]