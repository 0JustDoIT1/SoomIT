from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Hospital
from apps.patients.models import Appointment, Patient, PatientAccount


class AppointmentNotificationSignalTests(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(
            name="예약 알림 테스트 병원",
            code="APPT-NOTIFY-TEST",
        )
        self.patient = Patient.objects.create(
            hospital=hospital,
            patient_code="APPTNOTIFY001",
            name="예약 알림 테스트 환자",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01000000000",
            phone_number_hash="appt-notify-phone",
        )
        self.account = PatientAccount.objects.create(
            patient=self.patient,
            phone_number="01000000000",
            phone_number_hash="appt-notify-account",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.LINKED,
        )

    def _appointment(self, status):
        return Appointment.objects.create(
            patient=self.patient,
            scheduled_at=timezone.now() + timedelta(days=2),
            appointment_status=status,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.PATIENT,
            created_by_patient_account=self.account,
        )

    @patch("apps.notifications.signals.send_patient_push")
    def test_confirmed_notification(self, mocked_push):
        appointment = self._appointment(
            Appointment.AppointmentStatus.REQUESTED
        )

        with self.captureOnCommitCallbacks(execute=True):
            appointment.appointment_status = (
                Appointment.AppointmentStatus.CONFIRMED
            )
            appointment.save()

        mocked_push.assert_called_once()

        with self.captureOnCommitCallbacks(execute=True):
            appointment.save()

        mocked_push.assert_called_once()

    @patch("apps.notifications.signals.send_patient_push")
    def test_changed_notification(self, mocked_push):
        appointment = self._appointment(
            Appointment.AppointmentStatus.CONFIRMED
        )

        with self.captureOnCommitCallbacks(execute=True):
            appointment.scheduled_at += timedelta(days=1)
            appointment.save()

        mocked_push.assert_called_once()

    @patch("apps.notifications.signals.send_patient_push")
    def test_cancelled_notification(self, mocked_push):
        appointment = self._appointment(
            Appointment.AppointmentStatus.CONFIRMED
        )

        with self.captureOnCommitCallbacks(execute=True):
            appointment.appointment_status = (
                Appointment.AppointmentStatus.CANCELLED
            )
            appointment.save()

        mocked_push.assert_called_once()
