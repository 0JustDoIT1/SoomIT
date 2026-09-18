from datetime import date

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import PatientAccount


class PatientRegistrationInitialXrayOrderTests(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="Registration Hospital", code="REG-HOSP")
        department = Department.objects.create(
            hospital=self.hospital,
            code="PULMONOLOGY",
            name="Pulmonology",
        )
        role = DepartmentRole.objects.create(
            department=department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="Doctor",
        )
        self.doctor = User.objects.create_user(
            login_id="registration-doctor",
            password="test",
            name="Doctor",
            department_role=role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.client = APIClient()

    def _payload(self, patient_code="REG-001"):
        return {
            "hospital_id": str(self.hospital.id),
            "patient_code": patient_code,
            "name": "Registered Patient",
            "birth_date": "1970-01-01",
            "sex": "FEMALE",
            "phone_number": "010-1234-5678",
            "address": "Seoul",
            "address_detail": "101",
            "postal_code": "01000",
            "primary_doctor_id": str(self.doctor.id),
        }

    def test_coordinator_registration_creates_one_active_xray_order(self):
        response = self.client.post(reverse("patient-list"), self._payload(), format="json")

        self.assertEqual(response.status_code, 201)
        case = LungCancerCase.objects.get(patient__patient_code="REG-001")
        order = ExaminationOrder.objects.get(case=case)
        self.assertEqual(case.current_stage, WorkflowStage.XRAY)
        self.assertEqual(order.order_type, ExaminationOrder.OrderType.XRAY)
        self.assertEqual(order.status, ExaminationOrder.Status.ORDERED)
        self.assertEqual(order.requesting_doctor, self.doctor)

    def test_unlinked_flutter_account_does_not_create_case_or_xray_order(self):
        account = PatientAccount.objects.create(
            name="Pre-registered Patient",
            birth_date=date(1970, 1, 1),
            sex="FEMALE",
            phone_number="010-9999-9999",
            phone_number_hash="pre-registration",
            link_status=PatientAccount.LinkStatus.UNLINKED,
        )

        self.assertIsNone(account.patient_id)
        self.assertFalse(LungCancerCase.objects.exists())
        self.assertFalse(ExaminationOrder.objects.exists())

