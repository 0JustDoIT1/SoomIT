import hashlib

from rest_framework.exceptions import ValidationError
from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateAPIView,
)

from apps.accounts.models import Hospital

from .models import Patient, Appointment
from .serializers import (
    AppointmentSerializer,
    PatientCreateSerializer,
    PatientDetailSerializer,
    PatientSerializer,
    PatientUpdateSerializer,
)


# 원무과 - 환자 목록 조회 / 신규 환자 등록
class PatientListAPIView(ListCreateAPIView):
    queryset = Patient.objects.all().order_by("-created_at")

    def get_serializer_class(self):
        # GET /api/patients/
        if self.request.method == "GET":
            return PatientSerializer

        # POST /api/patients/
        return PatientCreateSerializer

    def perform_create(self, serializer):
        # 로그인/병원 연동 전 개발용 처리
        hospital = Hospital.objects.first()

        if hospital is None:
            raise ValidationError(
                {"hospital": "등록된 병원 정보가 없습니다."}
            )

        phone_number = serializer.validated_data["phone_number"]

        normalized_phone = "".join(
            char for char in phone_number if char.isdigit()
        )

        phone_number_hash = hashlib.sha256(
            normalized_phone.encode("utf-8")
        ).hexdigest()

        serializer.save(
            hospital=hospital,
            phone_number_hash=phone_number_hash,
        )


# 원무과 - 환자 상세 조회 / 환자정보 수정
class PatientDetailAPIView(RetrieveUpdateAPIView):
    queryset = Patient.objects.all()
    lookup_field = "id"

    def get_serializer_class(self):
        # GET /api/patients/{id}/
        if self.request.method == "GET":
            return PatientDetailSerializer

        # PATCH / PUT
        return PatientUpdateSerializer
    
    




# ─────────────────────────────────────────────
# Flutter용 - 환자 예약 목록 조회
# 로그인 구현 전 개발용
# ─────────────────────────────────────────────
class AppointmentListAPIView(ListAPIView):
    serializer_class = AppointmentSerializer

    def get_queryset(self):
        # 로그인 연동 전 개발용 테스트 환자
        patient = Patient.objects.first()

        if patient is None:
            return Appointment.objects.none()

        return (
            Appointment.objects
            .filter(patient=patient)
            .select_related(
                "patient",
                "patient__hospital",
                "doctor",
                "examination_order",
            )
            .order_by("-scheduled_at")
        )