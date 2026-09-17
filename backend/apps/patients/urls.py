# 원무과
from django.urls import path

from .auth_views import PatientGoogleLoginAPIView
from .auth_views import (
    PatientGoogleLoginAPIView,
    PatientLinkAPIView,
    PatientRegistrationAPIView,
    PatientTokenRefreshAPIView,
)

from .views import (
    AppointmentListAPIView,
    PatientAppointmentRequestAPIView,
    ExaminationScheduleListAPIView,
    PatientDetailAPIView,
    PatientDoctorListAPIView,
    PatientHospitalListAPIView,
    PatientListAPIView,
    PatientAccountLookupAPIView,
    PatientAccountRegistrationAPIView,
    PatientProfileAPIView,
    PatientNotificationListAPIView,
    PatientNotificationReadAPIView,
    PatientNotificationSettingListAPIView,
    PatientNotificationSettingUpdateAPIView,
    PatientQuestionnaireListAPIView,
    PatientQuestionnaireDetailAPIView,
    CoordinatorPatientQuestionnaireAPIView,
    PatientMedicationScheduleListAPIView,
    PatientMedicationIntakeTakenAPIView,
    PatientMedicationIntakeLogListAPIView,
    PatientSymptomLogListCreateAPIView,
    PatientAppointmentCancelRequestAPIView,
    PatientAppointmentChangeRequestAPIView,
    PatientDeviceTokenAPIView,
    PatientAppointmentAvailabilityAPIView,
    )


urlpatterns = [
        # 환자앱 Google 소셜 로그인
    path(
        "auth/google/",
        PatientGoogleLoginAPIView.as_view(),
        name="patient-google-login",
    ),

    path(
        "auth/register/",
        PatientRegistrationAPIView.as_view(),
        name="patient-register",
    ),

    path("", PatientListAPIView.as_view(), name="patient-list"),
    path("hospitals/", PatientHospitalListAPIView.as_view(), name="patient-hospital-list"),
    path("doctors/", PatientDoctorListAPIView.as_view(), name="patient-doctor-list"),
    path("app-accounts/register/", PatientAccountRegistrationAPIView.as_view(), name="patient-account-register"),
    path("app-accounts/lookup/", PatientAccountLookupAPIView.as_view(), name="patient-account-lookup"),

    path(
        "auth/token/refresh/",
        PatientTokenRefreshAPIView.as_view(),
        name="patient-token-refresh",
    ),

    path(
        "auth/patient-link/",
        PatientLinkAPIView.as_view(),
        name="patient-link",
    ),

    # Flutter 환자 앱 - 예약 목록
    path(
        "appointments/", AppointmentListAPIView.as_view(), name="appointment-list",),

    # Flutter 환자 앱 - 예약 요청
    path(
        "appointments/request/",
        PatientAppointmentRequestAPIView.as_view(),
        name="patient-appointment-request",
    ),

    path(
        "appointments/availability/",
        PatientAppointmentAvailabilityAPIView.as_view(),
        name="patient-appointment-availability",
    ),

    path(
        "appointments/<uuid:appointment_id>/cancel-request/",
        PatientAppointmentCancelRequestAPIView.as_view(),
        name="patient-appointment-cancel-request",
    ),

    path(
        "appointments/<uuid:appointment_id>/change-request/",
        PatientAppointmentChangeRequestAPIView.as_view(),
        name="patient-appointment-change-request",
    ),

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
    path("<uuid:patient_id>/questionnaire/", CoordinatorPatientQuestionnaireAPIView.as_view(), name="coordinator-patient-questionnaire"),

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
    path(
        "device-tokens/",
        PatientDeviceTokenAPIView.as_view(),
        name="patient-device-token",
    ),

    # 문진표 작성 내역
    path(
        "questionnaires/",
        PatientQuestionnaireListAPIView.as_view(),
        name="patient-questionnaire-list",
    ),

    path(
        "questionnaires/<uuid:id>/",
        PatientQuestionnaireDetailAPIView.as_view(),
        name="patient-questionnaire-detail",
    ),

    # 복약 일정
    path(
        "medications/",
        PatientMedicationScheduleListAPIView.as_view(),
        name="patient-medication-list",
    ),

    # 복약 기록 조회
    path(
        "medications/intake/",
        PatientMedicationIntakeLogListAPIView.as_view(),
        name="patient-medication-intake-list",
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
