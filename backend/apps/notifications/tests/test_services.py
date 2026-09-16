from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Hospital
from apps.notifications.models import (
    NotificationLog,
    PatientDeviceToken,
    PatientNotificationSetting,
)
from apps.notifications.services import send_patient_push
from apps.patients.models import Patient, PatientAccount


class PatientPushServiceTests(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(
            name="푸시 테스트 병원",
            code="PUSH-TEST",
        )

        self.patient = Patient.objects.create(
            hospital=hospital,
            patient_code="PUSH001",
            name="푸시 테스트 환자",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01000000000",
            phone_number_hash="push-patient-phone",
        )

        self.patient_account = PatientAccount.objects.create(
            patient=self.patient,
            phone_number="01000000000",
            phone_number_hash="push-account-phone",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.LINKED,
        )

        self.device_token = PatientDeviceToken.objects.create(
            patient_account=self.patient_account,
            token="test-device-token",
            platform=PatientDeviceToken.Platform.ANDROID,
            is_active=True,
        )

    @patch(
        "apps.notifications.services._get_firebase_app",
        return_value=object(),
    )
    @patch(
        "apps.notifications.services.messaging.send",
        return_value="test-message-id",
    )
    def test_sends_push_and_records_success(
        self,
        mock_send,
        _mock_firebase_app,
    ):
        result = send_patient_push(
            patient_account=self.patient_account,
            notification_type="HEALTH",
            title="테스트 제목",
            message="테스트 내용",
            payload={"type": "TEST"},
        )

        self.assertEqual(
            result["success_count"],
            1,
        )
        self.assertEqual(
            result["failure_count"],
            0,
        )

        mock_send.assert_called_once()

        sent_message = mock_send.call_args.args[0]

        self.assertEqual(
            sent_message.data["notification_type"],
            "HEALTH",
        )
        self.assertEqual(
            sent_message.data["type"],
            "TEST",
        )

        notification_log = NotificationLog.objects.get()

        self.assertEqual(
            notification_log.delivery_status,
            NotificationLog.DeliveryStatus.SENT,
        )
        self.assertIsNotNone(
            notification_log.sent_at,
        )
        self.assertEqual(
            notification_log.payload[
                "notification_type"
            ],
            "HEALTH",
        )
        self.assertEqual(
            notification_log.payload["type"],
            "TEST",
        )

    @patch(
        "apps.notifications.services.messaging.send"
    )
    def test_skips_disabled_notification(
        self,
        mock_send,
    ):
        PatientNotificationSetting.objects.create(
            patient_account=self.patient_account,
            notification_type="HEALTH",
            enabled=False,
        )

        result = send_patient_push(
            patient_account=self.patient_account,
            notification_type="HEALTH",
            title="테스트 제목",
            message="테스트 내용",
        )

        self.assertTrue(
            result["skipped"],
        )
        mock_send.assert_not_called()

        notification_log = NotificationLog.objects.get()

        self.assertEqual(
            notification_log.delivery_status,
            NotificationLog.DeliveryStatus.FAILED,
        )
        self.assertEqual(
            notification_log.payload[
                "notification_type"
            ],
            "HEALTH",
        )

    @patch(
        "apps.notifications.services._get_firebase_app"
    )
    def test_records_failure_without_active_token(
        self,
        mock_firebase_app,
    ):
        self.device_token.is_active = False
        self.device_token.save(
            update_fields=[
                "is_active",
                "updated_at",
            ]
        )

        result = send_patient_push(
            patient_account=self.patient_account,
            notification_type="HEALTH",
            title="테스트 제목",
            message="테스트 내용",
        )

        self.assertEqual(
            result["success_count"],
            0,
        )
        self.assertEqual(
            result["failure_count"],
            0,
        )

        mock_firebase_app.assert_not_called()

        notification_log = NotificationLog.objects.get()

        self.assertEqual(
            notification_log.delivery_status,
            NotificationLog.DeliveryStatus.FAILED,
        )
        self.assertEqual(
            notification_log.error_message,
            "활성화된 기기 토큰이 없습니다.",
        )
        self.assertEqual(
            notification_log.payload[
                "notification_type"
            ],
            "HEALTH",
        )