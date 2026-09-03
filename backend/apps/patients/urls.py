# 원무과
from django.urls import path

from .views import (
    AppointmentListAPIView,
    PatientDetailAPIView,
    PatientListAPIView,
)


urlpatterns = [
    path("", PatientListAPIView.as_view(), name="patient-list"),
    
    # Flutter 환자 앱 - 예약 목록
    path(
        "appointments/", AppointmentListAPIView.as_view(), name="appointment-list",),
    
    path("<uuid:id>/", PatientDetailAPIView.as_view(), name="patient-detail"),
]