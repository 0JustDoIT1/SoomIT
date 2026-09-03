import hashlib

from rest_framework import serializers

from .models import Patient, PatientAccount, SocialAccount, Appointment


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