import hashlib

from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateAPIView,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.models import Hospital
from apps.cases.models import LungCancerCase

from .models import (
    Appointment,
    CurrentMedication,
    LabResult,
    Patient,
)
from .serializers import (
    AppointmentSerializer,
    CurrentMedicationSerializer,
    ExaminationScheduleSerializer,
    LabResultSerializer,
    PatientCreateSerializer,
    PatientDetailSerializer,
    PatientProfileSerializer,
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
@extend_schema(tags=["환자앱-예약"])
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
        
# ─────────────────────────────────────────────
# 환자 검사 일정 조회
# - 로그인 구현 전 개발용
# ─────────────────────────────────────────────
@extend_schema(tags=["환자앱-검사일정"])
class ExaminationScheduleListAPIView(ListAPIView):
    serializer_class = ExaminationScheduleSerializer

    def get_queryset(self):
        # 로그인 연동 전 개발용 테스트 환자
        patient = Patient.objects.first()

        if patient is None:
            return Appointment.objects.none()

        return (
            Appointment.objects
            .filter(
                patient=patient,
                examination_order__isnull=False,
                appointment_status="CONFIRMED",
                visit_status="SCHEDULED",
            )
            .select_related(
                "patient",
                "patient__hospital",
                "doctor",
                "examination_order",
            )
            .order_by("scheduled_at")
        )
        

# ─────────────────────────────────────────────
# - 환자 프로필 조회
# 홈 / 마이페이지 공용
# 로그인 구현 전 개발용
# ─────────────────────────────────────────────
@extend_schema(tags=["환자앱-마이페이지"])
class PatientProfileAPIView(RetrieveUpdateAPIView):
    serializer_class = PatientProfileSerializer

    def get_object(self):
        # 로그인 연동 전 개발용 테스트 환자
        patient = Patient.objects.first()

        if patient is None:
            raise ValidationError(
                {"patient": "등록된 환자 정보가 없습니다."}
            )

        return patient

@extend_schema(tags=["호흡기내과-환자정보"])
class DoctorCurrentMedicationListCreateAPIView(ListCreateAPIView):
    serializer_class = CurrentMedicationSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_case(self):
        case_id = self.kwargs["case_id"]

        return (
            LungCancerCase.objects
            .select_related("patient")
            .filter(
                id=case_id,
                primary_doctor=self.request.user,
                case_status="ACTIVE",
            )
            .first()
        )

    def get_queryset(self):
        case = self.get_case()

        if case is None:
            return CurrentMedication.objects.none()

        return (
            CurrentMedication.objects
            .filter(patient=case.patient)
            .select_related(
                "drug",
                "recorded_by_user",
            )
            .order_by("-is_active", "-created_at")
        )

    def perform_create(self, serializer):
        case = self.get_case()

        if case is None:
            raise ValidationError(
                {"case": "담당 Case를 찾을 수 없습니다."}
            )

        serializer.save(
            patient=case.patient,
            recorded_by_user=self.request.user,
        )

@extend_schema(tags=["호흡기내과-환자정보"])
class DoctorLabResultListCreateAPIView(ListCreateAPIView):
    serializer_class = LabResultSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_case(self):
        case_id = self.kwargs["case_id"]

        return (
            LungCancerCase.objects
            .select_related("patient")
            .filter(
                id=case_id,
                primary_doctor=self.request.user,
                case_status="ACTIVE",
            )
            .first()
        )

    def get_queryset(self):
        case = self.get_case()

        if case is None:
            return LabResult.objects.none()

        return (
            LabResult.objects
            .filter(patient=case.patient)
            .select_related("recorded_by_user")
            .order_by("-tested_at")
        )

    def perform_create(self, serializer):
        case = self.get_case()

        if case is None:
            raise ValidationError(
                {"case": "담당 Case를 찾을 수 없습니다."}
            )

        serializer.save(
            patient=case.patient,
            recorded_by_user=self.request.user,
        )