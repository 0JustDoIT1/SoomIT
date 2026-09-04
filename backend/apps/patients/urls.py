# 원무과
from django.urls import path

from .views import (
    AppointmentListAPIView,
    ExaminationScheduleListAPIView,
    PatientDetailAPIView,
    PatientListAPIView,
    PatientProfileAPIView,
)


urlpatterns = [
    path("", PatientListAPIView.as_view(), name="patient-list"),
    
    # Flutter 환자 앱 - 예약 목록
    path(
        "appointments/", AppointmentListAPIView.as_view(), name="appointment-list",),

    # Flutter 환자 앱 - 검사 일정
    path(
        "exam-schedules/",
        ExaminationScheduleListAPIView.as_view(),
        name="exam-schedule-list",
    ),
    
    # Flutter 환자 앱 - 프로필
    path(
        "profile/",
        PatientProfileAPIView.as_view(),
        name="patient-profile",
    ),

    path("<uuid:id>/", PatientDetailAPIView.as_view(), name="patient-detail"),
]