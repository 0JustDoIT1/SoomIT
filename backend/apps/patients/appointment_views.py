from django.db import transaction
from django.utils import timezone
from django.db.models import Q

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from apps.accounts.permissions import IsActiveStaff, IsAdministrationStaff
from apps.cases.models import ExaminationOrder
from .appointment_serializers import (
    AppointmentCancelSerializer,
    AppointmentRequestRejectSerializer,
    AppointmentRequestSerializer,
    AppointmentSerializer,
    CoordinatorExaminationOrderSerializer,
)
from .models import Appointment, AppointmentRequest


def cancel_appointment(appointment, user, cancellation_reason):
    appointment.appointment_status = Appointment.AppointmentStatus.CANCELLED
    appointment.cancelled_at = timezone.now()
    appointment.cancellation_reason = cancellation_reason
    if user is not None:
        appointment.cancelled_by_user = user
    appointment.save(
        update_fields=[
            "appointment_status",
            "cancelled_at",
            "cancellation_reason",
            "cancelled_by_user",
            "updated_at",
        ]
    )


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

        cancel_appointment(
            appointment,
            request.user if request.user.is_authenticated else None,
            serializer.validated_data["cancellation_reason"],
        )

        return Response(
            AppointmentSerializer(appointment).data,
            status=status.HTTP_200_OK,
        )


class AppointmentRequestListAPIView(ListAPIView):
    serializer_class = AppointmentRequestSerializer

    def get_queryset(self):
        queryset = AppointmentRequest.objects.select_related(
            "appointment__patient",
            "requested_by_patient_account",
            "processed_by_user",
        ).order_by("-requested_at")
        request_status = self.request.query_params.get("status")
        if request_status:
            queryset = queryset.filter(status=request_status)
        return queryset


class CoordinatorExaminationOrderListAPIView(ListAPIView):
    """Read-only examination orders visible to staff in the patient's hospital."""

    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsActiveStaff, IsAdministrationStaff]
    serializer_class = CoordinatorExaminationOrderSerializer

    def get_queryset(self):
        hospital_id = self.request.user.department_role.department.hospital_id
        today_start = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
        return (
            ExaminationOrder.objects.filter(case__patient__hospital_id=hospital_id)
            .filter(
                Q(status__in=[ExaminationOrder.Status.ORDERED, ExaminationOrder.Status.SCHEDULED])
                | Q(created_at__gte=today_start)
            )
            .select_related("case__patient", "requesting_doctor")
            .order_by("-created_at")[:50]
        )


class AppointmentRequestDetailAPIView(RetrieveAPIView):
    queryset = AppointmentRequest.objects.select_related(
        "appointment__patient",
        "requested_by_patient_account",
        "processed_by_user",
    )
    serializer_class = AppointmentRequestSerializer
    lookup_field = "id"


class AppointmentRequestApproveAPIView(APIView):
    @transaction.atomic
    def post(self, request, id):
        try:
            appointment_request = AppointmentRequest.objects.select_for_update().get(id=id)
        except AppointmentRequest.DoesNotExist:
            return Response({"detail": "예약 요청 정보를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        if appointment_request.status != AppointmentRequest.Status.PENDING:
            return Response({"detail": "요청중 상태에서만 승인할 수 있습니다."}, status=status.HTTP_400_BAD_REQUEST)

        appointment = Appointment.objects.select_for_update().get(id=appointment_request.appointment_id)
        if appointment.appointment_status == Appointment.AppointmentStatus.CANCELLED:
            return Response({"detail": "이미 취소된 예약 요청은 승인할 수 없습니다."}, status=status.HTTP_400_BAD_REQUEST)

        processed_by_user = request.user if request.user.is_authenticated else None
        if appointment_request.request_type == AppointmentRequest.RequestType.CHANGE:
            requested_scheduled_at = appointment_request.requested_scheduled_at
            if requested_scheduled_at is None:
                return Response({"detail": "변경 희망 일시가 없습니다."}, status=status.HTTP_400_BAD_REQUEST)

            active_statuses = [
                Appointment.AppointmentStatus.REQUESTED,
                Appointment.AppointmentStatus.CONFIRMED,
            ]
            if appointment.doctor_id and Appointment.objects.filter(
                doctor_id=appointment.doctor_id,
                scheduled_at=requested_scheduled_at,
                appointment_status__in=active_statuses,
            ).exclude(id=appointment.id).exists():
                return Response({"detail": "해당 의료진의 같은 시간에 이미 예약이 존재합니다."}, status=status.HTTP_400_BAD_REQUEST)
            if Appointment.objects.filter(
                patient_id=appointment.patient_id,
                scheduled_at=requested_scheduled_at,
                appointment_status__in=active_statuses,
            ).exclude(id=appointment.id).exists():
                return Response({"detail": "같은 시간에 이미 예약이 존재합니다."}, status=status.HTTP_400_BAD_REQUEST)

            appointment.scheduled_at = requested_scheduled_at
            appointment.save(update_fields=["scheduled_at", "updated_at"])
        elif appointment_request.request_type == AppointmentRequest.RequestType.CANCEL:
            cancel_appointment(appointment, processed_by_user, appointment_request.reason)
        else:
            return Response({"detail": "처리할 수 없는 예약 요청입니다."}, status=status.HTTP_400_BAD_REQUEST)

        appointment_request.status = AppointmentRequest.Status.APPROVED
        appointment_request.processed_by_user = processed_by_user
        appointment_request.processed_at = timezone.now()
        appointment_request.save(update_fields=["status", "processed_by_user", "processed_at", "updated_at"])
        return Response(AppointmentRequestSerializer(appointment_request).data, status=status.HTTP_200_OK)


class AppointmentRequestRejectAPIView(APIView):
    @transaction.atomic
    def post(self, request, id):
        serializer = AppointmentRequestRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            appointment_request = AppointmentRequest.objects.select_for_update().get(id=id)
        except AppointmentRequest.DoesNotExist:
            return Response({"detail": "예약 요청 정보를 찾을 수 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        if appointment_request.status != AppointmentRequest.Status.PENDING:
            return Response({"detail": "요청중 상태에서만 반려할 수 있습니다."}, status=status.HTTP_400_BAD_REQUEST)

        appointment_request.status = AppointmentRequest.Status.REJECTED
        appointment_request.processed_by_user = request.user if request.user.is_authenticated else None
        appointment_request.processed_at = timezone.now()
        appointment_request.rejection_reason = serializer.validated_data.get("rejection_reason")
        appointment_request.save(
            update_fields=["status", "processed_by_user", "processed_at", "rejection_reason", "updated_at"]
        )
        return Response(AppointmentRequestSerializer(appointment_request).data, status=status.HTTP_200_OK)
