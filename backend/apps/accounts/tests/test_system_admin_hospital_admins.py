from unittest.mock import patch
from uuid import uuid4

from django.db import IntegrityError
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import (
    Department,
    DepartmentRole,
    Hospital,
    HospitalAdmin,
    SystemAdmin,
    User,
)


class SystemAdminHospitalAdminCreateAPITestCase(APITestCase):
    def setUp(self):
        self.url = reverse("system-admin:hospital-admin-create")
        self.hospital = Hospital.objects.create(name="숨잇병원", code="SOOMIT")
        self.system_user = User.objects.create_user(
            login_id="system-admin",
            password="password",
            name="시스템 관리자",
            account_status=User.AccountStatus.ACTIVE,
        )
        SystemAdmin.objects.create(user=self.system_user)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.system_user)}",
        )

    def payload(self, **overrides):
        payload = {
            "hospital_id": str(self.hospital.id),
            "login_id": "hospital-admin",
            "name": "병원 관리자",
            "password": "admin-password",
        }
        payload.update(overrides)
        return payload

    def test_creates_hospital_admin_with_hashed_password(self):
        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(login_id="hospital-admin")
        self.assertTrue(user.check_password("admin-password"))
        self.assertNotEqual(user.password, "admin-password")
        self.assertIsNone(user.department_role)
        self.assertEqual(user.account_status, User.AccountStatus.ACTIVE)
        self.assertEqual(user.hospital_admin.hospital, self.hospital)
        self.assertNotIn("password", response.data)

    def test_missing_hospital_returns_404(self):
        response = self.client.post(
            self.url,
            self.payload(hospital_id=str(uuid4())),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(User.objects.filter(login_id="hospital-admin").exists())

    def test_duplicate_login_id_is_rejected(self):
        User.objects.create_user(login_id="hospital-admin", name="기존 사용자")
        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("login_id", response.data)

    @patch("apps.accounts.services.hospital_admin_provisioning.HospitalAdmin.objects.create")
    def test_hospital_admin_failure_rolls_back_user(self, create_hospital_admin):
        create_hospital_admin.side_effect = IntegrityError("hospital admin failure")

        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(login_id="hospital-admin").exists())

    def test_hospital_admin_is_forbidden(self):
        hospital_admin_user = User.objects.create_user(
            login_id="existing-admin",
            password="password",
            name="기존 병원 관리자",
            account_status=User.AccountStatus.ACTIVE,
        )
        HospitalAdmin.objects.create(user=hospital_admin_user, hospital=self.hospital)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(hospital_admin_user)}",
        )

        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_regular_employee_is_forbidden(self):
        department = Department.objects.create(
            hospital=self.hospital,
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
            name="일반 직원",
            department_role=role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(employee)}",
        )

        response = self.client.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
