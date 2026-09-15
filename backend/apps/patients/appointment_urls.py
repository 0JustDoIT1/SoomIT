from django.urls import path

from .appointment_views import (
    AppointmentCancelAPIView,
    AppointmentConfirmAPIView,
    AppointmentDetailAPIView,
    AppointmentListAPIView,
    AppointmentRequestApproveAPIView,
    AppointmentRequestDetailAPIView,
    AppointmentRequestListAPIView,
    AppointmentRequestRejectAPIView,
)

urlpatterns = [
    path("", AppointmentListAPIView.as_view(), name="appointment-list"),
    path("requests/", AppointmentRequestListAPIView.as_view(), name="appointment-request-list"),
    path("requests/<uuid:id>/", AppointmentRequestDetailAPIView.as_view(), name="appointment-request-detail"),
    path("requests/<uuid:id>/approve/", AppointmentRequestApproveAPIView.as_view(), name="appointment-request-approve"),
    path("requests/<uuid:id>/reject/", AppointmentRequestRejectAPIView.as_view(), name="appointment-request-reject"),
    path("<uuid:id>/", AppointmentDetailAPIView.as_view(), name="appointment-detail"),
    path("<uuid:id>/confirm/", AppointmentConfirmAPIView.as_view(), name="appointment-confirm"),
    path("<uuid:id>/cancel/", AppointmentCancelAPIView.as_view(), name="appointment-cancel"),
]
