from datetime import date, datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.test import (
    SimpleTestCase,
    override_settings,
)

from apps.patients.services.appointment_availability import (
    build_available_slots,
    fetch_doctor_availability,
)


KOREA_TIMEZONE = ZoneInfo("Asia/Seoul")


class AppointmentAvailabilityServiceTests(
    SimpleTestCase
):
    @override_settings(
        MEDICAL_BACKEND_URL=(
            "http://medical-backend.test"
        ),
        MEDICAL_BACKEND_TIMEOUT_SECONDS=5,
        PATIENT_APP_SERVICE_TOKEN=(
            "test-service-token"
        ),
    )
    @patch(
        "apps.patients.services."
        "appointment_availability."
        "requests.get"
    )
    def test_fetches_schedule_with_service_token(
        self,
        mock_get,
    ):
        doctor_id = uuid4()

        response = MagicMock()
        response.status_code = 200
        response.json.return_value = {
            "doctor_id": str(doctor_id),
            "weekly_availability": [],
            "unavailable": [],
        }
        mock_get.return_value = response

        result = fetch_doctor_availability(
            doctor_id=doctor_id,
            start_date=date(2026, 9, 21),
            end_date=date(2026, 9, 21),
        )

        self.assertEqual(
            result["doctor_id"],
            str(doctor_id),
        )

        mock_get.assert_called_once()

        call_kwargs = mock_get.call_args.kwargs

        self.assertEqual(
            call_kwargs["headers"][
                "X-Service-Token"
            ],
            "test-service-token",
        )
        self.assertEqual(
            call_kwargs["params"]["start"],
            "2026-09-21",
        )
        self.assertEqual(
            call_kwargs["params"]["end"],
            "2026-09-21",
        )

    @patch(
        "apps.patients.services."
        "appointment_availability."
        "timezone.localtime"
    )
    @patch(
        "apps.patients.services."
        "appointment_availability."
        "Appointment.objects.filter"
    )
    @patch(
        "apps.patients.services."
        "appointment_availability."
        "fetch_doctor_availability"
    )
    def test_excludes_unavailable_and_booked_slots(
        self,
        mock_fetch,
        mock_appointment_filter,
        mock_localtime,
    ):
        doctor_id = uuid4()

        mock_fetch.return_value = {
            "doctor_id": str(doctor_id),
            "weekly_availability": [
                {
                    "weekday": 0,
                    "start_time": "09:00:00",
                    "end_time": "11:00:00",
                    "slot_minutes": 30,
                    "enabled": True,
                },
            ],
            "unavailable": [
                {
                    "start_at": (
                        "2026-09-21T09:30:00+09:00"
                    ),
                    "end_at": (
                        "2026-09-21T10:00:00+09:00"
                    ),
                },
            ],
        }

        queryset = MagicMock()
        queryset.values_list.return_value = [
            datetime(
                2026,
                9,
                21,
                10,
                30,
                tzinfo=KOREA_TIMEZONE,
            ),
        ]
        mock_appointment_filter.return_value = (
            queryset
        )

        now = datetime(
            2026,
            9,
            21,
            8,
            0,
            tzinfo=KOREA_TIMEZONE,
        )

        def localtime_side_effect(value=None):
            if value is None:
                return now

            return value.astimezone(
                KOREA_TIMEZONE
            )

        mock_localtime.side_effect = (
            localtime_side_effect
        )

        result = build_available_slots(
            doctor_id=doctor_id,
            start_date=date(2026, 9, 21),
            end_date=date(2026, 9, 21),
        )

        self.assertEqual(
            result["slot_minutes"],
            30,
        )
        self.assertEqual(
            result["dates"][0]["slots"],
            [
                (
                    "2026-09-21"
                    "T09:00:00+09:00"
                ),
                (
                    "2026-09-21"
                    "T10:00:00+09:00"
                ),
            ],
        )
        