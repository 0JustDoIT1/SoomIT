import hashlib
from apps.notifications.models import NotificationLog
from apps.notifications.models import PatientNotificationSetting
from django.utils import timezone

from rest_framework import serializers

from .models import (
    Appointment,
    CurrentMedication,
    LabResult,
    MedicationIntakeLog,
    MedicationSchedule,
    MedicationScheduleItem,
    Patient,
    PatientAccount,
    PatientQuestionnaire,
    SocialAccount,
    SymptomLog,
)


# ─────────────────────────────────────────────
# Flutter용
# 기존 Flutter serializer가 추가되면 이 아래에 유지
# ─────────────────────────────────────────────
class AppointmentSerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()
    hospital_name = serializers.SerializerMethodField()
    exam_type = serializers.SerializerMethodField()
    display_type = serializers.SerializerMethodField()

    appointment_status_label = serializers.CharField(
        source="get_appointment_status_display",
        read_only=True,
    )

    visit_status_label = serializers.CharField(
        source="get_visit_status_display",
        read_only=True,
    )

    class Meta:
        model = Appointment
        fields = [
            "id",
            "scheduled_at",

            "appointment_status",
            "appointment_status_label",

            "visit_status",
            "visit_status_label",

            "created_by_type",

            "doctor",
            "doctor_name",

            "hospital_name",

            "exam_type",
            "display_type",
        ]

    # 담당 의사 이름
    def get_doctor_name(self, obj):
        if obj.doctor is None:
            return None

        return obj.doctor.name

    # 환자 소속 병원명
    def get_hospital_name(self, obj):
        if obj.patient is None:
            return None

        if obj.patient.hospital is None:
            return None

        return obj.patient.hospital.name

    # 검사 예약일 경우 검사 종류
    def get_exam_type(self, obj):
        if obj.examination_order is None:
            return None

        return obj.examination_order.exam_type

    # Flutter 화면 표시용 예약 종류
    def get_display_type(self, obj):
        # 검사 오더와 연결된 예약
        if obj.examination_order is not None:
            exam_type = obj.examination_order.exam_type

            exam_labels = {
                "XRAY": "X-ray 검사",
                "CT": "CT 검사",
                "WSI": "병리 검사",
            }

            return exam_labels.get(
                exam_type,
                f"{exam_type} 검사",
            )

        # examination_order가 없으면 일반 외래 예약
        return "외래 진료"
    
   
# ─────────────────────────────────────────────    
# 환자 검사 일정 조회
# ─────────────────────────────────────────────
class ExaminationScheduleSerializer(serializers.ModelSerializer):
    exam_type = serializers.SerializerMethodField()
    exam_name = serializers.SerializerMethodField()

    appointment_status_label = serializers.CharField(
        source="get_appointment_status_display",
        read_only=True,
    )

    visit_status_label = serializers.CharField(
        source="get_visit_status_display",
        read_only=True,
    )

    hospital_name = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    preparation_guide = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            "id",
            "scheduled_at",

            "exam_type",
            "exam_name",

            "appointment_status",
            "appointment_status_label",

            "visit_status",
            "visit_status_label",

            "hospital_name",
            "doctor_name",

            "preparation_guide",
        ]

    def get_exam_type(self, obj):
        if obj.examination_order is None:
            return None

        return obj.examination_order.exam_type

    def get_exam_name(self, obj):
        if obj.examination_order is None:
            return "검사"

        exam_names = {
            "XRAY": "흉부 X-ray 검사",
            "CT": "흉부 CT 검사",
            "WSI": "병리 검사",
        }

        return exam_names.get(
            obj.examination_order.exam_type,
            obj.examination_order.exam_type,
        )

    def get_hospital_name(self, obj):
        if obj.patient and obj.patient.hospital:
            return obj.patient.hospital.name

        return None

    def get_doctor_name(self, obj):
        if obj.doctor:
            return obj.doctor.name

        return None

    def get_preparation_guide(self, obj):
        if obj.examination_order is None:
            return None

        exam_type = obj.examination_order.exam_type

        guides = {
            "XRAY": "검사 전 별도의 준비사항은 없습니다.",
            "CT": "검사 전 안내받은 금식 및 조영제 관련 주의사항을 확인해주세요.",
            "WSI": "검사 관련 안내사항은 담당 의료진의 설명을 따라주세요.",
        }

        return guides.get(
            exam_type,
            "검사 전 안내사항을 확인해주세요.",
        )


# ─────────────────────────────────────────────
# - 환자 프로필 조회
# 홈 / 마이페이지 공용
# ─────────────────────────────────────────────
class PatientProfileSerializer(serializers.ModelSerializer):
    hospital_name = serializers.SerializerMethodField()
    sex_label = serializers.CharField(
        source="get_sex_display",
        read_only=True,
    )
    app_link_status = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "patient_code",
            "name",
            "birth_date",
            "sex",
            "sex_label",
            "phone_number",
            "address",
            "hospital_name",
            "app_link_status",
        ]

        read_only_fields = [
            "id",
            "patient_code",
            "name",
            "birth_date",
            "sex",
            "sex_label",
            "address",
            "hospital_name",
            "app_link_status",
        ]

    def get_hospital_name(self, obj):
        if obj.hospital:
            return obj.hospital.name
        return None

    def get_app_link_status(self, obj):
        patient_account = obj.accounts.first()

        if patient_account is None:
            return "UNLINKED"

        return patient_account.link_status


# ─────────────────────────────────────────────
# 환자 앱 알림 조회
# ─────────────────────────────────────────────
class PatientNotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = NotificationLog
        fields = [
            "id",
            "notification_type",
            "channel",
            "title",
            "message",
            "payload",
            "delivery_status",
            "sent_at",
            "read_at",
            "is_read",
            "created_at",
        ]

    def get_is_read(self, obj):
        return obj.read_at is not None

class PatientNotificationSettingSerializer(serializers.ModelSerializer):
    notification_type_label = serializers.CharField(
        source="get_notification_type_display",
        read_only=True,
    )

    class Meta:
        model = PatientNotificationSetting
        fields = [
            "notification_type",
            "notification_type_label",
            "enabled",
            "updated_at",
        ]
        read_only_fields = [
            "notification_type",
            "notification_type_label",
            "updated_at",
        ]
        
# ─────────────────────────────────────────────
# 환자 앱 - 문진표 작성 내역
# ─────────────────────────────────────────────
class PatientQuestionnaireSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientQuestionnaire
        fields = [
            "id",
            "questionnaire_type",
            "questionnaire_version",
            "responses",
            "is_completed",
            "completed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields    

# ─────────────────────────────────────────────
# - 증상 기록
# ─────────────────────────────────────────────
class SymptomLogSerializer(serializers.ModelSerializer):
    risk_level_label = serializers.CharField(
        source="get_risk_level_display",
        read_only=True,
    )

    class Meta:
        model = SymptomLog
        fields = [
            "id",
            "symptom_type",
            "symptom_description",
            "severity",
            "risk_level",
            "risk_level_label",
            "logged_at",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "risk_level",
            "risk_level_label",
            "created_at",
            "updated_at",
        ]

    def validate_severity(self, value):
        if value < 0 or value > 10:
            raise serializers.ValidationError(
                "심각도는 0에서 10 사이의 값이어야 합니다."
            )
        return value

##################################################################################################################
# ─────────────────────────────────────────────
# 원무과(coordinator) - 환자 목록 조회용
# ─────────────────────────────────────────────
class PatientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = [
            "id",
            "patient_code",
            "name",
            "birth_date",
            "sex",
            "phone_number",
            "address",
            "created_at",
            "updated_at",
        ]


# ─────────────────────────────────────────────
# 원무과(coordinator) - 환자 상세 조회용
# ─────────────────────────────────────────────
class PatientDetailSerializer(serializers.ModelSerializer):
    app_link_status = serializers.SerializerMethodField()
    current_case = serializers.SerializerMethodField()
    recent_appointment = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "patient_code",
            "name",
            "birth_date",
            "sex",
            "phone_number",
            "address",
            "created_at",
            "updated_at",

            # 상세 조회 전용
            "app_link_status",
            "current_case",
            "recent_appointment",
        ]

    # 환자 앱 계정 연결 상태
    def get_app_link_status(self, obj):
        patient_account = obj.accounts.first()

        if patient_account is None:
            return "UNLINKED"

        return patient_account.link_status

    # 현재 진행 중인 Lung Cancer Case
    def get_current_case(self, obj):
        current_case = (
            obj.cases
            .filter(case_status="ACTIVE")
            .order_by("-created_at")
            .first()
        )

        if current_case is None:
            return None

        return {
            "id": str(current_case.id),
            "case_code": current_case.case_code,
            "current_stage": current_case.current_stage,
            "case_status": current_case.case_status,
        }

    # 가장 최근 예약
    def get_recent_appointment(self, obj):
        appointment = (
            obj.appointments
            .order_by("-scheduled_at")
            .first()
        )

        if appointment is None:
            return None

        return {
            "id": str(appointment.id),
            "scheduled_at": appointment.scheduled_at,
            "appointment_status": appointment.appointment_status,
            "visit_status": appointment.visit_status,
            "created_by_type": appointment.created_by_type,
        }


# ─────────────────────────────────────────────
# 원무과(coordinator) - 신규 환자 등록용
# ─────────────────────────────────────────────
class PatientCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = [
            "patient_code",
            "name",
            "birth_date",
            "sex",
            "phone_number",
            "address",
        ]


# ─────────────────────────────────────────────
# 원무과(coordinator) - 환자정보 수정용
# ─────────────────────────────────────────────
class PatientUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = [
            "name",
            "birth_date",
            "sex",
            "phone_number",
            "address",
        ]

    def update(self, instance, validated_data):
        # 연락처가 수정된 경우 phone_number_hash도 함께 갱신
        if "phone_number" in validated_data:
            phone_number = validated_data["phone_number"]

            normalized_phone = "".join(
                char for char in phone_number if char.isdigit()
            )

            instance.phone_number_hash = hashlib.sha256(
                normalized_phone.encode("utf-8")
            ).hexdigest()

        instance.name = validated_data.get(
            "name",
            instance.name,
        )

        instance.birth_date = validated_data.get(
            "birth_date",
            instance.birth_date,
        )

        instance.sex = validated_data.get(
            "sex",
            instance.sex,
        )

        instance.phone_number = validated_data.get(
            "phone_number",
            instance.phone_number,
        )

        instance.address = validated_data.get(
            "address",
            instance.address,
        )

        instance.save()

        return instance


# ─────────────────────────────────────────────
# 호흡기내과 - 현재 복용약
# ─────────────────────────────────────────────
class CurrentMedicationSerializer(serializers.ModelSerializer):
    drug_name = serializers.CharField(
        source="drug.drug_name",
        read_only=True,
    )

    class Meta:
        model = CurrentMedication
        fields = [
            "id",
            "drug",
            "drug_name",
            "medication_name",
            "ingredient_name",
            "dose",
            "dose_unit",
            "frequency",
            "route",
            "started_at",
            "ended_at",
            "is_active",
            "note",
            "recorded_by_user",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "recorded_by_user",
        ]


# ─────────────────────────────────────────────
# 호흡기내과 - 검사실 수치
# ─────────────────────────────────────────────
class LabResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabResult
        fields = [
            "id",
            "creatinine",
            "egfr",
            "ast",
            "alt",
            "total_bilirubin",
            "tested_at",
            "note",
            "recorded_by_user",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "recorded_by_user",
        ]
    
# ─────────────────────────────────────────────
# 문진표 작성 / 제출
# ─────────────────────────────────────────────
class PatientQuestionnaireCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientQuestionnaire
        fields = [
            "questionnaire_type",
            "questionnaire_version",
            "responses",
        ]

    def create(self, validated_data):
        patient = self.context["patient"]

        return PatientQuestionnaire.objects.create(
            patient=patient,
            questionnaire_type=validated_data["questionnaire_type"],
            questionnaire_version=validated_data["questionnaire_version"],
            responses=validated_data.get("responses", {}),
            is_completed=True,
            completed_at=timezone.now(),
        )
        
        
class MedicationScheduleItemSerializer(serializers.ModelSerializer):
    drug_name = serializers.CharField(
        source="prescription_item.drug.drug_name",
        read_only=True,
    )
    ingredient_name = serializers.CharField(
        source="prescription_item.drug.ingredient_name",
        read_only=True,
    )
    dose = serializers.DecimalField(
        source="prescription_item.final_dose",
        max_digits=12,
        decimal_places=3,
        read_only=True,
    )
    unit = serializers.CharField(
        source="prescription_item.unit",
        read_only=True,
    )
    route = serializers.CharField(
        source="prescription_item.route",
        read_only=True,
    )
    frequency = serializers.CharField(
        source="prescription_item.frequency",
        read_only=True,
        allow_null=True,
    )
    instructions = serializers.CharField(
        source="prescription_item.instructions",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = MedicationScheduleItem
        fields = [
            "id",
            "drug_name",
            "ingredient_name",
            "dose",
            "unit",
            "route",
            "frequency",
            "instructions",
        ]


class MedicationScheduleSerializer(serializers.ModelSerializer):
    items = MedicationScheduleItemSerializer(
        many=True,
        read_only=True,
    )

    today_status = serializers.SerializerMethodField()

    class Meta:
        model = MedicationSchedule
        fields = [
            "id",
            "reminder_time",
            "enabled",
            "today_status",
            "items",
            "created_at",
            "updated_at",
        ]

    def get_today_status(self, obj):
        today = timezone.localdate()

        log = (
            obj.intake_logs
            .filter(
                scheduled_at__date=today,
            )
            .order_by("-scheduled_at")
            .first()
        )

        if log is None:
            return "PENDING"

        return log.status

class MedicationIntakeTakenSerializer(serializers.Serializer):
    medication_schedule_id = serializers.UUIDField()
    scheduled_at = serializers.DateTimeField()
