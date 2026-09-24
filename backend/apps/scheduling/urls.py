from django.urls import path

from .views import (
    DoctorAppointmentListAPIView,
    DoctorAppointmentAvailabilityAPIView,
    DoctorSchedulingPreferenceAPIView,
    DoctorUnavailableDetailAPIView,
    DoctorUnavailableListCreateAPIView,
    DoctorWeeklyAvailabilityDetailAPIView,
    DoctorWeeklyAvailabilityListCreateAPIView,
)

urlpatterns = [
    path("doctor/appointments/", DoctorAppointmentListAPIView.as_view(), name="doctor-appointment-list"),
    path("doctor/weekly-availability/", DoctorWeeklyAvailabilityListCreateAPIView.as_view(), name="doctor-weekly-availability-list"),
    path("doctor/weekly-availability/<uuid:pk>/", DoctorWeeklyAvailabilityDetailAPIView.as_view(), name="doctor-weekly-availability-detail"),
    path("doctor/unavailable/", DoctorUnavailableListCreateAPIView.as_view(), name="doctor-unavailable-list"),
    path("doctor/unavailable/<uuid:pk>/", DoctorUnavailableDetailAPIView.as_view(), name="doctor-unavailable-detail"),
    path("doctor/appointment-settings/", DoctorSchedulingPreferenceAPIView.as_view(), name="doctor-appointment-settings"),
    path("doctors/<uuid:doctor_id>/appointment-availability/", DoctorAppointmentAvailabilityAPIView.as_view(), name="doctor-appointment-availability"),
]
