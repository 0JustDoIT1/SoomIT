from datetime import datetime, time

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User

from .models import DoctorSchedule, DoctorWeeklyAvailability


class DoctorSchedulingAPITests(TestCase):
    def setUp(self):
        self.doctor = User.objects.create_user(
            login_id="schedule-doctor", password="test", name="Schedule doctor",
            account_status=User.AccountStatus.ACTIVE,
        )
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(self.doctor).access_token}")

    def test_doctor_can_manage_multiple_weekly_intervals(self):
        url = reverse("doctor-weekly-availability-list")
        morning = self.client.post(url, {"weekday": 0, "start_time": "09:00", "end_time": "12:00", "slot_minutes": 30, "enabled": True}, format="json")
        afternoon = self.client.post(url, {"weekday": 0, "start_time": "13:00", "end_time": "17:00", "slot_minutes": 30, "enabled": True}, format="json")
        self.assertEqual(morning.status_code, 201)
        self.assertEqual(afternoon.status_code, 201)
        self.assertEqual(DoctorWeeklyAvailability.objects.filter(doctor=self.doctor, weekday=0).count(), 2)

    def test_patient_lookup_excludes_extra_available(self):
        DoctorWeeklyAvailability.objects.create(doctor=self.doctor, weekday=0, start_time=time(9), end_time=time(12), slot_minutes=30)
        start = timezone.make_aware(datetime(2026, 9, 21, 9))
        end = timezone.make_aware(datetime(2026, 9, 21, 12))
        DoctorSchedule.objects.create(doctor=self.doctor, schedule_type=DoctorSchedule.ScheduleType.UNAVAILABLE, start_at=start, end_at=end, reason="leave")
        DoctorSchedule.objects.create(doctor=self.doctor, schedule_type=DoctorSchedule.ScheduleType.EXTRA_AVAILABLE, start_at=start, end_at=end, reason="excluded")
        url = reverse("doctor-appointment-availability", kwargs={"doctor_id": self.doctor.id})
        response = self.client.get(url, {"start": "2026-09-21", "end": "2026-09-21"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["weekly_availability"]), 1)
        self.assertEqual(len(response.data["unavailable"]), 1)
        self.assertEqual(response.data["unavailable"][0]["reason"], "leave")
