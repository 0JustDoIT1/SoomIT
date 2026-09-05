from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Department, DepartmentRole, Hospital, User


class StaffAuthenticationAPITestCase(APITestCase):
    def setUp(self):
        self.password = "password123"
        self.hospital = Hospital.objects.create(
            code="SUMIT001",
            name="숨잇병원",
        )
        self.department = Department.objects.create(
            hospital=self.hospital,
            code="PULMONOLOGY",
            name="호흡기내과",
        )
        self.department_role = DepartmentRole.objects.create(
            department=self.department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="의사",
        )
        self.user = User.objects.create_user(
            login_id="doctor01",
            password=self.password,
            name="김의사",
            department_role=self.department_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.login_url = reverse("accounts:staff-login")
        self.profile_url = reverse("accounts:staff-profile")
        self.refresh_url = reverse("accounts:staff-token-refresh")

    def login_payload(self, **overrides):
        payload = {
            "hospital_code": self.hospital.code,
            "username": self.user.login_id,
            "password": self.password,
        }
        payload.update(overrides)
        return payload

    def assert_authentication_failed(self, response):
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["non_field_errors"][0],
            "입력한 인증 정보를 확인해주세요.",
        )

    def test_login_succeeds_with_valid_credentials(self):
        response = self.client.post(self.login_url, self.login_payload())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["username"], "doctor01")
        self.assertEqual(response.data["user"]["role"], "DOCTOR")
        self.assertEqual(response.data["user"]["hospital"]["code"], "SUMIT001")

    def test_login_fails_with_wrong_password(self):
        response = self.client.post(
            self.login_url,
            self.login_payload(password="wrong-password"),
        )
        self.assert_authentication_failed(response)

    def test_login_fails_with_wrong_hospital_code(self):
        response = self.client.post(
            self.login_url,
            self.login_payload(hospital_code="OTHER-HOSPITAL"),
        )
        self.assert_authentication_failed(response)

    def test_login_fails_with_unknown_username(self):
        response = self.client.post(
            self.login_url,
            self.login_payload(username="unknown-user"),
        )
        self.assert_authentication_failed(response)

    def test_login_fails_for_inactive_user(self):
        self.user.account_status = User.AccountStatus.DISABLED
        self.user.save(update_fields=["account_status"])

        response = self.client.post(self.login_url, self.login_payload())
        self.assert_authentication_failed(response)

    def test_login_fails_without_department_role(self):
        self.user.department_role = None
        self.user.save(update_fields=["department_role"])

        response = self.client.post(self.login_url, self.login_payload())
        self.assert_authentication_failed(response)

    def test_profile_succeeds_with_access_token(self):
        login_response = self.client.post(self.login_url, self.login_payload())
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}",
        )

        response = self.client.get(self.profile_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], str(self.user.id))
        self.assertEqual(response.data["name"], self.user.name)
        self.assertEqual(response.data["department"]["code"], "PULMONOLOGY")
        self.assertEqual(response.data["hospital"]["code"], "SUMIT001")

    def test_profile_fails_without_token(self):
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token_issues_new_access_token(self):
        login_response = self.client.post(self.login_url, self.login_payload())

        response = self.client.post(
            self.refresh_url,
            {"refresh": login_response.data["refresh"]},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
