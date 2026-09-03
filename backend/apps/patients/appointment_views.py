from django.db import transaction
from django.utils import timezone

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from .appointment_serializers import AppointmentCancelSerializer, AppointmentSerializer
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


# 원무과 - 예약 확정
class AppointmentConfirmAPIView(APIView):

    @transaction.atomic
    def post(self, request, id):
        try:
            appointment = (
                Appointment.objects
                .select_for_update()
                .get(id=id)
            )
        except Appointment.DoesNotExist:
            return Response(
                {"detail": "예약 정보를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # REQUESTED 상태에서만 확정 가능
        if appointment.appointment_status != Appointment.AppointmentStatus.REQUESTED:
            return Response(
                {
                    "detail": "예약 요청 상태에서만 확정할 수 있습니다."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        appointment.appointment_status = Appointment.AppointmentStatus.CONFIRMED
        appointment.confirmed_at = timezone.now()

        # 로그인 기능 연결 전에는 null 허용
        if request.user.is_authenticated:
            appointment.confirmed_by_user = request.user

        appointment.save(
            update_fields=[
                "appointment_status",
                "confirmed_at",
                "confirmed_by_user",
                "updated_at",
            ]
        )

        return Response(
            AppointmentSerializer(appointment).data,
            status=status.HTTP_200_OK,
        )


# 원무과 - 예약 취소
class AppointmentCancelAPIView(APIView):

    @extend_schema(
        request=AppointmentCancelSerializer,
        responses=AppointmentSerializer,
    )
    @transaction.atomic
    def post(self, request, id):
        try:
            appointment = (
                Appointment.objects
                .select_for_update()
                .get(id=id)
            )
        except Appointment.DoesNotExist:
            return Response(
                {"detail": "예약 정보를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # REQUESTED 또는 CONFIRMED 상태에서만 취소 가능
        if appointment.appointment_status not in [
            Appointment.AppointmentStatus.REQUESTED,
            Appointment.AppointmentStatus.CONFIRMED,
        ]:
            return Response(
                {
                    "detail": "이미 취소된 예약입니다."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = AppointmentCancelSerializer(
            data=request.data
        )

        serializer.is_valid(raise_exception=True)

        appointment.appointment_status = Appointment.AppointmentStatus.CANCELLED
        appointment.cancelled_at = timezone.now()
        appointment.cancellation_reason = (
            serializer.validated_data["cancellation_reason"]
        )

        # 로그인 기능 연결 전에는 null 허용
        if request.user.is_authenticated:
            appointment.cancelled_by_user = request.user

        appointment.save(
            update_fields=[
                "appointment_status",
                "cancelled_at",
                "cancellation_reason",
                "cancelled_by_user",
                "updated_at",
            ]
        )

        return Response(
            AppointmentSerializer(appointment).data,
            status=status.HTTP_200_OK,
        )