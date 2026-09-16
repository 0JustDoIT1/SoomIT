from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Hospital
from apps.notifications.models import NotificationLog
from apps.patients.models import Patient, PatientAccount
from apps.patients.patient_tokens import issue_patient_tokens


class PatientNotificationAPITests(APITestCase):
    url = "/api/patients/notifications/"

    def setUp(self):
        hospital = Hospital.objects.create(
            name="알림 API 테스트 병원",
            code="NOTIFICATION-API-TEST",
        )

        patient = Patient.objects.create(
            hospital=hospital,
            patient_code="NOTIFICATION001",
            name="알림 테스트 환자",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01000000000",
            phone_number_hash="notification-patient-phone",
        )

        self.patient_account = PatientAccount.objects.create(
            patient=patient,
            phone_number="01000000000",
            phone_number_hash="notification-account-phone",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.LINKED,
        )

        other_account = PatientAccount.objects.create(
            phone_number="01011111111",
            phone_number_hash="notification-other-account-phone",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.UNLINKED,
        )

        access_token = issue_patient_tokens(
            self.patient_account
        )["access"]

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )

        self.in_app_notification = NotificationLog.objects.create(
            recipient_patient_account=self.patient_account,
            notification_type="HEALTH",
            channel=NotificationLog.Channel.IN_APP,
            title="인앱 알림",
            message="인앱 알림 내용",
            delivery_status=NotificationLog.DeliveryStatus.PENDING,
        )

        self.sent_push_notification = NotificationLog.objects.create(
            recipient_patient_account=self.patient_account,
            notification_type="RESULT",
            channel=NotificationLog.Channel.PUSH,
            title="성공 푸시",
            message="성공한 푸시 내용",
            delivery_status=NotificationLog.DeliveryStatus.SENT,
            sent_at=timezone.now(),
        )

        self.failed_push_notification = NotificationLog.objects.create(
            recipient_patient_account=self.patient_account,
            notification_type="RESULT",
            channel=NotificationLog.Channel.PUSH,
            title="실패 푸시",
            message="실패한 푸시 내용",
            delivery_status=NotificationLog.DeliveryStatus.FAILED,
            error_message="테스트 발송 실패",
        )

        self.other_account_notification = (
            NotificationLog.objects.create(
                recipient_patient_account=other_account,
                notification_type="HEALTH",
                channel=NotificationLog.Channel.PUSH,
                title="다른 계정 알림",
                message="다른 계정 알림 내용",
                delivery_status=(
                    NotificationLog.DeliveryStatus.SENT
                ),
                sent_at=timezone.now(),
            )
        )

    def test_lists_in_app_and_successful_push_only(self):
        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        notification_ids = {
            item["id"]
            for item in response.data
        }

        self.assertIn(
            str(self.in_app_notification.id),
            notification_ids,
        )
        self.assertIn(
            str(self.sent_push_notification.id),
            notification_ids,
        )
        self.assertNotIn(
            str(self.failed_push_notification.id),
            notification_ids,
        )
        self.assertNotIn(
            str(self.other_account_notification.id),
            notification_ids,
        )

    def test_marks_push_notification_as_read(self):
        response = self.client.patch(
            (
                "/api/patients/notifications/"
                f"{self.sent_push_notification.id}/read/"
            ),
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertTrue(response.data["is_read"])

        self.sent_push_notification.refresh_from_db()

        self.assertIsNotNone(
            self.sent_push_notification.read_at,
        )

    def test_requires_patient_authentication(self):
        self.client.credentials()

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )