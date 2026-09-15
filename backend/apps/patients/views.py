import hashlib
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import APIException, ValidationError

from apps.notifications.models import NotificationLog

from rest_framework.generics import (
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateAPIView,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from apps.accounts.models import Hospital, User
from apps.cases.models import LungCancerCase
from apps.notifications.models import PatientNotificationSetting

from .models import (
    Patient,
    PatientAccount,
    Appointment,
    CurrentMedication,
    LabResult,
    PatientQuestionnaire,
    MedicationSchedule,
    MedicationIntakeLog,
    SymptomLog,
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
    PatientNotificationSerializer,
    PatientNotificationSettingSerializer,
    PatientQuestionnaireSerializer,
    PatientQuestionnaireCreateSerializer,
    MedicationScheduleSerializer,
    MedicationIntakeTakenSerializer,
    MedicationIntakeLogSerializer,
    SymptomLogSerializer,
    PatientAppointmentRequestSerializer,
    PatientAppointmentCancelRequestSerializer,
    PatientAppointmentChangeRequestSerializer,
    PatientQuestionnaireUpdateSerializer,
    
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
# 호흡기내과 - 환자정보
# ─────────────────────────────────────────────
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
        
# 환자 예약 요청 POST      
@extend_schema(
    tags=["환자앱-예약"],
    summary="환자 예약 요청",
    description="환자가 외래 진료 예약을 요청합니다. 생성 시 REQUESTED 상태로 저장됩니다.",
    request=PatientAppointmentRequestSerializer,
    responses=AppointmentSerializer,
)
class PatientAppointmentRequestAPIView(APIView):

    @transaction.atomic
    def post(self, request):
        serializer = PatientAppointmentRequestSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        # TODO: 로그인 구현 후 request.user 기반 환자로 변경
        patient = Patient.objects.first()

        if patient is None:
            return Response(
                {"detail": "환자 정보를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        patient_account = (
            PatientAccount.objects
            .filter(
                patient=patient,
                link_status="LINKED",
            )
            .first()
        )

        if patient_account is None:
            return Response(
                {"detail": "연결된 환자 계정을 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        doctor = None
        doctor_id = serializer.validated_data.get("doctor_id")

        if doctor_id is not None:
            try:
                doctor = User.objects.get(id=doctor_id)
            except User.DoesNotExist:
                return Response(
                    {"doctor_id": "해당 의료진을 찾을 수 없습니다."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        scheduled_at = serializer.validated_data["scheduled_at"]

        # 동일 환자의 동일 시간 중복 예약 방지
        duplicate_exists = Appointment.objects.filter(
            patient=patient,
            scheduled_at=scheduled_at,
            appointment_status__in=[
                Appointment.AppointmentStatus.REQUESTED,
                Appointment.AppointmentStatus.CONFIRMED,
            ],
        ).exists()

        if duplicate_exists:
            return Response(
                {"detail": "같은 시간에 이미 예약이 존재합니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        appointment = Appointment.objects.create(
            patient=patient,
            doctor=doctor,
            scheduled_at=scheduled_at,
            appointment_status=Appointment.AppointmentStatus.REQUESTED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.PATIENT,
            created_by_patient_account=patient_account,
        )

        return Response(
            AppointmentSerializer(appointment).data,
            status=status.HTTP_201_CREATED,
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
    
# ─────────────────────────────────────────────
# - 환자 앱 알림 목록 조회
# ─────────────────────────────────────────────
@extend_schema(tags=["환자앱-알림"])
class PatientNotificationListAPIView(APIView):

    def get(self, request):
        # TODO: 로그인 구현 후 request.user 기반으로 변경
        patient = Patient.objects.first()

        if patient is None:
            raise ValidationError({
                "patient": "등록된 환자 정보가 없습니다."
            })

        patient_account = patient.accounts.first()

        # 아직 앱 계정이 연결되지 않은 환자
        if patient_account is None:
            return Response([], status=status.HTTP_200_OK)

        notifications = (
            NotificationLog.objects
            .filter(
                recipient_patient_account=patient_account,
                channel="IN_APP",
            )
            .order_by("-created_at")
        )

        serializer = PatientNotificationSerializer(
            notifications,
            many=True,
        )

        return Response(serializer.data)
    
    
# ─────────────────────────────────────────────
# 환자 앱 알림 읽음 처리
# ─────────────────────────────────────────────
@extend_schema(
    tags=["환자앱-알림"],
    request=None,
    responses={200: PatientNotificationSerializer},
)
class PatientNotificationReadAPIView(APIView):

    def patch(self, request, id):
        # TODO: 로그인 구현 후 request.user 기반으로 변경
        patient = Patient.objects.first()

        if patient is None:
            raise ValidationError({
                "patient": "등록된 환자 정보가 없습니다."
            })

        patient_account = patient.accounts.first()

        if patient_account is None:
            raise ValidationError({
                "patient_account": "연결된 환자 앱 계정이 없습니다."
            })

        try:
            notification = NotificationLog.objects.get(
                id=id,
                recipient_patient_account=patient_account,
            )
        except NotificationLog.DoesNotExist:
            return Response(
                {"detail": "알림을 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 이미 읽은 알림이면 기존 read_at 유지
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])

        serializer = PatientNotificationSerializer(notification)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )

@extend_schema(
    tags=["환자앱-알림설정"],
    responses={200: PatientNotificationSettingSerializer(many=True)},
)
class PatientNotificationSettingListAPIView(APIView):
    def get(self, request):
        patient = Patient.objects.first()

        if patient is None:
            raise ValidationError({
                "patient": "등록된 환자 정보가 없습니다."
            })

        patient_account = patient.accounts.first()

        if patient_account is None:
            raise ValidationError({
                "patient_account": "연결된 환자 계정이 없습니다."
            })

        # 알림 종류가 아직 DB에 없으면 기본 ON 상태로 생성
        for notification_type, _ in PatientNotificationSetting.NotificationType.choices:
            PatientNotificationSetting.objects.get_or_create(
                patient_account=patient_account,
                notification_type=notification_type,
                defaults={
                    "enabled": True,
                },
            )

        settings = PatientNotificationSetting.objects.filter(
            patient_account=patient_account,
        ).order_by("notification_type")

        serializer = PatientNotificationSettingSerializer(
            settings,
            many=True,
        )

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["환자앱-알림설정"],
    request=PatientNotificationSettingSerializer,
    responses={200: PatientNotificationSettingSerializer},
)
class PatientNotificationSettingUpdateAPIView(APIView):
    def patch(self, request, notification_type):
        patient = Patient.objects.first()

        if patient is None:
            raise ValidationError({
                "patient": "등록된 환자 정보가 없습니다."
            })

        patient_account = patient.accounts.first()

        if patient_account is None:
            raise ValidationError({
                "patient_account": "연결된 환자 계정이 없습니다."
            })

        valid_types = [
            value
            for value, _ in
            PatientNotificationSetting.NotificationType.choices
        ]

        if notification_type not in valid_types:
            return Response(
                {
                    "notification_type":
                        "올바르지 않은 알림 종류입니다."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        setting, _ = PatientNotificationSetting.objects.get_or_create(
            patient_account=patient_account,
            notification_type=notification_type,
            defaults={
                "enabled": True,
            },
        )

        if "enabled" not in request.data:
            return Response(
                {
                    "enabled":
                        "enabled 값이 필요합니다."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PatientNotificationSettingSerializer(
            setting,
            data={
                "enabled": request.data.get("enabled"),
            },
            partial=True,
        )

        serializer.is_valid(
            raise_exception=True,
        )

        serializer.save()

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )
        
# ─────────────────────────────────────────────
# 문진표 목록 조회 / 작성 제출
# 로그인 구현 전 개발용
# ─────────────────────────────────────────────
@extend_schema(tags=["환자앱-문진표"])
class PatientQuestionnaireListAPIView(ListCreateAPIView):

    def get_queryset(self):
        patient = Patient.objects.first()

        if patient is None:
            return PatientQuestionnaire.objects.none()

        return (
            PatientQuestionnaire.objects
            .filter(patient=patient)
            .order_by("-created_at")
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PatientQuestionnaireCreateSerializer

        return PatientQuestionnaireSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()

        patient = Patient.objects.first()

        if patient is None:
            raise ValidationError({
                "patient": "등록된 환자 정보가 없습니다."
            })

        context["patient"] = patient

        return context

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data
        )
    
        serializer.is_valid(
            raise_exception=True
        )
    
        questionnaire = serializer.save()
    
        response_serializer = (
            PatientQuestionnaireSerializer(
                questionnaire
            )
        )
    
        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
        )

@extend_schema(tags=["환자앱-문진표"])
class PatientQuestionnaireDetailAPIView(
    RetrieveUpdateAPIView
):
    queryset = PatientQuestionnaire.objects.all()
    lookup_field = "id"

    def get_serializer_class(self):
        if self.request.method in ["PATCH", "PUT"]:
            return PatientQuestionnaireUpdateSerializer

        return PatientQuestionnaireSerializer

    def get_queryset(self):
        patient = Patient.objects.first()

        if patient is None:
            return PatientQuestionnaire.objects.none()

        return PatientQuestionnaire.objects.filter(
            patient=patient,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)

        instance = self.get_object()

        serializer = PatientQuestionnaireUpdateSerializer(
            instance,
            data=request.data,
            partial=partial,
        )

        serializer.is_valid(raise_exception=True)
        questionnaire = serializer.save()

        response_serializer = PatientQuestionnaireSerializer(
            questionnaire
        )

        return Response(
            response_serializer.data,
            status=status.HTTP_200_OK,
        )
    
@extend_schema(
    tags=["환자앱-복약"],
    summary="환자 복약 일정 조회",
    description="현재 환자의 복약 일정과 처방 약물 정보를 조회합니다.",
)
class PatientMedicationScheduleListAPIView(ListAPIView):
    serializer_class = MedicationScheduleSerializer

    def get_queryset(self):
        # TODO: 로그인 구현 후 request.user 기반 환자로 변경
        patient = Patient.objects.first()

        if patient is None:
            return MedicationSchedule.objects.none()

        patient_account = (
            PatientAccount.objects
            .filter(
                patient=patient,
                link_status="LINKED",
            )
            .first()
        )

        if patient_account is None:
            return MedicationSchedule.objects.none()

        return (
            MedicationSchedule.objects
            .filter(
                patient_account=patient_account,
                enabled=True,
            )
            .select_related("prescription")
            .prefetch_related(
                "items__prescription_item__drug"
            )
            .order_by("reminder_time")
        )
        
@extend_schema(
    tags=["환자앱-복약"],
    summary="복약 완료 처리",
    description="환자가 복용 완료 버튼을 누르면 해당 복약 일정을 TAKEN 상태로 기록합니다.",
    request=MedicationIntakeTakenSerializer,
)

@extend_schema(
    tags=["환자앱-복약"],
    summary="환자 복약 기록 조회",
    description=(
        "현재 환자의 복약 기록을 최신순으로 조회합니다. "
        "date=YYYY-MM-DD를 전달하면 한국 날짜 기준으로 필터링합니다."
    ),
)
class PatientMedicationIntakeLogListAPIView(ListAPIView):
    serializer_class = MedicationIntakeLogSerializer

    def get_queryset(self):
        # TODO: 환자 로그인 구현 후 request.user 기반 환자로 변경
        patient = Patient.objects.first()

        if patient is None:
            return MedicationIntakeLog.objects.none()

        patient_account = (
            PatientAccount.objects
            .filter(
                patient=patient,
                link_status="LINKED",
            )
            .first()
        )

        if patient_account is None:
            return MedicationIntakeLog.objects.none()

        queryset = (
            MedicationIntakeLog.objects
            .filter(
                medication_schedule__patient_account=patient_account,
            )
            .select_related(
                "medication_schedule",
            )
            .prefetch_related(
                "medication_schedule__items__prescription_item__drug",
            )
            .order_by("-scheduled_at")
        )

        date_value = self.request.query_params.get("date")

        if date_value:
            try:
                selected_date = datetime.strptime(
                    date_value,
                    "%Y-%m-%d",
                ).date()
            except ValueError as error:
                raise ValidationError(
                    {
                        "date": (
                            "날짜 형식은 YYYY-MM-DD여야 합니다."
                        ),
                    }
                ) from error

            korea_timezone = ZoneInfo("Asia/Seoul")

            start_at = datetime.combine(
                selected_date,
                time.min,
                tzinfo=korea_timezone,
            )

            end_at = start_at + timedelta(days=1)

            queryset = queryset.filter(
                scheduled_at__gte=start_at,
                scheduled_at__lt=end_at,
            )

        return queryset
    
class PatientMedicationIntakeTakenAPIView(APIView):
    def post(self, request):
        serializer = MedicationIntakeTakenSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        medication_schedule_id = serializer.validated_data[
            "medication_schedule_id"
        ]
        scheduled_at = serializer.validated_data[
            "scheduled_at"
        ]

        # TODO: 로그인 구현 후 request.user 기반 환자로 변경
        patient = Patient.objects.first()

        if patient is None:
            return Response(
                {"detail": "환자 정보를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        patient_account = (
            PatientAccount.objects
            .filter(
                patient=patient,
                link_status="LINKED",
            )
            .first()
        )

        if patient_account is None:
            return Response(
                {"detail": "연결된 환자 계정을 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            medication_schedule = MedicationSchedule.objects.get(
                id=medication_schedule_id,
                patient_account=patient_account,
                enabled=True,
            )
        except MedicationSchedule.DoesNotExist:
            return Response(
                {"detail": "복약 일정을 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        intake_log, created = MedicationIntakeLog.objects.get_or_create(
            medication_schedule=medication_schedule,
            scheduled_at=scheduled_at,
            defaults={
                "status": MedicationIntakeLog.Status.TAKEN,
                "taken_at": timezone.now(),
            },
        )

        if not created:
            intake_log.status = MedicationIntakeLog.Status.TAKEN
            intake_log.taken_at = timezone.now()
            intake_log.save(
                update_fields=[
                    "status",
                    "taken_at",
                    "updated_at",
                ]
            )

        return Response(
            {
                "id": str(intake_log.id),
                "medication_schedule_id": str(
                    intake_log.medication_schedule_id
                ),
                "scheduled_at": intake_log.scheduled_at,
                "taken_at": intake_log.taken_at,
                "status": intake_log.status,
            },
            status=status.HTTP_200_OK,
        )
        
@extend_schema(
    tags=["환자앱-증상"],
    summary="환자 증상 기록 조회/등록",
    description="현재 환자의 증상 기록을 조회하거나 새 증상 기록을 등록합니다.",
)
def calculate_symptom_risk(symptom_type, severity):
    if severity >= 8:
        return SymptomLog.RiskLevel.RED

    if symptom_type in ["객혈", "호흡곤란", "흉통"]:
        if severity >= 5:
            return SymptomLog.RiskLevel.RED

        return SymptomLog.RiskLevel.YELLOW

    if severity >= 4:
        return SymptomLog.RiskLevel.YELLOW

    return SymptomLog.RiskLevel.GREEN


KOREA_TIME_ZONE = ZoneInfo("Asia/Seoul")


def _korea_day_window(recorded_at):
    korea_recorded_at = timezone.localtime(
        recorded_at,
        KOREA_TIME_ZONE,
    )
    record_date = korea_recorded_at.date()
    day_start = datetime.combine(
        record_date,
        time.min,
        tzinfo=KOREA_TIME_ZONE,
    )
    return record_date, day_start, day_start + timedelta(days=1)


def _symptom_type_with_object_particle(symptom_type):
    if not symptom_type:
        return symptom_type

    last_character_code = ord(symptom_type[-1]) - 0xAC00
    if 0 <= last_character_code <= 11171:
        particle = "을" if last_character_code % 28 else "를"
    else:
        particle = "을(를)"

    return f"{symptom_type}{particle}"


class DailySymptomDuplicate(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "daily_symptom_duplicate"

    def __init__(self, symptom_type, record_date, existing_record_id):
        detail = {
            "code": self.default_code,
            "detail": (
                f"오늘 이미 {_symptom_type_with_object_particle(symptom_type)} "
                "기록했어요."
            ),
            "symptom_type": symptom_type,
            "record_date": record_date.isoformat(),
            "existing_record_id": str(existing_record_id),
        }
        super().__init__(detail=detail, code=self.default_code)


class PatientSymptomLogListCreateAPIView(ListCreateAPIView):
    serializer_class = SymptomLogSerializer

    def get_queryset(self):
        # 로컬 개발용 임시 연결.
        # TODO(patient-auth): 환자 로그인 구현 후 request.user의 PatientAccount로
        # 환자를 식별하고, 비로그인 401/의료진 403/타 환자 접근 차단을 적용해야 한다.
        patient = Patient.objects.first()

        if patient is None:
            return SymptomLog.objects.none()

        return (
            SymptomLog.objects
            .filter(patient=patient)
            .order_by("-logged_at")
        )

    def perform_create(self, serializer):
        # TODO(patient-auth): 환자 로그인 구현 후 request.user의 PatientAccount로
        # 환자를 식별하고, 비로그인 401/의료진 403/타 환자 접근 차단을 적용해야 한다.
        patient = Patient.objects.first()

        recorded_at = timezone.now()
        record_date, day_start, day_end = _korea_day_window(
            recorded_at,
        )

        symptom_type = serializer.validated_data["symptom_type"]
        existing_record = (
            SymptomLog.objects
            .filter(
                patient=patient,
                symptom_type=symptom_type,
                logged_at__gte=day_start,
                logged_at__lt=day_end,
            )
            .order_by("-logged_at", "-created_at")
            .first()
        )

        if existing_record is not None:
            raise DailySymptomDuplicate(
                symptom_type=symptom_type,
                record_date=record_date,
                existing_record_id=existing_record.id,
            )

        case = None

        if patient is not None:
            case = (
                patient.cases
                .filter(case_status="ACTIVE")
                .order_by("-created_at")
                .first()
            )

        severity = serializer.validated_data["severity"]

        risk_level = calculate_symptom_risk(
            symptom_type=symptom_type,
            severity=severity,
        )

        serializer.save(
            patient=patient,
            case=case,
            risk_level=risk_level,
            logged_at=recorded_at,
        )
        
@extend_schema(
    tags=["환자앱-예약"],
    summary="환자 예약 취소 요청",
    description="환자가 예약 취소를 요청합니다. 즉시 취소되지는 않으며, 원무과 확인 후 최종 취소됩니다.",
    request=PatientAppointmentCancelRequestSerializer,
    responses=AppointmentSerializer,
)
class PatientAppointmentCancelRequestAPIView(APIView):

    @transaction.atomic
    def post(self, request, appointment_id):
        serializer = PatientAppointmentCancelRequestSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        # TODO: 로그인 구현 후 request.user 기반 환자로 변경
        patient = Patient.objects.first()

        if patient is None:
            return Response(
                {"detail": "환자 정보를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        patient_account = (
            PatientAccount.objects
            .filter(
                patient=patient,
                link_status="LINKED",
            )
            .first()
        )

        if patient_account is None:
            return Response(
                {"detail": "연결된 환자 계정을 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            appointment = Appointment.objects.get(
                id=appointment_id,
                patient=patient,
            )
        except Appointment.DoesNotExist:
            return Response(
                {"detail": "예약 정보를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if (
            appointment.appointment_status
            == Appointment.AppointmentStatus.CANCELLED
        ):
            return Response(
                {"detail": "이미 취소된 예약입니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            appointment.cancellation_requested_at is not None
            or appointment.cancellation_requested_by_patient_account_id
            is not None
        ):
            return Response(
                {"detail": "이미 취소 요청된 예약입니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        appointment.cancellation_requested_by_patient_account = (
            patient_account
        )
        appointment.cancellation_requested_at = timezone.now()

        appointment.save(
            update_fields=[
                "cancellation_requested_by_patient_account",
                "cancellation_requested_at",
                "updated_at",
            ]
        )

        return Response(
            AppointmentSerializer(appointment).data,
            status=status.HTTP_200_OK,
        )
        

@extend_schema(
    tags=["환자앱-예약"],
    summary="환자 예약 변경 요청",
    description=(
        "환자가 기존 예약의 변경을 요청합니다. "
        "새 예약은 REQUESTED 상태로 생성되고, "
        "기존 예약은 취소 요청 상태로 기록됩니다."
    ),
    request=PatientAppointmentChangeRequestSerializer,
    responses=AppointmentSerializer,
)
class PatientAppointmentChangeRequestAPIView(APIView):

    @transaction.atomic
    def post(self, request, appointment_id):
        serializer = PatientAppointmentChangeRequestSerializer(
            data=request.data
        )
        serializer.is_valid(raise_exception=True)

        # TODO: 로그인 구현 후 request.user 기반 환자로 변경
        patient = Patient.objects.first()

        if patient is None:
            return Response(
                {"detail": "환자 정보를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        patient_account = (
            PatientAccount.objects
            .filter(
                patient=patient,
                link_status="LINKED",
            )
            .first()
        )

        if patient_account is None:
            return Response(
                {"detail": "연결된 환자 계정을 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            old_appointment = (
                Appointment.objects
                .select_for_update()
                .get(
                    id=appointment_id,
                    patient=patient,
                )
            )
        except Appointment.DoesNotExist:
            return Response(
                {"detail": "기존 예약 정보를 찾을 수 없습니다."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if (
            old_appointment.appointment_status
            == Appointment.AppointmentStatus.CANCELLED
        ):
            return Response(
                {"detail": "이미 취소된 예약은 변경할 수 없습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            old_appointment.cancellation_requested_at is not None
            or old_appointment.cancellation_requested_by_patient_account is not None
        ):
            return Response(
                {"detail": "이미 취소 요청된 예약은 변경할 수 없습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        if (
            old_appointment.visit_status
            != Appointment.VisitStatus.SCHEDULED
        ):
            return Response(
                {"detail": "방문 예정 상태의 예약만 변경할 수 있습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_scheduled_at = serializer.validated_data[
            "new_scheduled_at"
        ]
        
        if new_scheduled_at == old_appointment.scheduled_at:
            return Response(
                {"detail": "기존 예약 시간과 동일한 시간으로는 변경할 수 없습니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        doctor = old_appointment.doctor

        doctor_id = serializer.validated_data.get("doctor_id")
        if doctor_id is not None:
            try:
                doctor = User.objects.get(
                    id=doctor_id,
                    department_role__role="DOCTOR",
                )
            except User.DoesNotExist:
                return Response(
                    {
                        "doctor_id":
                            "해당 의사를 찾을 수 없습니다."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
                
        if doctor is not None:
            doctor_duplicate_exists = Appointment.objects.filter(
                doctor=doctor,
                scheduled_at=new_scheduled_at,
                appointment_status__in=[
                    Appointment.AppointmentStatus.REQUESTED,
                    Appointment.AppointmentStatus.CONFIRMED,
                ],
            ).exists()

            if doctor_duplicate_exists:
                return Response(
                    {"detail": "해당 의료진의 같은 시간에 이미 예약이 존재합니다."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        duplicate_exists = Appointment.objects.filter(
            patient=patient,
            scheduled_at=new_scheduled_at,
            appointment_status__in=[
                Appointment.AppointmentStatus.REQUESTED,
                Appointment.AppointmentStatus.CONFIRMED,
            ],
        ).exists()

        if duplicate_exists:
            return Response(
                {"detail": "같은 시간에 이미 예약이 존재합니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_appointment = Appointment.objects.create(
            patient=patient,
            doctor=doctor,
            scheduled_at=new_scheduled_at,
            appointment_status=Appointment.AppointmentStatus.REQUESTED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.PATIENT,
            created_by_patient_account=patient_account,
        )

        old_appointment.cancellation_requested_by_patient_account = (
            patient_account
        )
        old_appointment.cancellation_requested_at = timezone.now()

        old_appointment.save(
            update_fields=[
                "cancellation_requested_by_patient_account",
                "cancellation_requested_at",
                "updated_at",
            ]
        )

        return Response(
            AppointmentSerializer(new_appointment).data,
            status=status.HTTP_201_CREATED,
        )
