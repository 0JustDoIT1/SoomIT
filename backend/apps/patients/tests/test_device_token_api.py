from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.notifications.models import PatientDeviceToken
from apps.patients.models import PatientAccount
from apps.patients.patient_tokens import issue_patient_tokens


class PatientDeviceTokenAPITests(APITestCase):
    url = "/api/patients/device-tokens/"

    def setUp(self):
        self.patient_account = PatientAccount.objects.create(
            name="기기 토큰 테스트 환자",
            birth_date="2000-01-01",
            sex="FEMALE",
            phone_number="01000000000",
            phone_number_hash="device-token-test-phone",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.UNLINKED,
        )

        access_token = issue_patient_tokens(
            self.patient_account
        )["access"]

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )

    def test_registers_device_token(self):
        response = self.client.post(
            self.url,
            {
                "token": "test-fcm-token",
                "platform": "ANDROID",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )
        self.assertEqual(
            response.data["status"],
            "REGISTERED",
        )

        device_token = PatientDeviceToken.objects.get(
            token="test-fcm-token",
        )

        self.assertEqual(
            device_token.patient_account,
            self.patient_account,
        )
        self.assertEqual(
            device_token.platform,
            PatientDeviceToken.Platform.ANDROID,
        )
        self.assertTrue(device_token.is_active)

    def test_registering_same_token_updates_without_duplicate(self):
        PatientDeviceToken.objects.create(
            patient_account=self.patient_account,
            token="existing-fcm-token",
            platform=PatientDeviceToken.Platform.IOS,
            is_active=False,
        )

        response = self.client.post(
            self.url,
            {
                "token": "existing-fcm-token",
                "platform": "ANDROID",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            PatientDeviceToken.objects.filter(
                token="existing-fcm-token",
            ).count(),
            1,
        )

        device_token = PatientDeviceToken.objects.get(
            token="existing-fcm-token",
        )

        self.assertEqual(
            device_token.platform,
            PatientDeviceToken.Platform.ANDROID,
        )
        self.assertTrue(device_token.is_active)

    def test_deactivates_device_token(self):
        device_token = PatientDeviceToken.objects.create(
            patient_account=self.patient_account,
            token="logout-fcm-token",
            platform=PatientDeviceToken.Platform.ANDROID,
            is_active=True,
        )

        response = self.client.delete(
            self.url,
            {
                "token": "logout-fcm-token",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["status"],
            "DEACTIVATED",
        )

        device_token.refresh_from_db()
        self.assertFalse(device_token.is_active)

    def test_requires_patient_authentication(self):
        self.client.credentials()

        response = self.client.post(
            self.url,
            {
                "token": "unauthenticated-token",
                "platform": "ANDROID",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )