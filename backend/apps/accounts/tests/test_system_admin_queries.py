from uuid import uuid4

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


class SystemAdminQueryAPITestCase(APITestCase):
    def setUp(self):
        self.system_user = User.objects.create_user(
            login_id="system-admin",
            password="password",
            name="시스템 관리자",
            account_status=User.AccountStatus.ACTIVE,
        )
        SystemAdmin.objects.create(user=self.system_user)

        self.first_hospital = Hospital.objects.create(
            name="첫 번째 병원",
            code="FIRST",
            address="첫 번째 주소",
            phone="02-0000-0001",
        )
        self.second_hospital = Hospital.objects.create(
            name="두 번째 병원",
            code="SECOND",
        )
        self.department = Department.objects.create(
            hospital=self.first_hospital,
            code="RADIOLOGY",
            name="영상의학과",
        )
        self.department_role = DepartmentRole.objects.create(
            department=self.department,
            role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="방사선사",
        )
        self.first_admin = self.create_hospital_admin(
            self.first_hospital,
            "first-admin",
        )
        self.second_admin = self.create_hospital_admin(
            self.second_hospital,
            "second-admin",
        )

        self.hospital_list_url = reverse("system-admin:hospital-create")
        self.hospital_detail_url = reverse(
            "system-admin:hospital-detail",
            kwargs={"hospital_id": self.first_hospital.id},
        )
        self.hospital_admin_list_url = reverse("system-admin:hospital-admin-create")

    def create_hospital_admin(self, hospital, login_id):
        user = User.objects.create_user(
            login_id=login_id,
            password="password",
            name=f"{hospital.name} 관리자",
            account_status=User.AccountStatus.ACTIVE,
        )
        return HospitalAdmin.objects.create(user=user, hospital=hospital)

    def authenticate(self, user):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")

    def create_employee(self):
        return User.objects.create_user(
            login_id="employee",
            password="password",
            name="일반 직원",
            department_role=self.department_role,
            account_status=User.AccountStatus.ACTIVE,
        )

    def test_hospital_list_returns_all_hospitals_in_stable_order(self):
        self.authenticate(self.system_user)
        response = self.client.get(self.hospital_list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["code"] for item in response.data], ["FIRST", "SECOND"])
        self.assertEqual(
            set(response.data[0]),
            {"id", "name", "code", "address", "latitude", "longitude", "phone"},
        )

    def test_hospital_list_requires_authentication(self):
        response = self.client.get(self.hospital_list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_hospital_list_forbids_regular_employee(self):
        self.authenticate(self.create_employee())
        response = self.client.get(self.hospital_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_hospital_list_forbids_hospital_admin(self):
        self.authenticate(self.first_admin.user)
        response = self.client.get(self.hospital_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_hospital_detail_includes_departments_roles_and_admins(self):
        self.authenticate(self.system_user)
        response = self.client.get(self.hospital_detail_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(self.first_hospital.id))
        self.assertEqual(response.data["departments"][0]["code"], "RADIOLOGY")
        self.assertEqual(
            response.data["departments"][0]["roles"][0]["role"],
            DepartmentRole.Role.TECHNOLOGIST,
        )
        self.assertEqual(response.data["hospital_admins"][0]["login_id"], "first-admin")

    def test_missing_hospital_detail_returns_404(self):
        self.authenticate(self.system_user)
        url = reverse("system-admin:hospital-detail", kwargs={"hospital_id": uuid4()})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_hospital_admin_list_returns_all_hospitals(self):
        self.authenticate(self.system_user)
        response = self.client.get(self.hospital_admin_list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["login_id"] for item in response.data],
            ["first-admin", "second-admin"],
        )

    def test_hospital_admin_list_filters_by_hospital(self):
        self.authenticate(self.system_user)
        response = self.client.get(
            self.hospital_admin_list_url,
            {"hospital_id": str(self.first_hospital.id)},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["login_id"], "first-admin")
        self.assertEqual(response.data[0]["hospital"]["id"], str(self.first_hospital.id))
        self.assertNotIn("password", response.data[0])
        self.assertNotIn("password_hash", response.data[0])

    def test_missing_hospital_filter_returns_404(self):
        self.authenticate(self.system_user)
        response = self.client.get(
            self.hospital_admin_list_url,
            {"hospital_id": str(uuid4())},
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_hospital_admin_list_requires_authentication(self):
        response = self.client.get(self.hospital_admin_list_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_hospital_admin_list_forbids_regular_employee(self):
        self.authenticate(self.create_employee())
        response = self.client.get(self.hospital_admin_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_hospital_admin_list_forbids_hospital_admin(self):
        self.authenticate(self.first_admin.user)
        response = self.client.get(self.hospital_admin_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
