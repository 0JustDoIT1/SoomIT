from datetime import datetime, time

from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.models import DepartmentRole, User
from apps.accounts.permissions import IsActiveStaff, IsDoctor
from apps.patients.models import Appointment

from .models import DoctorSchedule, DoctorWeeklyAvailability
from .permissions import IsPatientAppService
from .serializers import (
    DoctorAppointmentSerializer,
    DoctorUnavailableSerializer,
    DoctorWeeklyAvailabilitySerializer,
)


FIXED_SLOT_CAPACITY = 5


class DoctorOwnedQuerysetMixin:
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor]

    def get_queryset(self):
        return super().get_queryset().filter(doctor=self.request.user)


@extend_schema(tags=["Doctor scheduling"])
class DoctorWeeklyAvailabilityListCreateAPIView(DoctorOwnedQuerysetMixin, ListCreateAPIView):
    serializer_class = DoctorWeeklyAvailabilitySerializer
    queryset = DoctorWeeklyAvailability.objects.all()

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user)


@extend_schema(tags=["Doctor scheduling"])
class DoctorWeeklyAvailabilityDetailAPIView(DoctorOwnedQuerysetMixin, RetrieveUpdateDestroyAPIView):
    serializer_class = DoctorWeeklyAvailabilitySerializer
    queryset = DoctorWeeklyAvailability.objects.all()


@extend_schema(tags=["Doctor scheduling"])
class DoctorUnavailableListCreateAPIView(DoctorOwnedQuerysetMixin, ListCreateAPIView):
    serializer_class = DoctorUnavailableSerializer
    queryset = DoctorSchedule.objects.filter(schedule_type=DoctorSchedule.ScheduleType.UNAVAILABLE)

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user, schedule_type=DoctorSchedule.ScheduleType.UNAVAILABLE)


@extend_schema(tags=["Doctor scheduling"])
class DoctorUnavailableDetailAPIView(DoctorOwnedQuerysetMixin, RetrieveUpdateDestroyAPIView):
    serializer_class = DoctorUnavailableSerializer
    queryset = DoctorSchedule.objects.filter(schedule_type=DoctorSchedule.ScheduleType.UNAVAILABLE)


@extend_schema(tags=["Doctor scheduling"])
class DoctorSchedulingPreferenceAPIView(DoctorOwnedQuerysetMixin, APIView):
    def get(self, request):
        return Response({"slot_capacity": FIXED_SLOT_CAPACITY})

    def patch(self, request):
        return Response(
            {"detail": "예약 슬롯 정원은 30분당 5명으로 고정되어 있습니다."},
            status=405,
        )


@extend_schema(tags=["Doctor scheduling"])
class DoctorAppointmentListAPIView(DoctorOwnedQuerysetMixin, ListAPIView):
    """Read-only appointment feed for the logged-in doctor's calendar views."""

    serializer_class = DoctorAppointmentSerializer
    permission_classes = [IsAuthenticated, IsActiveStaff, IsDoctor]
    queryset = Appointment.objects.select_related("patient", "case", "doctor").order_by("scheduled_at")

    def get_queryset(self):
        queryset = super().get_queryset().exclude(
            appointment_status=Appointment.AppointmentStatus.CANCELLED
        )
        start = parse_date(self.request.query_params.get("start", ""))
        end = parse_date(self.request.query_params.get("end", ""))
        if start is not None:
            queryset = queryset.filter(scheduled_at__date__gte=start)
        if end is not None:
            queryset = queryset.filter(scheduled_at__date__lte=end)
        return queryset


@extend_schema(tags=["Appointment availability"])
class DoctorAppointmentAvailabilityAPIView(
    DoctorOwnedQuerysetMixin,
    APIView,
):
    """Read model for the patient appointment backend; EXTRA_AVAILABLE is intentionally excluded."""

    permission_classes = [
        IsAuthenticated | IsPatientAppService
    ]

    def get(self, request, doctor_id):
        doctor = User.objects.filter(
            id=doctor_id,
            account_status=User.AccountStatus.ACTIVE,
            department_role__role=DepartmentRole.Role.DOCTOR,
        ).first()
        if doctor is None:
            return Response({"detail": "Doctor was not found."}, status=404)

        start = parse_date(request.query_params.get("start", ""))
        end = parse_date(request.query_params.get("end", ""))
        if (start is None) != (end is None):
            return Response({"detail": "Provide both start and end as YYYY-MM-DD."}, status=400)
        if start is not None and end < start:
            return Response({"detail": "end must not precede start."}, status=400)

        unavailable = DoctorSchedule.objects.filter(
            doctor=doctor,
            schedule_type=DoctorSchedule.ScheduleType.UNAVAILABLE,
        ).order_by("start_at")
        if start is not None:
            unavailable = unavailable.filter(
                start_at__lt=datetime.combine(end, time.max, tzinfo=start_at_tz(request)),
                end_at__gt=datetime.combine(start, time.min, tzinfo=start_at_tz(request)),
            )

        return Response({
            "doctor_id": str(doctor.id),
            "slot_capacity": FIXED_SLOT_CAPACITY,
            "weekly_availability": DoctorWeeklyAvailabilitySerializer(
                DoctorWeeklyAvailability.objects.filter(doctor=doctor, enabled=True), many=True
            ).data,
            "unavailable": DoctorUnavailableSerializer(unavailable, many=True).data,
        })


def start_at_tz(request):
    """Use Django's configured timezone for date-only appointment range filters."""
    from django.utils import timezone

    return timezone.get_current_timezone()
