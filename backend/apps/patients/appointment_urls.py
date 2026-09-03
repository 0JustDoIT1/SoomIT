from django.urls import path

from .appointment_views import AppointmentCancelAPIView, AppointmentConfirmAPIView, AppointmentDetailAPIView, AppointmentListAPIView

urlpatterns = [
    path("", AppointmentListAPIView.as_view(), name="appointment-list"),
    path("<uuid:id>/", AppointmentDetailAPIView.as_view(), name="appointment-detail"),
    path("<uuid:id>/confirm/", AppointmentConfirmAPIView.as_view(), name="appointment-confirm"),
    path("<uuid:id>/cancel/", AppointmentCancelAPIView.as_view(), name="appointment-cancel"),
]