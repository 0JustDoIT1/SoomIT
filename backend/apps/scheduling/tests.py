from datetime import datetime, time

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.patients.models import Appointment, Patient

from .models import DoctorSchedule, DoctorWeeklyAvailability


class DoctorSchedulingAPITests(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="Scheduling Clinic", code="SCHEDULING-CLINIC")
        department = Department.objects.create(hospital=hospital, code="PULMONOLOGY", name="Pulmonology")
        role = DepartmentRole.objects.create(department=department, role=DepartmentRole.Role.DOCTOR, display_name="Doctor")
        self.doctor = User.objects.create_user(
            login_id="schedule-doctor", password="test", name="Schedule doctor",
            account_status=User.AccountStatus.ACTIVE, department_role=role,
        )
        self.hospital = hospital
        self.client = APIClient()
        token = RefreshToken.for_user(self.doctor)
        token["role"] = role.role
        token["department_id"] = str(department.id)
        token["department_code"] = department.code
        token["hospital_id"] = str(hospital.id)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

    def test_doctor_can_manage_multiple_weekly_intervals(self):
        url = reverse("doctor-weekly-availability-list")
        morning = self.client.post(url, {"weekday": 0, "start_time": "09:00", "end_time": "12:00", "slot_minutes": 30, "enabled": True}, format="json")
        afternoon = self.client.post(url, {"weekday": 0, "start_time": "13:00", "end_time": "17:00", "slot_minutes": 30, "enabled": True}, format="json")
        self.assertEqual(morning.status_code, 201)
        self.assertEqual(afternoon.status_code, 201)
        self.assertEqual(DoctorWeeklyAvailability.objects.filter(doctor=self.doctor, weekday=0).count(), 2)

    def test_overlapping_weekly_interval_is_rejected(self):
        DoctorWeeklyAvailability.objects.create(
            doctor=self.doctor, weekday=0, start_time=time(9), end_time=time(12), slot_minutes=30
        )
        response = self.client.post(
            reverse("doctor-weekly-availability-list"),
            {"weekday": 0, "start_time": "11:30", "end_time": "13:00", "enabled": True},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("start_time", response.data)

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

    def test_slot_capacity_is_fixed_at_five_for_doctor_and_patient_availability(self):
        settings_url = reverse("doctor-appointment-settings")
        default_response = self.client.get(settings_url)
        self.assertEqual(default_response.status_code, 200)
        self.assertEqual(default_response.data["slot_capacity"], 5)
        updated_response = self.client.patch(settings_url, {"slot_capacity": 7}, format="json")
        self.assertEqual(updated_response.status_code, 405)

        availability_response = self.client.get(
            reverse("doctor-appointment-availability", kwargs={"doctor_id": self.doctor.id})
        )
        self.assertEqual(availability_response.status_code, 200)
        self.assertEqual(availability_response.data["slot_capacity"], 5)

    @override_settings(PATIENT_APP_SERVICE_TOKEN="patient-app-test-token")
    def test_patient_app_service_can_read_availability_without_staff_jwt(self):
        DoctorWeeklyAvailability.objects.create(
            doctor=self.doctor, weekday=1, start_time=time(9), end_time=time(12), slot_minutes=30
        )
        unauthenticated_client = APIClient()
        url = reverse("doctor-appointment-availability", kwargs={"doctor_id": self.doctor.id})
        denied = unauthenticated_client.get(url)
        self.assertEqual(denied.status_code, 401)
        response = unauthenticated_client.get(url, HTTP_X_SERVICE_TOKEN="patient-app-test-token")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["weekly_availability"][0]["slot_minutes"], 30)

    def test_doctor_appointment_feed_returns_only_own_active_appointments(self):
        patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="SCHEDULE-PATIENT",
            name="Scheduled Patient",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="010-0000-0000",
            phone_number_hash="schedule-patient",
        )
        other_doctor = User.objects.create_user(
            login_id="other-schedule-doctor", password="test", name="Other doctor",
            account_status=User.AccountStatus.ACTIVE, department_role=self.doctor.department_role,
        )
        own = Appointment.objects.create(
            patient=patient,
            doctor=self.doctor,
            scheduled_at=timezone.make_aware(datetime(2026, 10, 1, 9)),
            appointment_status=Appointment.AppointmentStatus.REQUESTED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.PATIENT,
        )
        Appointment.objects.create(
            patient=patient,
            doctor=other_doctor,
            scheduled_at=timezone.make_aware(datetime(2026, 10, 1, 10)),
            appointment_status=Appointment.AppointmentStatus.CONFIRMED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.PATIENT,
        )
        Appointment.objects.create(
            patient=patient,
            doctor=self.doctor,
            scheduled_at=timezone.make_aware(datetime(2026, 10, 1, 11)),
            appointment_status=Appointment.AppointmentStatus.CANCELLED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.PATIENT,
        )

        response = self.client.get(reverse("doctor-appointment-list"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [str(own.id)])
        self.assertEqual(response.data[0]["appointment_status"], "REQUESTED")
