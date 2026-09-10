from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.constants import DEFAULT_DEPARTMENT_TEMPLATES
from apps.accounts.models import (
    Department,
    DepartmentRole,
    Hospital,
    HospitalAdmin,
    SystemAdmin,
    User,
)


class SystemAdminHospitalCreateAPITestCase(APITestCase):
    def setUp(self):
        self.url = reverse("system-admin:hospital-create")
        self.system_user = User.objects.create_user(
            login_id="system-admin",
            password="password",
            name="시스템 관리자",
            account_status=User.AccountStatus.ACTIVE,
        )
        SystemAdmin.objects.create(user=self.system_user)

    def authenticate(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")

    def payload(self, **overrides):
        payload = {"name": "숨잇병원", "code": "soomit-01"}
        payload.update(overrides)
        return payload

    def test_system_admin_creates_hospital_departments_and_roles(self):
        self.authenticate(self.system_user)
        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["hospital"]["code"], "SOOMIT-01")
        self.assertEqual(len(response.data["departments"]), len(DEFAULT_DEPARTMENT_TEMPLATES))
        hospital = Hospital.objects.get(code="SOOMIT-01")
        self.assertEqual(hospital.departments.count(), len(DEFAULT_DEPARTMENT_TEMPLATES))
        self.assertEqual(
            DepartmentRole.objects.filter(department__hospital=hospital).count(),
            sum(len(template.roles) for template in DEFAULT_DEPARTMENT_TEMPLATES),
        )

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_regular_employee_is_forbidden(self):
        hospital = Hospital.objects.create(name="기존병원", code="EXISTING")
        department = Department.objects.create(
            hospital=hospital,
            code="PULMONOLOGY",
            name="호흡기내과",
        )
        role = DepartmentRole.objects.create(
            department=department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="의사",
        )
        employee = User.objects.create_user(
            login_id="employee",
            password="password",
            name="직원",
            department_role=role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.authenticate(employee)

        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_hospital_admin_is_forbidden(self):
        hospital = Hospital.objects.create(name="기존병원", code="EXISTING")
        admin_user = User.objects.create_user(
            login_id="hospital-admin",
            password="password",
            name="병원 관리자",
            account_status=User.AccountStatus.ACTIVE,
        )
        HospitalAdmin.objects.create(user=admin_user, hospital=hospital)
        self.authenticate(admin_user)

        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_duplicate_code_is_rejected_case_insensitively(self):
        Hospital.objects.create(name="기존병원", code="SOOMIT-01")
        self.authenticate(self.system_user)

        response = self.client.post(self.url, self.payload(code="soomit-01"), format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)

    def test_invalid_code_is_rejected(self):
        self.authenticate(self.system_user)
        response = self.client.post(self.url, self.payload(code="SOOM IT!"), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("code", response.data)

    def test_departments_are_independent_between_hospitals(self):
        self.authenticate(self.system_user)
        first = self.client.post(self.url, self.payload(code="FIRST"), format="json")
        second = self.client.post(self.url, self.payload(code="SECOND"), format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        first_ids = {item["id"] for item in first.data["departments"]}
        second_ids = {item["id"] for item in second.data["departments"]}
        self.assertTrue(first_ids.isdisjoint(second_ids))
