from datetime import timedelta
from hashlib import sha256

from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Hospital
from apps.patients.models import Appointment, AppointmentRequest, Patient, PatientAccount


PATIENTS = [
    ("PTTEST001", "예약변경테스트1", "01011110001", "CHANGE", "오전 예약을 오후로 변경 희망"),
    ("PTTEST002", "예약변경테스트2", "01011110002", "CHANGE", "다른 날짜로 변경 희망"),
    ("PTTEST003", "예약변경테스트3", "01011110003", "CHANGE", "진료 일정으로 하루 연기 희망"),
    ("PTTEST004", "예약취소테스트1", "01011110004", "CANCEL", "개인 일정"),
    ("PTTEST005", "예약취소테스트2", "01011110005", "CANCEL", "방문 어려움"),
]


def phone_hash(phone_number):
    return sha256(phone_number.encode("utf-8")).hexdigest()


@transaction.atomic
def seed():
    hospital = Hospital.objects.first()
    if hospital is None:
        raise RuntimeError("Hospital 데이터가 없습니다.")

    created = []
    base_time = timezone.now().replace(second=0, microsecond=0)

    for index, (code, name, phone, request_type, reason) in enumerate(PATIENTS, start=1):
        if Patient.objects.filter(patient_code=code).exists():
            print(f"SKIP {code}: 이미 존재합니다.")
            continue

        patient = Patient.objects.create(
            hospital=hospital,
            patient_code=code,
            name=name,
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number=phone,
            phone_number_hash=phone_hash(phone),
            address="테스트시 가상주소",
        )

        patient_account = PatientAccount.objects.create(
            patient=patient,
            phone_number=phone,
            phone_number_hash=phone_hash(phone),
            phone_verified_at=base_time,
            link_status=PatientAccount.LinkStatus.LINKED,
            linked_at=base_time,
        )

        original_scheduled_at = base_time + timedelta(days=10 + index, hours=8 + index)
        appointment = Appointment.objects.create(
            patient=patient,
            scheduled_at=original_scheduled_at,
            appointment_status=Appointment.AppointmentStatus.CONFIRMED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.PATIENT,
        )

        requested_scheduled_at = (
            original_scheduled_at + timedelta(days=1, hours=4)
            if request_type == AppointmentRequest.RequestType.CHANGE
            else None
        )
        appointment_request = AppointmentRequest.objects.create(
            appointment=appointment,
            request_type=request_type,
            status=AppointmentRequest.Status.PENDING,
            original_scheduled_at=original_scheduled_at,
            requested_scheduled_at=requested_scheduled_at,
            reason=reason,
            requested_by_patient_account=patient_account,
        )
        created.append((patient, appointment, appointment_request))

    print(f"created={len(created)}")
    for patient, appointment, appointment_request in created:
        print(
            patient.patient_code,
            appointment.id,
            appointment_request.id,
            appointment_request.request_type,
            appointment_request.status,
        )


seed()
