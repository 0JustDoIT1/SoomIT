from unittest.mock import patch

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import (
    Department,
    DepartmentRole,
    Hospital,
    HospitalAdmin,
    SystemAdmin,
    User,
)
from apps.accounts.services.staff_provisioning import provision_staff


class HospitalAdminManagementAPITestCase(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="테스트 병원", code="TEST")
        self.other_hospital = Hospital.objects.create(name="다른 병원", code="OTHER")
        self.department = Department.objects.create(hospital=self.hospital, code="RADIOLOGY", name="영상의학과")
        self.other_department = Department.objects.create(hospital=self.other_hospital, code="PATHOLOGY", name="병리과")
        self.role = DepartmentRole.objects.create(department=self.department, role=DepartmentRole.Role.TECHNOLOGIST, display_name="방사선사")
        self.other_role = DepartmentRole.objects.create(department=self.other_department, role=DepartmentRole.Role.TECHNOLOGIST, display_name="임상병리사")
        self.admin_user = User.objects.create_user(login_id="hospital-admin", name="병원 관리자", password="test-password", account_status=User.AccountStatus.ACTIVE)
        self.hospital_admin = HospitalAdmin.objects.create(user=self.admin_user, hospital=self.hospital)
        self.employee = User.objects.create_user(login_id="employee", name="직원", password="test-password", department_role=self.role, account_status=User.AccountStatus.ACTIVE)
        User.objects.create_user(login_id="other-employee", name="다른 직원", password="test-password", department_role=self.other_role, account_status=User.AccountStatus.ACTIVE)

    def authenticate(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.admin_user).access_token}")

    def test_login_returns_hospital_scoped_token_and_profile(self):
        response = self.client.post(reverse("accounts:hospital-admin-login"), {"username": "hospital-admin", "password": "test-password"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(self.admin_user.department_role_id)
        self.assertEqual(response.data["user"]["hospital"]["id"], str(self.hospital.id))
        self.assertEqual(response.data["user"]["hospital"]["code"], self.hospital.code)
        self.assertEqual(str(RefreshToken(response.data["refresh"])["hospital_id"]), str(self.hospital.id))
        self.assertNotIn("password", response.data)

    def test_login_rejects_wrong_username_password_inactive_and_non_admin(self):
        cases = [
            {"username": "unknown", "password": "test-password"},
            {"username": "hospital-admin", "password": "wrong"},
            {"username": "employee", "password": "test-password"},
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post(reverse("accounts:hospital-admin-login"), payload, format="json").status_code, status.HTTP_400_BAD_REQUEST)
        self.admin_user.account_status = User.AccountStatus.DISABLED
        self.admin_user.save(update_fields=["account_status"])
        self.assertEqual(self.client.post(reverse("accounts:hospital-admin-login"), {"username": "hospital-admin", "password": "test-password"}, format="json").status_code, status.HTTP_400_BAD_REQUEST)

    def test_departments_and_staff_are_isolated_to_admin_hospital(self):
        self.authenticate()
        departments = self.client.get(reverse("hospital-admin:department-list"))
        staff = self.client.get(reverse("hospital-admin:staff-list-create"))
        self.assertEqual(departments.status_code, status.HTTP_200_OK)
        self.assertEqual([row["id"] for row in departments.data], [str(self.department.id)])
        self.assertEqual(departments.data[0]["roles"][0]["id"], str(self.role.id))
        self.assertEqual(staff.status_code, status.HTTP_200_OK)
        self.assertEqual([row["login_id"] for row in staff.data], ["employee"])

    def test_staff_create_hashes_password_and_uses_own_hospital_role(self):
        self.authenticate()
        response = self.client.post(reverse("hospital-admin:staff-list-create"), {"login_id": "new-staff", "name": "신규 직원", "password": "plain-password", "department_role_id": str(self.role.id)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(login_id="new-staff")
        self.assertTrue(user.check_password("plain-password"))
        self.assertNotEqual(user.password, "plain-password")
        self.assertEqual(user.account_status, User.AccountStatus.ACTIVE)
        self.assertEqual(user.department_role_id, self.role.id)
        self.assertNotIn("password", response.data)

    def test_staff_create_rejects_other_hospital_role_and_duplicate_login(self):
        self.authenticate()
        other = self.client.post(reverse("hospital-admin:staff-list-create"), {"login_id": "cross-hospital", "name": "교차", "password": "password", "department_role_id": str(self.other_role.id)}, format="json")
        duplicate = self.client.post(reverse("hospital-admin:staff-list-create"), {"login_id": "employee", "name": "중복", "password": "password", "department_role_id": str(self.role.id)}, format="json")
        self.assertEqual(other.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(User.objects.filter(login_id="cross-hospital").exists())
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

    def test_staff_provisioning_rolls_back_when_role_link_fails(self):
        original_save = User.save

        def fail_role_link(instance, *args, **kwargs):
            if instance.department_role_id is not None:
                raise RuntimeError("role link failed")
            return original_save(instance, *args, **kwargs)

        with patch.object(User, "save", fail_role_link):
            with self.assertRaises(RuntimeError):
                provision_staff(
                    login_id="rolled-back",
                    name="롤백 직원",
                    password="password",
                    department_role=self.role,
                )
        self.assertFalse(User.objects.filter(login_id="rolled-back").exists())

    def test_permissions_reject_unauthenticated_employee_and_system_admin(self):
        endpoint = reverse("hospital-admin:staff-list-create")
        self.assertEqual(self.client.get(endpoint).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIsNone(self.admin_user.department_role_id)
        self.assertIsNotNone(self.employee.department_role_id)
        for login_id, relation in (("plain", None), ("system", "system")):
            user = User.objects.create_user(login_id=login_id, name=login_id, password="password", department_role=self.role if relation is None else None, account_status=User.AccountStatus.ACTIVE)
            if relation == "system":
                SystemAdmin.objects.create(user=user)
                self.assertIsNone(user.department_role_id)
            self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
            self.assertEqual(self.client.get(endpoint).status_code, status.HTTP_403_FORBIDDEN)
