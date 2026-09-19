from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import Patient


class CoordinatorExaminationOrderAPITests(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="Coordinator Hospital", code="COORD-ORDERS")
        self.department = Department.objects.create(
            hospital=self.hospital, code="ADMINISTRATION", name="Administration"
        )
        self.admin_role = DepartmentRole.objects.create(
            department=self.department,
            role=DepartmentRole.Role.MEDICAL_STAFF,
            display_name="Coordinator",
        )
        self.coordinator = User.objects.create_user(
            login_id="coordinator-orders",
            password="test-password",
            name="Coordinator",
            department_role=self.admin_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        doctor_role = DepartmentRole.objects.create(
            department=self.department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="Doctor",
        )
        self.doctor = User.objects.create_user(
            login_id="coordinator-orders-doctor",
            password="test-password",
            name="Doctor",
            department_role=doctor_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="COORDORD001",
            name="Real Patient",
            birth_date=date(1980, 1, 1),
            sex=Patient.Sex.UNKNOWN,
            phone_number="01000000000",
            phone_number_hash="coordinator-orders-patient",
        )
        case = LungCancerCase.objects.create(
            patient=patient,
            case_code="COORDORDCASE",
            primary_doctor=self.doctor,
            current_stage=WorkflowStage.CT,
        )
        self.order = ExaminationOrder.objects.create(
            case=case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            requesting_doctor=self.doctor,
            purpose="Diagnostic imaging",
            status=ExaminationOrder.Status.ORDERED,
        )
        self.url = reverse("coordinator-examination-order-list")

    def authenticate(self, user):
        refresh = RefreshToken.for_user(user)
        role = user.department_role
        refresh["hospital_id"] = str(role.department.hospital_id)
        refresh["department_id"] = str(role.department_id)
        refresh["department_code"] = role.department.code
        refresh["role"] = role.role
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_administration_staff_can_read_hospital_orders(self):
        self.authenticate(self.coordinator)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], str(self.order.id))
        self.assertEqual(response.data[0]["patient_code"], "COORDORD001")
        self.assertEqual(response.data[0]["patient_name"], "Real Patient")
        self.assertEqual(response.data[0]["requesting_doctor_name"], "Doctor")
        self.assertEqual(response.data[0]["order_type"], "PET_CT_TNM")
        self.assertEqual(response.data[0]["status"], "ORDERED")
        self.assertIn("created_at", response.data[0])

    def test_endpoint_requires_staff_authentication(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_administration_staff_cannot_read_orders(self):
        self.authenticate(self.doctor)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
