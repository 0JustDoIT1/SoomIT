from datetime import date, datetime, time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from apps.notifications.tasks import (
    is_medication_schedule_due,
    send_due_medication_reminders,
)
from apps.patients.models import (
    MedicationSchedule,
)


class MedicationScheduleDueTests(
    SimpleTestCase
):
    def _build_schedule(
        self,
        *,
        repeat_type,
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 30),
        repeat_weekdays=None,
        cycle_days=None,
        enabled=True,
    ):
        return MedicationSchedule(
            start_date=start_date,
            end_date=end_date,
            repeat_type=repeat_type,
            repeat_weekdays=(
                repeat_weekdays or []
            ),
            cycle_days=cycle_days or [],
            enabled=enabled,
        )

    def test_daily_schedule_is_due_in_range(
        self,
    ):
        schedule = self._build_schedule(
            repeat_type=(
                MedicationSchedule
                .RepeatType
                .DAILY
            ),
        )

        self.assertTrue(
            is_medication_schedule_due(
                schedule,
                date(2026, 9, 17),
            )
        )

    def test_weekly_schedule_uses_monday_zero(
        self,
    ):
        schedule = self._build_schedule(
            repeat_type=(
                MedicationSchedule
                .RepeatType
                .WEEKLY
            ),
            repeat_weekdays=[0, 2],
        )

        self.assertTrue(
            is_medication_schedule_due(
                schedule,
                date(2026, 9, 21),
            )
        )
        self.assertFalse(
            is_medication_schedule_due(
                schedule,
                date(2026, 9, 22),
            )
        )

    def test_cycle_day_uses_start_date_as_day_one(
        self,
    ):
        schedule = self._build_schedule(
            repeat_type=(
                MedicationSchedule
                .RepeatType
                .CYCLE_DAY
            ),
            cycle_days=[1, 3, 8],
        )

        self.assertTrue(
            is_medication_schedule_due(
                schedule,
                date(2026, 9, 3),
            )
        )
        self.assertFalse(
            is_medication_schedule_due(
                schedule,
                date(2026, 9, 4),
            )
        )

    def test_schedule_outside_date_range_is_not_due(
        self,
    ):
        schedule = self._build_schedule(
            repeat_type=(
                MedicationSchedule
                .RepeatType
                .DAILY
            ),
        )

        self.assertFalse(
            is_medication_schedule_due(
                schedule,
                date(2026, 10, 1),
            )
        )

    def test_disabled_schedule_is_not_due(
        self,
    ):
        schedule = self._build_schedule(
            repeat_type=(
                MedicationSchedule
                .RepeatType
                .DAILY
            ),
            enabled=False,
        )

        self.assertFalse(
            is_medication_schedule_due(
                schedule,
                date(2026, 9, 17),
            )
        )


class MedicationReminderTaskTests(
    SimpleTestCase
):
    def _build_schedule(self):
        items = MagicMock()
        items.all.return_value = [
            SimpleNamespace(
                prescription_item=(
                    SimpleNamespace(
                        drug=SimpleNamespace(
                            drug_name="테스트약",
                        ),
                    )
                ),
            ),
        ]

        return SimpleNamespace(
            id=uuid4(),
            enabled=True,
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 30),
            repeat_type=(
                MedicationSchedule
                .RepeatType
                .DAILY
            ),
            repeat_weekdays=[],
            cycle_days=[],
            reminder_time=time(9, 0),
            patient_account=object(),
            items=items,
        )

    def _build_queryset(
        self,
        schedule,
    ):
        queryset = MagicMock()
        queryset.filter.return_value = queryset
        queryset.select_related.return_value = (
            queryset
        )
        queryset.prefetch_related.return_value = (
            queryset
        )
        queryset.__iter__.return_value = iter(
            [schedule]
        )

        return queryset

    @patch(
        "apps.notifications.tasks."
        "send_patient_push"
    )
    @patch(
        "apps.notifications.tasks."
        "MedicationIntakeLog.objects."
        "get_or_create"
    )
    @patch(
        "apps.notifications.tasks."
        "MedicationSchedule.objects.filter"
    )
    @patch(
        "apps.notifications.tasks."
        "timezone.localtime"
    )
    def test_creates_pending_log_and_sends_push(
        self,
        mock_localtime,
        mock_filter,
        mock_get_or_create,
        mock_send_patient_push,
    ):
        schedule = self._build_schedule()
        queryset = self._build_queryset(
            schedule
        )

        mock_localtime.return_value = datetime(
            2026,
            9,
            17,
            9,
            0,
            tzinfo=ZoneInfo("Asia/Seoul"),
        )
        mock_filter.return_value = queryset

        intake_log = SimpleNamespace(
            id=uuid4(),
        )
        mock_get_or_create.return_value = (
            intake_log,
            True,
        )
        mock_send_patient_push.return_value = {
            "success_count": 1,
            "failure_count": 0,
            "skipped": False,
        }

        result = (
            send_due_medication_reminders()
        )

        self.assertEqual(
            result["created_count"],
            1,
        )
        self.assertEqual(
            result["notification_count"],
            1,
        )

        mock_get_or_create.assert_called_once()
        mock_send_patient_push.assert_called_once()

        call_kwargs = (
            mock_send_patient_push
            .call_args
            .kwargs
        )

        self.assertEqual(
            call_kwargs["notification_type"],
            "MEDICATION",
        )
        self.assertEqual(
            call_kwargs["message"],
            "테스트약 복용 시간입니다.",
        )
        self.assertEqual(
            call_kwargs["payload"][
                "medication_schedule_id"
            ],
            str(schedule.id),
        )

    @patch(
        "apps.notifications.tasks."
        "send_patient_push"
    )
    @patch(
        "apps.notifications.tasks."
        "MedicationIntakeLog.objects."
        "get_or_create"
    )
    @patch(
        "apps.notifications.tasks."
        "MedicationSchedule.objects.filter"
    )
    @patch(
        "apps.notifications.tasks."
        "timezone.localtime"
    )
    def test_does_not_send_duplicate_reminder(
        self,
        mock_localtime,
        mock_filter,
        mock_get_or_create,
        mock_send_patient_push,
    ):
        schedule = self._build_schedule()
        queryset = self._build_queryset(
            schedule
        )

        mock_localtime.return_value = datetime(
            2026,
            9,
            17,
            9,
            0,
            tzinfo=ZoneInfo("Asia/Seoul"),
        )
        mock_filter.return_value = queryset
        mock_get_or_create.return_value = (
            SimpleNamespace(
                id=uuid4(),
            ),
            False,
        )

        result = (
            send_due_medication_reminders()
        )

        self.assertEqual(
            result["created_count"],
            0,
        )
        self.assertEqual(
            result["notification_count"],
            0,
        )
        mock_send_patient_push.assert_not_called()