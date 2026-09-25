from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User

from ..models import NotificationLog
from ..models import UserNotificationSetting


class StaffNotificationAPITests(TestCase):
    def setUp(self):
        self.recipient = User.objects.create_user(
            login_id="notification-recipient",
            password="test",
            name="Notification recipient",
            account_status=User.AccountStatus.ACTIVE,
        )
        self.other_user = User.objects.create_user(
            login_id="notification-other",
            password="test",
            name="Notification other",
            account_status=User.AccountStatus.ACTIVE,
        )
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.recipient).access_token}"
        )
        self.notification = NotificationLog.objects.create(
            recipient_user=self.recipient,
            notification_type="EXAMINATION_ORDER",
            channel=NotificationLog.Channel.IN_APP,
            title="새 검사 오더 도착",
            message="CT 검사 오더가 요청되었습니다.",
            delivery_status=NotificationLog.DeliveryStatus.SENT,
        )
        NotificationLog.objects.create(
            recipient_user=self.other_user,
            notification_type="EXAMINATION_ORDER",
            channel=NotificationLog.Channel.IN_APP,
            title="다른 사용자 알림",
            message="다른 사용자의 알림입니다.",
            delivery_status=NotificationLog.DeliveryStatus.SENT,
        )

    def test_staff_can_list_only_own_notifications_with_unread_count(self):
        response = self.client.get(reverse("staff-notification-list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unread_count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(str(response.data["results"][0]["id"]), str(self.notification.id))

    def test_staff_can_mark_only_own_notification_as_read(self):
        response = self.client.patch(
            reverse("staff-notification-read", kwargs={"notification_id": self.notification.id})
        )

        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["read_at"])
        self.notification.refresh_from_db()
        self.assertIsNotNone(self.notification.read_at)

    def test_mark_read_is_idempotent_and_persists_after_reload(self):
        url = reverse(
            "staff-notification-read",
            kwargs={"notification_id": self.notification.id},
        )

        first = self.client.patch(url)
        second = self.client.patch(url)
        listed = self.client.get(reverse("staff-notification-list"))

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["read_at"], first.data["read_at"])
        self.assertEqual(listed.data["unread_count"], 0)
        self.assertEqual(listed.data["results"][0]["read_at"], first.data["read_at"])

    def test_list_excludes_non_in_app_channels(self):
        NotificationLog.objects.create(
            recipient_user=self.recipient,
            notification_type="EXAMINATION_ORDER",
            channel=NotificationLog.Channel.PUSH,
            title="Push only",
            message="This must not appear in the in-app list.",
            delivery_status=NotificationLog.DeliveryStatus.SENT,
        )

        response = self.client.get(reverse("staff-notification-list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unread_count"], 1)
        self.assertEqual(len(response.data["results"]), 1)

    def test_unauthenticated_user_cannot_list_notifications(self):
        self.client.credentials()

        response = self.client.get(reverse("staff-notification-list"))

        self.assertEqual(response.status_code, 401)

    def test_staff_cannot_read_another_users_notification(self):
        other_notification = NotificationLog.objects.get(recipient_user=self.other_user)
        response = self.client.patch(
            reverse("staff-notification-read", kwargs={"notification_id": other_notification.id})
        )

        self.assertEqual(response.status_code, 404)

    def test_staff_can_get_and_update_case_chat_notification_setting(self):
        settings_url = reverse("staff-notification-settings")
        default_response = self.client.get(settings_url, {"notification_type": "CASE_CHAT"})
        self.assertEqual(default_response.status_code, 200)
        self.assertTrue(default_response.data["enabled"])

        updated = self.client.patch(
            settings_url,
            {"notification_type": "CASE_CHAT", "enabled": False},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertFalse(updated.data["enabled"])
        self.assertTrue(UserNotificationSetting.objects.filter(
            user=self.recipient,
            notification_type="CASE_CHAT",
            enabled=False,
        ).exists())

    def test_staff_notification_setting_update_is_isolated_to_current_user(self):
        UserNotificationSetting.objects.create(
            user=self.other_user,
            notification_type="CASE_CHAT",
            enabled=True,
        )

        response = self.client.patch(
            reverse("staff-notification-settings"),
            {"notification_type": "CASE_CHAT", "enabled": False},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["enabled"])
        self.assertTrue(UserNotificationSetting.objects.get(
            user=self.other_user,
            notification_type="CASE_CHAT",
        ).enabled)
        self.assertFalse(UserNotificationSetting.objects.get(
            user=self.recipient,
            notification_type="CASE_CHAT",
        ).enabled)

    def test_staff_notification_setting_rejects_unsupported_type(self):
        response = self.client.patch(
            reverse("staff-notification-settings"),
            {"notification_type": "SYSTEM", "enabled": False},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(UserNotificationSetting.objects.filter(
            user=self.recipient,
            notification_type="SYSTEM",
        ).exists())

    def test_unauthenticated_user_cannot_update_notification_setting(self):
        self.client.credentials()

        response = self.client.patch(
            reverse("staff-notification-settings"),
            {"notification_type": "CASE_CHAT", "enabled": False},
            format="json",
        )

        self.assertEqual(response.status_code, 401)
