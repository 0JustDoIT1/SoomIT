from django.urls import path

from .appointment_views import (
    AppointmentDetailAPIView,
    AppointmentListAPIView,
)


urlpatterns = [
    path("", AppointmentListAPIView.as_view(), name="appointment-list"),
    path(
        "<uuid:id>/",
        AppointmentDetailAPIView.as_view(),
        name="appointment-detail",
    ),
]

