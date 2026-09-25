from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.constants import ADMINISTRATION_DEPARTMENT_CODE
from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import Appointment, AppointmentRequest, Patient, PatientAccount
from apps.patients.patient_tokens import issue_patient_tokens

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
        
        self.access_token = issue_patient_tokens(
            self.patient_account
        )["access"]

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {self.access_token}",
        )
        self.coordinator = User.objects.create_user(
            login_id="appointment-request-coordinator",
            password="test-password",
            name="원무과 테스트 사용자",
            department_role=DepartmentRole.objects.create(
                department=Department.objects.create(
                    hospital=hospital,
                    code=ADMINISTRATION_DEPARTMENT_CODE,
                    name="원무과",
                ),
                role=DepartmentRole.Role.MEDICAL_STAFF,
                display_name="원무직",
            ),
            account_status=User.AccountStatus.ACTIVE,
        )
        self.appointment = self._appointment()

    def _authenticate_coordinator(self):
        token = AccessToken.for_user(self.coordinator)
        token["hospital_id"] = str(self.patient.hospital_id)
        token["department_id"] = str(self.coordinator.department_role.department_id)
        token["department_code"] = ADMINISTRATION_DEPARTMENT_CODE
        token["role"] = DepartmentRole.Role.MEDICAL_STAFF
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

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
        self._authenticate_coordinator()

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
        self._authenticate_coordinator()

        response = self.client.post(f"/api/appointments/requests/{appointment_request.id}/approve/")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.appointment.refresh_from_db()
        appointment_request.refresh_from_db()
        self.assertNotEqual(self.appointment.scheduled_at, requested_scheduled_at)
        self.assertEqual(appointment_request.status, AppointmentRequest.Status.PENDING)

    def test_cancel_approval_cancels_the_existing_appointment(self):
        self.assertEqual(self._cancel_request().status_code, status.HTTP_201_CREATED)
        appointment_request = AppointmentRequest.objects.get()
        self._authenticate_coordinator()

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
        self._authenticate_coordinator()

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

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {self.access_token}",
        )
        
        self.assertEqual(
            self._change_request().status_code,
            status.HTTP_201_CREATED,
        )

    def test_coordinator_confirmation_and_cancellation_sync_linked_order(self):
        case = LungCancerCase.objects.create(
            patient=self.patient,
            case_code="APPT-ORDER-SYNC",
            current_stage=WorkflowStage.CT,
        )
        order = ExaminationOrder.objects.create(
            case=case,
            order_type=ExaminationOrder.OrderType.CT,
            requesting_doctor=self.coordinator,
            purpose="예약 상태 동기화",
        )
        appointment = self._appointment(
            case=case,
            examination_order=order,
            appointment_status=Appointment.AppointmentStatus.REQUESTED,
        )
        self._authenticate_coordinator()

        confirmed = self.client.post(f"/api/appointments/{appointment.id}/confirm/")
        self.assertEqual(confirmed.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, ExaminationOrder.Status.SCHEDULED)

        cancelled = self.client.post(
            f"/api/appointments/{appointment.id}/cancel/",
            {"cancellation_reason": "검사 일정 취소"},
            format="json",
        )
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status, ExaminationOrder.Status.ORDERED)

    def test_coordinator_appointment_api_requires_authentication(self):
        self.client.credentials()

        response = self.client.get("/api/appointments/")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_coordinator_cannot_cancel_a_completed_visit(self):
        self.appointment.visit_status = Appointment.VisitStatus.VISITED
        self.appointment.save(update_fields=["visit_status", "updated_at"])
        self._authenticate_coordinator()

        response = self.client.post(
            f"/api/appointments/{self.appointment.id}/cancel/",
            {"cancellation_reason": "완료 예약 취소 시도"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.appointment.refresh_from_db()
        self.assertEqual(
            self.appointment.appointment_status,
            Appointment.AppointmentStatus.CONFIRMED,
        )

    def test_coordinator_appointment_list_is_scoped_to_token_hospital(self):
        other_hospital = Hospital.objects.create(
            name="다른 병원",
            code="APPT-OTHER-HOSPITAL",
        )
        other_patient = Patient.objects.create(
            hospital=other_hospital,
            patient_code="OTHER001",
            name="다른 병원 환자",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01000000001",
            phone_number_hash="appointment-other-phone",
        )
        hidden = Appointment.objects.create(
            patient=other_patient,
            scheduled_at=timezone.now() + timedelta(days=3),
            appointment_status=Appointment.AppointmentStatus.REQUESTED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.PATIENT,
        )
        self._authenticate_coordinator()

        response = self.client.get("/api/appointments/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {item["id"] for item in response.data}
        self.assertIn(str(self.appointment.id), ids)
        self.assertNotIn(str(hidden.id), ids)
