import uuid
from datetime import datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase
from django.utils import timezone

from apps.patients.serializers import (
    PatientAppointmentChangeRequestSerializer,
    PatientAppointmentRequestSerializer,
)


KST = ZoneInfo("Asia/Seoul")


class AppointmentBookingPolicyTests(SimpleTestCase):
    def _kst(self, year, month, day, hour, minute=0):
        return datetime(
            year,
            month,
            day,
            hour,
            minute,
            tzinfo=KST,
        )

    def test_same_day_appointment_is_rejected(self):
        """
        당일 예약은 불가능해야 한다.
        """
        now = self._kst(
            2026,
            9,
            19,
            10,
            0,
        )

        scheduled_at = self._kst(
            2026,
            9,
            19,
            15,
            0,
        )

        with (
            timezone.override(KST),
            patch(
                "django.utils.timezone.now",
                return_value=now,
            ),
        ):
            serializer = PatientAppointmentRequestSerializer(
                data={
                    "doctor_id": str(uuid.uuid4()),
                    "scheduled_at": scheduled_at.isoformat(),
                }
            )

            self.assertFalse(serializer.is_valid())

            self.assertIn(
                "scheduled_at",
                serializer.errors,
            )

            self.assertIn(
                "당일 예약은 불가능합니다.",
                str(serializer.errors["scheduled_at"]),
            )

    def test_next_day_appointment_before_6pm_is_allowed(self):
        """
        오후 6시 이전에는 다음 날 예약이 가능해야 한다.
        """
        now = self._kst(
            2026,
            9,
            19,
            17,
            30,
        )

        scheduled_at = self._kst(
            2026,
            9,
            20,
            9,
            0,
        )

        with (
            timezone.override(KST),
            patch(
                "django.utils.timezone.now",
                return_value=now,
            ),
        ):
            serializer = PatientAppointmentRequestSerializer(
                data={
                    "doctor_id": str(uuid.uuid4()),
                    "scheduled_at": scheduled_at.isoformat(),
                }
            )

            self.assertTrue(
                serializer.is_valid(),
                serializer.errors,
            )

    def test_next_day_appointment_at_6pm_is_rejected(self):
        """
        오후 6시부터는 다음 날 예약이 불가능해야 한다.
        """
        now = self._kst(
            2026,
            9,
            19,
            18,
            0,
        )

        scheduled_at = self._kst(
            2026,
            9,
            20,
            9,
            0,
        )

        with (
            timezone.override(KST),
            patch(
                "django.utils.timezone.now",
                return_value=now,
            ),
        ):
            serializer = PatientAppointmentRequestSerializer(
                data={
                    "doctor_id": str(uuid.uuid4()),
                    "scheduled_at": scheduled_at.isoformat(),
                }
            )

            self.assertFalse(serializer.is_valid())

            self.assertIn(
                "다음 날 예약은 전날 오후 6시까지 가능합니다.",
                str(serializer.errors["scheduled_at"]),
            )

    def test_day_after_tomorrow_is_allowed_after_6pm(self):
        """
        오후 6시 이후라도 모레 이후 예약은 가능해야 한다.
        """
        now = self._kst(
            2026,
            9,
            19,
            18,
            30,
        )

        scheduled_at = self._kst(
            2026,
            9,
            21,
            9,
            0,
        )

        with (
            timezone.override(KST),
            patch(
                "django.utils.timezone.now",
                return_value=now,
            ),
        ):
            serializer = PatientAppointmentRequestSerializer(
                data={
                    "doctor_id": str(uuid.uuid4()),
                    "scheduled_at": scheduled_at.isoformat(),
                }
            )

            self.assertTrue(
                serializer.is_valid(),
                serializer.errors,
            )

    def test_same_day_change_request_is_rejected(self):
        """
        예약 변경도 당일 날짜로 변경할 수 없어야 한다.
        """
        now = self._kst(
            2026,
            9,
            19,
            10,
            0,
        )

        scheduled_at = self._kst(
            2026,
            9,
            19,
            15,
            0,
        )

        with (
            timezone.override(KST),
            patch(
                "django.utils.timezone.now",
                return_value=now,
            ),
        ):
            serializer = PatientAppointmentChangeRequestSerializer(
                data={
                    "new_scheduled_at": scheduled_at.isoformat(),
                    "reason": "일정 변경",
                }
            )

            self.assertFalse(serializer.is_valid())

            self.assertIn(
                "당일 예약으로 변경할 수 없습니다.",
                str(serializer.errors["new_scheduled_at"]),
            )

    def test_next_day_change_after_6pm_is_rejected(self):
        """
        예약 변경도 오후 6시 이후에는
        다음 날 일정으로 변경할 수 없어야 한다.
        """
        now = self._kst(
            2026,
            9,
            19,
            18,
            30,
        )

        scheduled_at = self._kst(
            2026,
            9,
            20,
            9,
            0,
        )

        with (
            timezone.override(KST),
            patch(
                "django.utils.timezone.now",
                return_value=now,
            ),
        ):
            serializer = PatientAppointmentChangeRequestSerializer(
                data={
                    "new_scheduled_at": scheduled_at.isoformat(),
                    "reason": "일정 변경",
                }
            )

            self.assertFalse(serializer.is_valid())

            self.assertIn(
                "다음 날 예약 변경은 전날 오후 6시까지 가능합니다.",
                str(serializer.errors["new_scheduled_at"]),
            )
