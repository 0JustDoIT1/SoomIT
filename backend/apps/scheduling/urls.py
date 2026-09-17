from django.urls import path

from .views import (
    DoctorAppointmentAvailabilityAPIView,
    DoctorUnavailableDetailAPIView,
    DoctorUnavailableListCreateAPIView,
    DoctorWeeklyAvailabilityDetailAPIView,
    DoctorWeeklyAvailabilityListCreateAPIView,
)

urlpatterns = [
    path("doctor/weekly-availability/", DoctorWeeklyAvailabilityListCreateAPIView.as_view(), name="doctor-weekly-availability-list"),
    path("doctor/weekly-availability/<uuid:pk>/", DoctorWeeklyAvailabilityDetailAPIView.as_view(), name="doctor-weekly-availability-detail"),
    path("doctor/unavailable/", DoctorUnavailableListCreateAPIView.as_view(), name="doctor-unavailable-list"),
    path("doctor/unavailable/<uuid:pk>/", DoctorUnavailableDetailAPIView.as_view(), name="doctor-unavailable-detail"),
    path("doctors/<uuid:doctor_id>/appointment-availability/", DoctorAppointmentAvailabilityAPIView.as_view(), name="doctor-appointment-availability"),
]
