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
    is_appointment_slot_available,
)
from apps.patients.models import Appointment
from apps.scheduling.views import FIXED_SLOT_CAPACITY


KOREA_TIMEZONE = ZoneInfo("Asia/Seoul")


class AppointmentAvailabilityServiceTests(
    SimpleTestCase
):
    def test_each_doctor_time_slot_accepts_up_to_five_active_appointments(self):
        self.assertEqual(FIXED_SLOT_CAPACITY, 5)

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
            "slot_capacity": 5,
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
                {"start_at": "2026-09-21T09:00:00+09:00", "capacity": 5, "booked_count": 0, "remaining_count": 5},
                {"start_at": "2026-09-21T10:00:00+09:00", "capacity": 5, "booked_count": 0, "remaining_count": 5},
                {"start_at": "2026-09-21T10:30:00+09:00", "capacity": 5, "booked_count": 1, "remaining_count": 4},
            ],
        )

    @patch(
        "apps.patients.services.appointment_availability.timezone.localtime"
    )
    @patch(
        "apps.patients.services.appointment_availability.Appointment.objects.filter"
    )
    @patch(
        "apps.patients.services.appointment_availability.fetch_doctor_availability"
    )
    def test_full_slot_remains_visible_but_has_no_remaining_capacity(
        self,
        mock_fetch,
        mock_appointment_filter,
        mock_localtime,
    ):
        doctor_id = uuid4()
        slot = datetime(2026, 9, 21, 9, 0, tzinfo=KOREA_TIMEZONE)
        mock_fetch.return_value = {
            "doctor_id": str(doctor_id),
            "weekly_availability": [
                {
                    "weekday": 0,
                    "start_time": "09:00:00",
                    "end_time": "09:30:00",
                    "slot_minutes": 30,
                    "enabled": True,
                },
            ],
            "slot_capacity": 5,
            "unavailable": [],
        }
        queryset = MagicMock()
        queryset.values_list.return_value = [slot] * 5
        mock_appointment_filter.return_value = queryset
        mock_localtime.side_effect = lambda value=None: (
            datetime(2026, 9, 21, 8, 0, tzinfo=KOREA_TIMEZONE)
            if value is None
            else value.astimezone(KOREA_TIMEZONE)
        )

        result = build_available_slots(
            doctor_id=doctor_id,
            start_date=date(2026, 9, 21),
            end_date=date(2026, 9, 21),
        )

        self.assertEqual(
            result["dates"][0]["slots"],
            [
                {
                    "start_at": "2026-09-21T09:00:00+09:00",
                    "capacity": 5,
                    "booked_count": 5,
                    "remaining_count": 0,
                },
            ],
        )

    @patch(
        "apps.patients.services.appointment_availability.timezone.localtime"
    )
    @patch(
        "apps.patients.services.appointment_availability.Appointment.objects.filter"
    )
    @patch(
        "apps.patients.services.appointment_availability.fetch_doctor_availability"
    )
    def test_remaining_capacity_counts_zero_through_five_active_appointments(
        self,
        mock_fetch,
        mock_appointment_filter,
        mock_localtime,
    ):
        doctor_id = uuid4()
        slot = datetime(2026, 9, 21, 9, 0, tzinfo=KOREA_TIMEZONE)
        mock_fetch.return_value = {
            "doctor_id": str(doctor_id),
            "weekly_availability": [
                {
                    "weekday": 0,
                    "start_time": "09:00:00",
                    "end_time": "09:30:00",
                    "slot_minutes": 30,
                    "enabled": True,
                },
            ],
            "slot_capacity": 5,
            "unavailable": [],
        }
        queryset = MagicMock()
        mock_appointment_filter.return_value = queryset
        mock_localtime.side_effect = lambda value=None: (
            datetime(2026, 9, 21, 8, 0, tzinfo=KOREA_TIMEZONE)
            if value is None
            else value.astimezone(KOREA_TIMEZONE)
        )

        for occupied_count in range(6):
            with self.subTest(occupied_count=occupied_count):
                queryset.values_list.return_value = [slot] * occupied_count
                result = build_available_slots(
                    doctor_id=doctor_id,
                    start_date=date(2026, 9, 21),
                    end_date=date(2026, 9, 21),
                )
                result_slot = result["dates"][0]["slots"][0]
                self.assertEqual(result_slot["booked_count"], occupied_count)
                self.assertEqual(result_slot["remaining_count"], 5 - occupied_count)

        appointment_filter = mock_appointment_filter.call_args.kwargs
        self.assertEqual(
            appointment_filter["appointment_status__in"],
            [
                Appointment.AppointmentStatus.REQUESTED,
                Appointment.AppointmentStatus.CONFIRMED,
            ],
        )

    @patch(
        "apps.patients.services.appointment_availability.build_available_slots"
    )
    @patch(
        "apps.patients.services.appointment_availability.timezone.localtime"
    )
    def test_slot_is_available_for_four_bookings_and_closed_for_five(
        self,
        mock_localtime,
        mock_build,
    ):
        doctor_id = uuid4()
        slot = datetime(2026, 9, 21, 9, 0, tzinfo=KOREA_TIMEZONE)
        mock_localtime.return_value = slot

        for remaining_count, expected in ((1, True), (0, False)):
            with self.subTest(remaining_count=remaining_count):
                mock_build.return_value = {
                    "dates": [
                        {
                            "slots": [
                                {
                                    "start_at": slot.isoformat(),
                                    "remaining_count": remaining_count,
                                },
                            ],
                        },
                    ],
                }
                self.assertEqual(
                    is_appointment_slot_available(
                        doctor_id=doctor_id,
                        scheduled_at=slot,
                    ),
                    expected,
                )
