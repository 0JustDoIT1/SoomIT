# 원무과
from django.urls import path



from .views import (
    AppointmentListAPIView,
    ExaminationScheduleListAPIView,
    PatientDetailAPIView,
    PatientListAPIView,
    PatientProfileAPIView,
    PatientNotificationListAPIView,
    PatientNotificationReadAPIView,
    PatientNotificationSettingListAPIView,
    PatientNotificationSettingUpdateAPIView,
    PatientQuestionnaireListAPIView,
    PatientMedicationScheduleListAPIView,
    PatientMedicationIntakeTakenAPIView,
    PatientSymptomLogListCreateAPIView,
    )


urlpatterns = [
    path("", PatientListAPIView.as_view(), name="patient-list"),
    
    # Flutter 환자 앱 - 예약 목록
    path(
        "appointments/", AppointmentListAPIView.as_view(), name="appointment-list",),

    #  검사 일정
    path(
        "exam-schedules/",
        ExaminationScheduleListAPIView.as_view(),
        name="exam-schedule-list",
    ),
    
    # - 프로필
    path(
        "profile/",
        PatientProfileAPIView.as_view(),
        name="patient-profile",
    ),
    
    #
    path(
    "notifications/",
    PatientNotificationListAPIView.as_view(),
    name="patient-notifications",
    ),

    #
    path(
        "notifications/<uuid:id>/read/",
        PatientNotificationReadAPIView.as_view(),
        name="patient-notification-read",
    ),

    path("<uuid:id>/", PatientDetailAPIView.as_view(), name="patient-detail"),

    path(
    "notification-settings/",
    PatientNotificationSettingListAPIView.as_view(),
    name="patient-notification-settings",
    ),

    path(
        "notification-settings/<str:notification_type>/",
        PatientNotificationSettingUpdateAPIView.as_view(),
        name="patient-notification-setting-update",
    ),
    
    # 문진표 작성 내역
    path(
        "questionnaires/",
        PatientQuestionnaireListAPIView.as_view(),
        name="patient-questionnaire-list",
    ),
    
    # 복약 일정
    path(
        "medications/",
        PatientMedicationScheduleListAPIView.as_view(),
        name="patient-medication-list",
    ),
    
    # 복용 완료
    path(
        "medications/intake/taken/",
        PatientMedicationIntakeTakenAPIView.as_view(),
        name="patient-medication-intake-taken",
    ),

    # 증상
    path(
    "symptoms/",
    PatientSymptomLogListCreateAPIView.as_view(),
    name="patient-symptom-list-create",
),
]