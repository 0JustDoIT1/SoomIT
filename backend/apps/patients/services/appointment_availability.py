from datetime import (
    datetime,
    time,
    timedelta,
)

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import (
    parse_datetime,
    parse_time,
)

from apps.patients.models import Appointment


SLOT_MINUTES = 30


class AppointmentAvailabilityError(
    RuntimeError
):
    pass


def fetch_doctor_availability(
    *,
    doctor_id,
    start_date,
    end_date,
):
    if not settings.MEDICAL_BACKEND_URL:
        raise AppointmentAvailabilityError(
            "의료진 백엔드 URL이 설정되지 않았습니다."
        )

    if not settings.PATIENT_APP_SERVICE_TOKEN:
        raise AppointmentAvailabilityError(
            "환자앱 서비스 토큰이 설정되지 않았습니다."
        )

    url = (
        f"{settings.MEDICAL_BACKEND_URL}"
        f"/api/scheduling/doctors/"
        f"{doctor_id}/appointment-availability/"
    )

    try:
        response = requests.get(
            url,
            params={
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
            headers={
                "X-Service-Token": (
                    settings
                    .PATIENT_APP_SERVICE_TOKEN
                ),
            },
            timeout=(
                settings
                .MEDICAL_BACKEND_TIMEOUT_SECONDS
            ),
        )
    except requests.RequestException as error:
        raise AppointmentAvailabilityError(
            "의료진 일정 서버에 연결할 수 없습니다."
        ) from error

    if response.status_code == 404:
        raise AppointmentAvailabilityError(
            "해당 의료진을 찾을 수 없습니다."
        )

    try:
        response.raise_for_status()
        data = response.json()
    except (
        requests.RequestException,
        ValueError,
    ) as error:
        raise AppointmentAvailabilityError(
            "의료진 일정 응답이 올바르지 않습니다."
        ) from error

    if not isinstance(data, dict):
        raise AppointmentAvailabilityError(
            "의료진 일정 응답 형식이 올바르지 않습니다."
        )

    return data


def _parse_api_datetime(value):
    parsed = parse_datetime(value)

    if parsed is None:
        raise AppointmentAvailabilityError(
            "휴진 일정의 날짜 형식이 올바르지 않습니다."
        )

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(
            parsed,
            timezone.get_current_timezone(),
        )

    return timezone.localtime(parsed)


def _parse_api_time(value):
    parsed = parse_time(value)

    if parsed is None:
        raise AppointmentAvailabilityError(
            "기본 진료시간 형식이 올바르지 않습니다."
        )

    return parsed


def _build_local_datetime(
    target_date,
    target_time,
):
    value = datetime.combine(
        target_date,
        target_time,
    )

    return timezone.make_aware(
        value,
        timezone.get_current_timezone(),
    )


def _overlaps(
    start_at,
    end_at,
    blocked_start,
    blocked_end,
):
    return (
        start_at < blocked_end
        and end_at > blocked_start
    )


def build_available_slots(
    *,
    doctor_id,
    start_date,
    end_date,
):
    schedule_data = fetch_doctor_availability(
        doctor_id=doctor_id,
        start_date=start_date,
        end_date=end_date,
    )

    weekly_availability = [
        {
            "weekday": weekday,
            "start_time": "09:00:00",
            "end_time": "18:00:00",
            "enabled": True,
        }
        for weekday in range(5)
    ]
    unavailable_data = schedule_data.get(
        "unavailable",
        [],
    )

    slot_capacity = schedule_data.get("slot_capacity", 5)

    if not isinstance(
        weekly_availability,
        list,
    ) or not isinstance(
        unavailable_data,
        list,
    ) or not isinstance(slot_capacity, int) or isinstance(slot_capacity, bool) or slot_capacity < 1:
        raise AppointmentAvailabilityError(
            "의료진 일정 응답 형식이 올바르지 않습니다."
        )

    unavailable_ranges = [
        (
            _parse_api_datetime(
                item["start_at"]
            ),
            _parse_api_datetime(
                item["end_at"]
            ),
        )
        for item in unavailable_data
    ]

    booked_times = list(
        Appointment.objects.filter(
            doctor_id=doctor_id,
            scheduled_at__date__gte=start_date,
            scheduled_at__date__lte=end_date,
            appointment_status__in=[
                (
                    Appointment
                    .AppointmentStatus
                    .REQUESTED
                ),
                (
                    Appointment
                    .AppointmentStatus
                    .CONFIRMED
                ),
            ],
        ).values_list(
            "scheduled_at",
            flat=True,
        )
    )

    booked_ranges = [
        (
            timezone.localtime(booked_at),
            (
                timezone.localtime(booked_at)
                + timedelta(
                    minutes=SLOT_MINUTES
                )
            ),
        )
        for booked_at in booked_times
    ]

    now = timezone.localtime()
    date_results = []
    target_date = start_date

    while target_date <= end_date:
        slots = []

        day_ranges = [
            availability
            for availability
            in weekly_availability
            if (
                availability.get("enabled", True)
                and availability.get("weekday")
                == target_date.weekday()
            )
        ]

        for day_range in day_ranges:
            range_start = _build_local_datetime(
                target_date,
                _parse_api_time(
                    day_range["start_time"]
                ),
            )
            range_end = _build_local_datetime(
                target_date,
                _parse_api_time(
                    day_range["end_time"]
                ),
            )

            slot_start = range_start

            while (
                slot_start
                + timedelta(
                    minutes=SLOT_MINUTES
                )
                <= range_end
            ):
                slot_end = (
                    slot_start
                    + timedelta(
                        minutes=SLOT_MINUTES
                    )
                )

                is_unavailable = any(
                    _overlaps(
                        slot_start,
                        slot_end,
                        blocked_start,
                        blocked_end,
                    )
                    for (
                        blocked_start,
                        blocked_end,
                    ) in unavailable_ranges
                )

                booked_count = sum(
                    _overlaps(
                        slot_start,
                        slot_end,
                        booked_start,
                        booked_end,
                    )
                    for (
                        booked_start,
                        booked_end,
                    ) in booked_ranges
                )

                remaining_count = max(slot_capacity - booked_count, 0)

                if (
                    slot_start > now
                    and not is_unavailable
                ):
                    slots.append(
                        {
                            "start_at": slot_start.isoformat(),
                            "capacity": slot_capacity,
                            "booked_count": booked_count,
                            "remaining_count": remaining_count,
                        }
                    )

                slot_start = slot_end

        date_results.append(
            {
                "date": (
                    target_date.isoformat()
                ),
                "slots": sorted(slots, key=lambda item: item["start_at"]),
            }
        )

        target_date += timedelta(days=1)

    return {
        "doctor_id": str(doctor_id),
        "start": start_date.isoformat(),
        "end": end_date.isoformat(),
        "slot_minutes": SLOT_MINUTES,
        "slot_capacity": slot_capacity,
        "dates": date_results,
    }


def is_appointment_slot_available(
    *,
    doctor_id,
    scheduled_at,
):
    local_scheduled_at = timezone.localtime(
        scheduled_at
    )
    target_date = local_scheduled_at.date()

    availability = build_available_slots(
        doctor_id=doctor_id,
        start_date=target_date,
        end_date=target_date,
    )

    requested_value = (
        local_scheduled_at
        .replace(
            second=0,
            microsecond=0,
        )
        .isoformat()
    )

    return any(
        slot["start_at"] == requested_value
        and slot["remaining_count"] > 0
        for date_item in availability["dates"]
        for slot in date_item["slots"]
    )
