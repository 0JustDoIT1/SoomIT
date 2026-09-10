from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.accounts.models import SystemAdmin, User


class SystemAdminAuthenticationAPITestCase(APITestCase):
    def setUp(self):
        self.password = "admin-password"
        self.user = User.objects.create_user(
            login_id="system-admin",
            password=self.password,
            name="시스템 관리자",
            account_status=User.AccountStatus.ACTIVE,
        )
        SystemAdmin.objects.create(user=self.user)
        self.url = reverse("accounts:system-admin-login")

    def test_system_admin_login_succeeds_without_staff_claims(self):
        response = self.client.post(
            self.url,
            {"username": self.user.login_id, "password": self.password},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"]["username"], self.user.login_id)
        access = AccessToken(response.data["access"])
        refresh = RefreshToken(response.data["refresh"])
        for claim in ("hospital_id", "department_id", "department_code", "role"):
            self.assertNotIn(claim, access)
            self.assertNotIn(claim, refresh)

    def test_system_admin_login_rejects_wrong_password(self):
        response = self.client.post(
            self.url,
            {"username": self.user.login_id, "password": "wrong-password"},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_system_admin_login_rejects_inactive_account(self):
        self.user.account_status = User.AccountStatus.DISABLED
        self.user.save(update_fields=["account_status"])

        response = self.client.post(
            self.url,
            {"username": self.user.login_id, "password": self.password},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_system_admin_login_rejects_user_without_system_admin_relation(self):
        plain_user = User.objects.create_user(
            login_id="plain-user",
            password=self.password,
            name="일반 사용자",
            account_status=User.AccountStatus.ACTIVE,
        )

        response = self.client.post(
            self.url,
            {"username": plain_user.login_id, "password": self.password},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
