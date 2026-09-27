from datetime import date
import hashlib

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import Patient, PatientAccount


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
        self.client.force_authenticate(user=self.doctor)

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

    def test_authenticated_registration_links_unlinked_account(self):
        account = PatientAccount.objects.create(
            name="Pre-registered", phone_number="01012345678",
            phone_number_hash=hashlib.sha256(b"01012345678").hexdigest(),
            link_status=PatientAccount.LinkStatus.UNLINKED,
        )
        response = self.client.post(reverse("patient-list"), {
            **self._payload(), "patient_account_id": str(account.id),
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        account.refresh_from_db()
        self.assertEqual(str(account.patient_id), str(response.data["id"]))
        self.assertEqual(account.linked_by_user_id, self.doctor.id)
        self.assertEqual(ExaminationOrder.objects.count(), 1)

    def test_registration_cannot_disclose_foreign_linked_account(self):
        other_hospital = Hospital.objects.create(name="Other", code="REG-OTHER")
        patient = Patient.objects.create(
            hospital=other_hospital, patient_code="REG-FOREIGN", name="Other patient",
            birth_date=date(1970, 1, 1), sex="FEMALE", phone_number="01012345678",
            phone_number_hash=hashlib.sha256(b"01012345678").hexdigest(),
        )
        account = PatientAccount.objects.create(
            patient=patient, name="Other patient", phone_number="01012345678",
            phone_number_hash=patient.phone_number_hash, link_status=PatientAccount.LinkStatus.LINKED,
        )
        response = self.client.post(reverse("patient-list"), {
            **self._payload(), "patient_account_id": str(account.id),
        }, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertNotIn("patient", response.data)
        self.assertFalse(Patient.objects.filter(hospital=self.hospital).exists())
        account.refresh_from_db()
        self.assertEqual(account.patient_id, patient.id)

