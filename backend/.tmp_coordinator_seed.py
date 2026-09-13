from datetime import datetime, time, timedelta
from hashlib import sha256

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Hospital, DepartmentRole, User
from apps.patients.models import Patient, Appointment
from apps.cases.models import LungCancerCase, ExaminationOrder


PREFIX = "CO-PT-"
CASE_PREFIX = "CO-CASE-"

DOCTORS = [
    ("coorddoc01", "김도윤"),
    ("coorddoc02", "이지은"),
    ("coorddoc03", "박서현"),
    ("coorddoc04", "정민호"),
    ("coorddoc05", "한서윤"),
]

PATIENTS = [
    {
        "code": "CO-PT-0001",
        "name": "김가상",
        "birth_date": "1987-03-12",
        "sex": "FEMALE",
        "doctor": 1,
        "status": "REQUESTED",
        "day": 0,
        "hour": 9,
        "minute": 0,
        "exam": None,
    },
    {
        "code": "CO-PT-0002",
        "name": "박샘플",
        "birth_date": "1978-11-04",
        "sex": "MALE",
        "doctor": 0,
        "status": "CONFIRMED",
        "day": 0,
        "hour": 9,
        "minute": 30,
        "exam": None,
    },
    {
        "code": "CO-PT-0003",
        "name": "이예시",
        "birth_date": "1969-06-18",
        "sex": "FEMALE",
        "doctor": 3,
        "status": "CONFIRMED",
        "day": 0,
        "hour": 10,
        "minute": 0,
        "exam": "CT",
    },
    {
        "code": "CO-PT-0004",
        "name": "최테스트",
        "birth_date": "1958-01-22",
        "sex": "MALE",
        "doctor": 4,
        "status": "CONFIRMED",
        "day": 0,
        "hour": 10,
        "minute": 30,
        "exam": "XRAY",
    },
    {
        "code": "CO-PT-0005",
        "name": "정가상",
        "birth_date": "1991-09-08",
        "sex": "FEMALE",
        "doctor": 2,
        "status": "REQUESTED",
        "day": 0,
        "hour": 11,
        "minute": 0,
        "exam": None,
    },
    {
        "code": "CO-PT-0006",
        "name": "한샘플",
        "birth_date": "1973-04-15",
        "sex": "MALE",
        "doctor": 0,
        "status": "CONFIRMED",
        "day": 0,
        "hour": 11,
        "minute": 30,
        "exam": "CT",
    },
    {
        "code": "CO-PT-0007",
        "name": "윤예시",
        "birth_date": "1982-12-29",
        "sex": "FEMALE",
        "doctor": 1,
        "status": "CONFIRMED",
        "day": 0,
        "hour": 13,
        "minute": 0,
        "exam": "XRAY",
    },
    {
        "code": "CO-PT-0008",
        "name": "서테스트",
        "birth_date": "1965-07-03",
        "sex": "MALE",
        "doctor": 3,
        "status": "CONFIRMED",
        "day": 0,
        "hour": 14,
        "minute": 0,
        "exam": "CT",
    },
    {
        "code": "CO-PT-0009",
        "name": "오가상",
        "birth_date": "1995-02-17",
        "sex": "FEMALE",
        "doctor": 4,
        "status": "CONFIRMED",
        "day": 0,
        "hour": 14,
        "minute": 30,
        "exam": None,
    },
    {
        "code": "CO-PT-0010",
        "name": "임샘플",
        "birth_date": "1976-08-24",
        "sex": "MALE",
        "doctor": 2,
        "status": "REQUESTED",
        "day": 0,
        "hour": 15,
        "minute": 0,
        "exam": None,
    },
    {
        "code": "CO-PT-0011",
        "name": "조예시",
        "birth_date": "1989-05-11",
        "sex": "FEMALE",
        "doctor": 0,
        "status": "CONFIRMED",
        "day": 1,
        "hour": 9,
        "minute": 30,
        "exam": "CT",
    },
    {
        "code": "CO-PT-0012",
        "name": "강테스트",
        "birth_date": "1962-10-07",
        "sex": "MALE",
        "doctor": 1,
        "status": "CONFIRMED",
        "day": 1,
        "hour": 10,
        "minute": 30,
        "exam": "XRAY",
    },
    {
        "code": "CO-PT-0013",
        "name": "신가상",
        "birth_date": "1984-03-26",
        "sex": "FEMALE",
        "doctor": 3,
        "status": "CONFIRMED",
        "day": 1,
        "hour": 13,
        "minute": 30,
        "exam": None,
    },
    {
        "code": "CO-PT-0014",
        "name": "문샘플",
        "birth_date": "1970-06-09",
        "sex": "MALE",
        "doctor": 4,
        "status": "REQUESTED",
        "day": 1,
        "hour": 14,
        "minute": 0,
        "exam": "CT",
    },
    {
        "code": "CO-PT-0015",
        "name": "배예시",
        "birth_date": "1993-12-14",
        "sex": "FEMALE",
        "doctor": 2,
        "status": "CONFIRMED",
        "day": 2,
        "hour": 10,
        "minute": 0,
        "exam": None,
    },
]


def phone_hash(phone_number: str) -> str:
    digits = "".join(ch for ch in phone_number if ch.isdigit())
    return sha256(digits.encode("utf-8")).hexdigest()


def make_datetime(day_offset: int, hour: int, minute: int):
    target_date = timezone.localdate() + timedelta(days=day_offset)

    naive = datetime.combine(
        target_date,
        time(hour=hour, minute=minute),
    )

    return timezone.make_aware(
        naive,
        timezone.get_current_timezone(),
    )


with transaction.atomic():

    # -------------------------------------------------
    # 1. 기존 원무과 전용 테스트 데이터만 삭제
    # -------------------------------------------------

    old_patients = Patient.objects.filter(
        patient_code__startswith=PREFIX
    )

    Appointment.objects.filter(
        patient__in=old_patients
    ).delete()

    ExaminationOrder.objects.filter(
        case__patient__in=old_patients
    ).delete()

    LungCancerCase.objects.filter(
        patient__in=old_patients
    ).delete()

    old_patients.delete()

    print("기존 CO-PT 테스트 데이터 정리 완료")


    # -------------------------------------------------
    # 2. 테스트 병원 찾기
    # -------------------------------------------------

    hospital = (
        Hospital.objects.filter(code="HOSPITAL-01").first()
        or Hospital.objects.first()
    )

    if hospital is None:
        raise RuntimeError(
            "Hospital 데이터가 없습니다."
        )

    print(
        f"사용 병원: {hospital.code}"
    )


    # -------------------------------------------------
    # 3. 호흡기내과 DOCTOR role 찾기
    # -------------------------------------------------

    doctor_role = (
        DepartmentRole.objects.filter(
            department__hospital=hospital,
            department__code__in=[
                "PULMONOLOGY",
                "RESP",
            ],
            role="DOCTOR",
        )
        .select_related("department")
        .first()
    )

    if doctor_role is None:
        raise RuntimeError(
            "호흡기내과 DOCTOR DepartmentRole을 찾지 못했습니다."
        )


    # -------------------------------------------------
    # 4. 호흡기내과 의사 5명 생성/재사용
    # -------------------------------------------------

    doctors = []

    for login_id, name in DOCTORS:

        doctor = User.objects.filter(
            login_id=login_id
        ).first()

        if doctor is None:
            doctor = User(
                login_id=login_id,
                name=name,
                account_status="ACTIVE",
                department_role=doctor_role,
            )

            doctor.set_password("test1234")
            doctor.save()

        else:
            doctor.name = name
            doctor.account_status = "ACTIVE"
            doctor.department_role = doctor_role
            doctor.save(
                update_fields=[
                    "name",
                    "account_status",
                    "department_role",
                ]
            )

        doctors.append(doctor)

    print(
        "호흡기내과 의사:",
        ", ".join(doctor.name for doctor in doctors),
    )


    # -------------------------------------------------
    # 5. 환자 15명 생성
    # -------------------------------------------------

    created_patients = []
    created_appointments = []
    created_cases = []
    created_orders = []

    for index, data in enumerate(PATIENTS, start=1):

        phone_number = (
            f"010-90{index:02d}-{1000 + index:04d}"
        )

        patient = Patient.objects.create(
            hospital=hospital,
            patient_code=data["code"],
            name=data["name"],
            birth_date=data["birth_date"],
            sex=data["sex"],
            phone_number=phone_number,
            phone_number_hash=phone_hash(
                phone_number
            ),
            address=f"대전광역시 테스트구 예시로 {index}",
        )

        doctor = doctors[data["doctor"]]

        appointment_time = make_datetime(
            data["day"],
            data["hour"],
            data["minute"],
        )

        case = None
        exam_order = None

        # ---------------------------------------------
        # 검사가 있는 환자만 검사 흐름 생성
        # ---------------------------------------------

        if data["exam"] is not None:

            case = LungCancerCase.objects.create(
                patient=patient,
                case_code=(
                    f"{CASE_PREFIX}{index:04d}"
                ),
                primary_doctor=doctor,
                current_stage=data["exam"],
                case_status="ACTIVE",
            )

            exam_order = ExaminationOrder.objects.create(
                case=case,
                exam_type=data["exam"],
                requesting_doctor=doctor,
                priority="NORMAL",
                purpose=(
                    f"{data['exam']} 추가 평가"
                ),
                clinical_note=(
                    "원무과 화면 테스트용 검사 오더"
                ),
                status="SCHEDULED",
            )

            created_cases.append(case)
            created_orders.append(exam_order)

        # ---------------------------------------------
        # 예약 생성
        # ---------------------------------------------

        appointment = Appointment.objects.create(
            patient=patient,
            case=case,
            examination_order=exam_order,
            doctor=doctor,
            scheduled_at=appointment_time,
            appointment_status=data["status"],

            # 화면에서는 방문상태 기능을 사용하지 않지만
            # 현재 DB 컬럼이 필수라 저장값만 넣습니다.
            visit_status="SCHEDULED",

            created_by_type=(
                "DOCTOR_ORDER"
                if exam_order is not None
                else "PATIENT"
            ),
        )

        created_patients.append(patient)
        created_appointments.append(
            appointment
        )

    print()
    print("===== 생성 결과 =====")
    print(
        f"환자: {len(created_patients)}명"
    )
    print(
        f"예약: {len(created_appointments)}건"
    )
    print(
        f"검사 흐름: {len(created_cases)}건"
    )
    print(
        f"검사 오더: {len(created_orders)}건"
    )

    print(
        "승인 대기:",
        Appointment.objects.filter(
            patient__patient_code__startswith=PREFIX,
            appointment_status="REQUESTED",
        ).count(),
    )

    print(
        "예약 확정:",
        Appointment.objects.filter(
            patient__patient_code__startswith=PREFIX,
            appointment_status="CONFIRMED",
        ).count(),
    )

    print()
    print(
        "원무과 예시 데이터 생성 완료"
    )
    