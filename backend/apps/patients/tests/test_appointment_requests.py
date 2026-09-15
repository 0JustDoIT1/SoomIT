from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Hospital, User
from apps.patients.models import Appointment, AppointmentRequest, Patient, PatientAccount


class AppointmentRequestAPITests(APITestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="예약 요청 테스트 병원", code="APPT-REQUEST-TEST")
        self.patient = Patient.objects.create(
            hospital=hospital,
            patient_code="APPTREQUEST001",
            name="예약 요청 테스트 환자",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01000000000",
            phone_number_hash="appointment-request-test-phone",
        )
        self.patient_account = PatientAccount.objects.create(
            patient=self.patient,
            phone_number="01000000000",
            phone_number_hash="appointment-request-account-phone",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.LINKED,
        )
        self.coordinator = User.objects.create_user(
            login_id="appointment-request-coordinator",
            password="test-password",
            name="원무과 테스트 사용자",
        )
        self.appointment = self._appointment()

    def _appointment(self, **overrides):
        values = {
            "patient": self.patient,
            "scheduled_at": timezone.now() + timedelta(days=2),
            "appointment_status": Appointment.AppointmentStatus.CONFIRMED,
            "visit_status": Appointment.VisitStatus.SCHEDULED,
            "created_by_type": Appointment.CreatedByType.PATIENT,
            "created_by_patient_account": self.patient_account,
        }
        values.update(overrides)
        return Appointment.objects.create(**values)

    def _change_request(self, appointment=None, scheduled_at=None):
        appointment = appointment or self.appointment
        scheduled_at = scheduled_at or timezone.now() + timedelta(days=5)
        return self.client.post(
            f"/api/patients/appointments/{appointment.id}/change-request/",
            {"new_scheduled_at": scheduled_at.isoformat(), "reason": "일정 변경 요청"},
            format="json",
        )

    def _cancel_request(self, appointment=None):
        appointment = appointment or self.appointment
        return self.client.post(
            f"/api/patients/appointments/{appointment.id}/cancel-request/",
            {"cancellation_reason": "예약 취소 요청"},
            format="json",
        )

    def test_cancel_request_creates_pending_history_without_cancelling_appointment(self):
        response = self._cancel_request()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        appointment_request = AppointmentRequest.objects.get()
        self.assertEqual(appointment_request.request_type, AppointmentRequest.RequestType.CANCEL)
        self.assertEqual(appointment_request.status, AppointmentRequest.Status.PENDING)
        self.assertEqual(appointment_request.original_scheduled_at, self.appointment.scheduled_at)
        self.assertIsNone(appointment_request.requested_scheduled_at)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.appointment_status, Appointment.AppointmentStatus.CONFIRMED)

    def test_change_request_creates_pending_history_without_creating_appointment(self):
        requested_scheduled_at = timezone.now() + timedelta(days=5)
        response = self._change_request(scheduled_at=requested_scheduled_at)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Appointment.objects.count(), 1)
        appointment_request = AppointmentRequest.objects.get()
        self.assertEqual(appointment_request.request_type, AppointmentRequest.RequestType.CHANGE)
        self.assertEqual(appointment_request.requested_scheduled_at, requested_scheduled_at)
        self.assertEqual(appointment_request.original_scheduled_at, self.appointment.scheduled_at)

    def test_pending_request_blocks_another_request_for_the_same_appointment(self):
        self.assertEqual(self._cancel_request().status_code, status.HTTP_201_CREATED)

        response = self._change_request()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AppointmentRequest.objects.count(), 1)

    def test_change_approval_updates_the_existing_appointment(self):
        requested_scheduled_at = timezone.now() + timedelta(days=5)
        self.assertEqual(self._change_request(scheduled_at=requested_scheduled_at).status_code, status.HTTP_201_CREATED)
        appointment_request = AppointmentRequest.objects.get()
        self.client.force_authenticate(self.coordinator)

        response = self.client.post(f"/api/appointments/requests/{appointment_request.id}/approve/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Appointment.objects.count(), 1)
        self.appointment.refresh_from_db()
        appointment_request.refresh_from_db()
        self.assertEqual(self.appointment.scheduled_at, requested_scheduled_at)
        self.assertEqual(appointment_request.status, AppointmentRequest.Status.APPROVED)
        self.assertEqual(appointment_request.processed_by_user, self.coordinator)
        self.assertIsNotNone(appointment_request.processed_at)

    def test_change_approval_rechecks_schedule_conflicts(self):
        requested_scheduled_at = timezone.now() + timedelta(days=5)
        self.assertEqual(self._change_request(scheduled_at=requested_scheduled_at).status_code, status.HTTP_201_CREATED)
        appointment_request = AppointmentRequest.objects.get()
        self._appointment(scheduled_at=requested_scheduled_at)
        self.client.force_authenticate(self.coordinator)

        response = self.client.post(f"/api/appointments/requests/{appointment_request.id}/approve/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.appointment.refresh_from_db()
        appointment_request.refresh_from_db()
        self.assertNotEqual(self.appointment.scheduled_at, requested_scheduled_at)
        self.assertEqual(appointment_request.status, AppointmentRequest.Status.PENDING)

    def test_cancel_approval_cancels_the_existing_appointment(self):
        self.assertEqual(self._cancel_request().status_code, status.HTTP_201_CREATED)
        appointment_request = AppointmentRequest.objects.get()
        self.client.force_authenticate(self.coordinator)

        response = self.client.post(f"/api/appointments/requests/{appointment_request.id}/approve/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.appointment.refresh_from_db()
        appointment_request.refresh_from_db()
        self.assertEqual(self.appointment.appointment_status, Appointment.AppointmentStatus.CANCELLED)
        self.assertEqual(self.appointment.cancellation_reason, "예약 취소 요청")
        self.assertEqual(self.appointment.cancelled_by_user, self.coordinator)
        self.assertEqual(appointment_request.status, AppointmentRequest.Status.APPROVED)

    def test_rejection_keeps_appointment_and_allows_a_new_request(self):
        self.assertEqual(self._cancel_request().status_code, status.HTTP_201_CREATED)
        appointment_request = AppointmentRequest.objects.get()
        original_scheduled_at = self.appointment.scheduled_at
        self.client.force_authenticate(self.coordinator)

        response = self.client.post(
            f"/api/appointments/requests/{appointment_request.id}/reject/",
            {"rejection_reason": "원무과 확인 필요"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.appointment.refresh_from_db()
        appointment_request.refresh_from_db()
        self.assertEqual(self.appointment.scheduled_at, original_scheduled_at)
        self.assertEqual(self.appointment.appointment_status, Appointment.AppointmentStatus.CONFIRMED)
        self.assertEqual(appointment_request.status, AppointmentRequest.Status.REJECTED)
        self.assertEqual(appointment_request.rejection_reason, "원무과 확인 필요")

        self.client.force_authenticate(user=None)
        self.assertEqual(self._change_request().status_code, status.HTTP_201_CREATED)
