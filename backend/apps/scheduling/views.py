from datetime import datetime, time

from django.utils.dateparse import parse_date
from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.models import User

from .models import DoctorSchedule, DoctorSchedulingPreference, DoctorWeeklyAvailability
from .permissions import IsPatientAppService
from .serializers import DoctorSchedulingPreferenceSerializer, DoctorUnavailableSerializer, DoctorWeeklyAvailabilitySerializer


class DoctorOwnedQuerysetMixin:
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

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
        preference = DoctorSchedulingPreference.objects.filter(doctor=request.user).first()
        return Response(DoctorSchedulingPreferenceSerializer(preference or DoctorSchedulingPreference(doctor=request.user)).data)

    def patch(self, request):
        preference, _ = DoctorSchedulingPreference.objects.get_or_create(doctor=request.user)
        serializer = DoctorSchedulingPreferenceSerializer(preference, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


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
        doctor = User.objects.filter(id=doctor_id, account_status=User.AccountStatus.ACTIVE).first()
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

        preference = DoctorSchedulingPreference.objects.filter(doctor=doctor).first()
        return Response({
            "doctor_id": str(doctor.id),
            "slot_capacity": preference.slot_capacity if preference else 5,
            "weekly_availability": DoctorWeeklyAvailabilitySerializer(
                DoctorWeeklyAvailability.objects.filter(doctor=doctor, enabled=True), many=True
            ).data,
            "unavailable": DoctorUnavailableSerializer(unavailable, many=True).data,
        })


def start_at_tz(request):
    """Use Django's configured timezone for date-only appointment range filters."""
    from django.utils import timezone

    return timezone.get_current_timezone()
