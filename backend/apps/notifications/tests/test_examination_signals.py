from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Hospital, User
from apps.cases.models import ExaminationOrder, LungCancerCase
from apps.patients.models import Appointment, Patient, PatientAccount


class ExaminationNotificationSignalTests(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(
            name="검사 알림 테스트 병원",
            code="EXAM-NOTIFY-TEST",
        )
        self.doctor = User.objects.create_user(
            login_id="exam-notify-doctor",
            password="test-password",
            name="검사 알림 의료진",
        )
        self.patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="EXAMNOTIFY001",
            name="검사 알림 환자",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01000000000",
            phone_number_hash="exam-notify-phone",
        )
        self.account = PatientAccount.objects.create(
            patient=self.patient,
            phone_number="01000000000",
            phone_number_hash="exam-notify-account",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.LINKED,
        )
        self.case = LungCancerCase.objects.create(
            patient=self.patient,
            case_code="EXAM-NOTIFY-CASE",
            primary_doctor=self.doctor,
            current_stage="XRAY",
        )
        self.order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.XRAY,
            requesting_doctor=self.doctor,
            purpose="검사 알림 테스트",
            status=ExaminationOrder.Status.SCHEDULED,
        )

    def _create_appointment(self):
        return Appointment.objects.create(
            patient=self.patient,
            case=self.case,
            examination_order=self.order,
            doctor=self.doctor,
            scheduled_at=timezone.now() + timedelta(days=2),
            appointment_status=Appointment.AppointmentStatus.CONFIRMED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.DOCTOR_ORDER,
        )

    @patch("apps.notifications.signals.send_patient_push")
    def test_created_notification(self, mocked_push):
        with self.captureOnCommitCallbacks(execute=True):
            self._create_appointment()

        mocked_push.assert_called_once()

    @patch("apps.notifications.signals.send_patient_push")
    def test_changed_notification(self, mocked_push):
        with self.captureOnCommitCallbacks(execute=True):
            appointment = self._create_appointment()

        mocked_push.reset_mock()

        with self.captureOnCommitCallbacks(execute=True):
            appointment.scheduled_at += timedelta(days=1)
            appointment.save()

        mocked_push.assert_called_once()

    @patch("apps.notifications.signals.send_patient_push")
    def test_cancelled_notification(self, mocked_push):
        with self.captureOnCommitCallbacks(execute=True):
            appointment = self._create_appointment()

        mocked_push.reset_mock()

        with self.captureOnCommitCallbacks(execute=True):
            appointment.appointment_status = (
                Appointment.AppointmentStatus.CANCELLED
            )
            appointment.save()

        mocked_push.assert_called_once()
