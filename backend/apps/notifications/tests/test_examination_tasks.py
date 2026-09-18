from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from apps.notifications.tasks import (
    send_upcoming_examination_reminders,
)


class ExaminationReminderTaskTests(SimpleTestCase):
    def _build_appointment(self):
        patient_account = object()
        accounts = MagicMock()
        accounts.filter.return_value.first.return_value = (
            patient_account
        )

        examination_order_id = uuid4()

        appointment = SimpleNamespace(
            id=uuid4(),
            patient=SimpleNamespace(
                accounts=accounts,
            ),
            examination_order=SimpleNamespace(
                order_type="CT",
            ),
            examination_order_id=(
                examination_order_id
            ),
            scheduled_at=datetime(
                2026,
                9,
                19,
                14,
                30,
                tzinfo=ZoneInfo("Asia/Seoul"),
            ),
        )

        return appointment, patient_account

    def _build_queryset(self, appointment):
        queryset = MagicMock()
        queryset.select_related.return_value = queryset
        queryset.distinct.return_value = queryset
        queryset.order_by.return_value = queryset
        queryset.__iter__.return_value = iter(
            [appointment]
        )
        return queryset

    def _localtime(self, value=None):
        if value is None:
            return datetime(
                2026,
                9,
                18,
                9,
                0,
                tzinfo=ZoneInfo("Asia/Seoul"),
            )

        return value.astimezone(
            ZoneInfo("Asia/Seoul")
        )

    def test_sends_day_before_examination_push(self):
        appointment, patient_account = (
            self._build_appointment()
        )
        queryset = self._build_queryset(
            appointment
        )
        notification_queryset = MagicMock()
        notification_queryset.exists.return_value = False

        with (
            patch(
                "apps.notifications.tasks."
                "timezone.localtime",
                side_effect=self._localtime,
            ),
            patch(
                "apps.notifications.tasks."
                "Appointment.objects.filter",
                return_value=queryset,
            ) as mock_appointment_filter,
            patch(
                "apps.notifications.tasks."
                "NotificationLog.objects.filter",
                return_value=notification_queryset,
            ),
            patch(
                "apps.notifications.tasks."
                "send_patient_push",
                return_value={
                    "success_count": 1,
                    "failure_count": 0,
                    "skipped": False,
                },
            ) as mock_send_patient_push,
        ):
            result = (
                send_upcoming_examination_reminders()
            )

        self.assertEqual(
            result,
            {
                "checked_count": 1,
                "duplicate_count": 0,
                "notification_count": 1,
            },
        )

        filter_kwargs = (
            mock_appointment_filter.call_args.kwargs
        )
        self.assertEqual(
            filter_kwargs["appointment_status"],
            "CONFIRMED",
        )
        self.assertEqual(
            filter_kwargs["visit_status"],
            "SCHEDULED",
        )
        self.assertEqual(
            filter_kwargs[
                "scheduled_at__gte"
            ].date().isoformat(),
            "2026-09-19",
        )
        self.assertEqual(
            filter_kwargs[
                "scheduled_at__lt"
            ].date().isoformat(),
            "2026-09-20",
        )

        call_kwargs = (
            mock_send_patient_push.call_args.kwargs
        )
        self.assertIs(
            call_kwargs["patient_account"],
            patient_account,
        )
        self.assertEqual(
            call_kwargs["notification_type"],
            "EXAMINATION",
        )
        self.assertEqual(
            call_kwargs["title"],
            "내일 검사 일정이 있습니다.",
        )
        self.assertIn(
            "흉부 CT 검사 · 14:30",
            call_kwargs["message"],
        )
        self.assertEqual(
            call_kwargs["payload"][
                "reminder_type"
            ],
            "DAY_BEFORE",
        )

    def test_does_not_send_duplicate_reminder(self):
        appointment, _ = self._build_appointment()
        queryset = self._build_queryset(
            appointment
        )
        notification_queryset = MagicMock()
        notification_queryset.exists.return_value = True

        with (
            patch(
                "apps.notifications.tasks."
                "timezone.localtime",
                side_effect=self._localtime,
            ),
            patch(
                "apps.notifications.tasks."
                "Appointment.objects.filter",
                return_value=queryset,
            ),
            patch(
                "apps.notifications.tasks."
                "NotificationLog.objects.filter",
                return_value=notification_queryset,
            ),
            patch(
                "apps.notifications.tasks."
                "send_patient_push",
            ) as mock_send_patient_push,
        ):
            result = (
                send_upcoming_examination_reminders()
            )

        self.assertEqual(
            result["checked_count"],
            1,
        )
        self.assertEqual(
            result["duplicate_count"],
            1,
        )
        self.assertEqual(
            result["notification_count"],
            0,
        )
        mock_send_patient_push.assert_not_called()
