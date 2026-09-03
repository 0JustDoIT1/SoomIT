from rest_framework.generics import ListAPIView, RetrieveAPIView

from .appointment_serializers import AppointmentSerializer
from .models import Appointment


# 원무과 - 예약 목록 조회
class AppointmentListAPIView(ListAPIView):
    queryset = (
        Appointment.objects
        .select_related(
            "patient",
            "case",
            "doctor",
        )
        .all()
        .order_by("-scheduled_at")
    )

    serializer_class = AppointmentSerializer


# 원무과 - 예약 상세 조회
class AppointmentDetailAPIView(RetrieveAPIView):
    queryset = (
        Appointment.objects
        .select_related(
            "patient",
            "case",
            "doctor",
        )
        .all()
    )

    serializer_class = AppointmentSerializer
    lookup_field = "id"

    