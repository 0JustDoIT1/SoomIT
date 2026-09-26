# 원무과
from django.urls import path

from .air_quality_views import AirQualityAPIView
from .auth_views import (
    PatientGoogleLoginAPIView,
    PatientLinkAPIView,
    PatientRegistrationAPIView,
    PatientTokenRefreshAPIView,
)
from .pharmacy_views import NearbyPharmacyAPIView

from .views import (
    AppointmentListAPIView,
    CoordinatorPatientQuestionnaireAPIView,
    ExaminationScheduleListAPIView,
    PatientAccountLookupAPIView,
    PatientAccountRegistrationAPIView,
    PatientAppointmentAvailabilityAPIView,
    PatientAppointmentCancelRequestAPIView,
    PatientAppointmentChangeRequestAPIView,
    PatientAppointmentDoctorListAPIView,
    PatientAppointmentRequestAPIView,
    PatientDetailAPIView,
    PatientDeviceTokenAPIView,
    PatientDoctorListAPIView,
    PatientHospitalListAPIView,
    PatientListAPIView,
    PatientMedicationIntakeLogListAPIView,
    PatientMedicationIntakeTakenAPIView,
    PatientMedicationScheduleListAPIView,
    PatientNotificationListAPIView,
    PatientNotificationReadAPIView,
    PatientNotificationSettingListAPIView,
    PatientNotificationSettingUpdateAPIView,
    PatientProfileAPIView,
    PatientPublicQrTokenResolveAPIView,
    PatientQrTokenCreateAPIView,
    PatientQrTokenResolveAPIView,
    PatientQuestionnaireDetailAPIView,
    PatientQuestionnaireListAPIView,
    PatientSymptomLogDetailAPIView,
    PatientSymptomLogListCreateAPIView,
)


urlpatterns = [
    # ─────────────────────────────────────────────
    # 부가기능
    # ─────────────────────────────────────────────

    # 미세먼지
    # 현재는 테스트용 공개 API 상태 유지
    path(
        "public/air-quality/",
        AirQualityAPIView.as_view(),
        name="air-quality",
    ),

    # 주변 약국
    # 로그인한 환자만 접근 가능
    path(
        "nearby-pharmacies/",
        NearbyPharmacyAPIView.as_view(),
        name="nearby-pharmacies",
    ),

    # ─────────────────────────────────────────────
    # QR
    # ─────────────────────────────────────────────
    path(
        "qr-token/public-resolve/",
        PatientPublicQrTokenResolveAPIView.as_view(),
        name="patient-public-qr-token-resolve",
    ),
    path(
        "qr-token/resolve/",
        PatientQrTokenResolveAPIView.as_view(),
        name="patient-qr-token-resolve",
    ),
    path(
        "qr-token/",
        PatientQrTokenCreateAPIView.as_view(),
        name="patient-qr-token-create",
    ),

    # ─────────────────────────────────────────────
    # 환자앱 인증
    # ─────────────────────────────────────────────
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

    # ─────────────────────────────────────────────
    # 원무과 / 환자 기본 정보
    # ─────────────────────────────────────────────
    path(
        "",
        PatientListAPIView.as_view(),
        name="patient-list",
    ),
    path(
        "hospitals/",
        PatientHospitalListAPIView.as_view(),
        name="patient-hospital-list",
    ),
    path(
        "doctors/",
        PatientDoctorListAPIView.as_view(),
        name="patient-doctor-list",
    ),
    path(
        "app-accounts/register/",
        PatientAccountRegistrationAPIView.as_view(),
        name="patient-account-register",
    ),
    path(
        "app-accounts/lookup/",
        PatientAccountLookupAPIView.as_view(),
        name="patient-account-lookup",
    ),

    # ─────────────────────────────────────────────
    # Flutter 환자 앱 - 예약
    # ─────────────────────────────────────────────
    path(
        "appointments/doctors/",
        PatientAppointmentDoctorListAPIView.as_view(),
        name="patient-appointment-doctor-list",
    ),
    path(
        "appointments/",
        AppointmentListAPIView.as_view(),
        name="appointment-list",
    ),
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

    # ─────────────────────────────────────────────
    # 검사 일정
    # ─────────────────────────────────────────────
    path(
        "exam-schedules/",
        ExaminationScheduleListAPIView.as_view(),
        name="exam-schedule-list",
    ),

    # ─────────────────────────────────────────────
    # 프로필
    # ─────────────────────────────────────────────
    path(
        "profile/",
        PatientProfileAPIView.as_view(),
        name="patient-profile",
    ),

    # ─────────────────────────────────────────────
    # 알림
    # ─────────────────────────────────────────────
    path(
        "notifications/",
        PatientNotificationListAPIView.as_view(),
        name="patient-notifications",
    ),
    path(
        "notifications/<uuid:id>/read/",
        PatientNotificationReadAPIView.as_view(),
        name="patient-notification-read",
    ),
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

    # ─────────────────────────────────────────────
    # 문진표
    # ─────────────────────────────────────────────
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
    path(
        "<uuid:patient_id>/questionnaire/",
        CoordinatorPatientQuestionnaireAPIView.as_view(),
        name="coordinator-patient-questionnaire",
    ),

    # ─────────────────────────────────────────────
    # 복약
    # ─────────────────────────────────────────────
    path(
        "medications/",
        PatientMedicationScheduleListAPIView.as_view(),
        name="patient-medication-list",
    ),
    path(
        "medications/intake/",
        PatientMedicationIntakeLogListAPIView.as_view(),
        name="patient-medication-intake-list",
    ),
    path(
        "medications/intake/taken/",
        PatientMedicationIntakeTakenAPIView.as_view(),
        name="patient-medication-intake-taken",
    ),

    # ─────────────────────────────────────────────
    # 증상
    # ─────────────────────────────────────────────
    path(
        "symptoms/",
        PatientSymptomLogListCreateAPIView.as_view(),
        name="patient-symptom-list-create",
    ),
    path(
        "symptoms/<uuid:id>/",
        PatientSymptomLogDetailAPIView.as_view(),
        name="patient-symptom-detail",
    ),

    # ─────────────────────────────────────────────
    # 환자 상세
    # ─────────────────────────────────────────────
    path(
        "<uuid:id>/",
        PatientDetailAPIView.as_view(),
        name="patient-detail",
    ),
]