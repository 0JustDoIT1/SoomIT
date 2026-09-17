from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Hospital, User
from apps.cases.models import ExaminationOrder, LungCancerCase
from apps.patients.models import Appointment, Patient, PatientAccount
from apps.patients.patient_tokens import issue_patient_tokens


class ExaminationScheduleAPITests(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(
            name="검사 일정 테스트 병원",
            code="EXAM-SCHEDULE-TEST",
        )
        self.doctor = User.objects.create_user(
            login_id="exam-schedule-doctor",
            password="test-password",
            name="검사 담당 의료진",
        )
        self.patient = self._create_patient(
            code="EXAM001",
            phone="01010000001",
        )
        self.patient_account = PatientAccount.objects.create(
            patient=self.patient,
            phone_number="01010000001",
            phone_number_hash="exam-schedule-account-1",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.LINKED,
        )
        self.case = self._create_case(
            patient=self.patient,
            code="EXAM-CASE-001",
        )

        access_token = issue_patient_tokens(
            self.patient_account
        )["access"]
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {access_token}",
        )

    def _create_patient(self, *, code, phone):
        return Patient.objects.create(
            hospital=self.hospital,
            patient_code=code,
            name=f"검사 일정 환자 {code}",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number=phone,
            phone_number_hash=f"patient-{code}",
        )

    def _create_case(self, *, patient, code):
        return LungCancerCase.objects.create(
            patient=patient,
            case_code=code,
            primary_doctor=self.doctor,
            current_stage="XRAY",
        )

    def _create_exam_appointment(
        self,
        *,
        patient,
        case,
        order_type,
        scheduled_at,
        appointment_status=Appointment.AppointmentStatus.CONFIRMED,
        visit_status=Appointment.VisitStatus.SCHEDULED,
    ):
        examination_order = ExaminationOrder.objects.create(
            case=case,
            order_type=order_type,
            requesting_doctor=self.doctor,
            purpose="검사 일정 API 테스트",
            status=ExaminationOrder.Status.SCHEDULED,
        )
        return Appointment.objects.create(
            patient=patient,
            case=case,
            examination_order=examination_order,
            doctor=self.doctor,
            scheduled_at=scheduled_at,
            appointment_status=appointment_status,
            visit_status=visit_status,
            created_by_type=Appointment.CreatedByType.DOCTOR_ORDER,
        )

    def test_returns_only_future_confirmed_scheduled_exams_for_patient(self):
        now = timezone.now()

        included = self._create_exam_appointment(
            patient=self.patient,
            case=self.case,
            order_type=ExaminationOrder.OrderType.XRAY,
            scheduled_at=now + timedelta(days=2),
        )
        self._create_exam_appointment(
            patient=self.patient,
            case=self.case,
            order_type=ExaminationOrder.OrderType.CT,
            scheduled_at=now - timedelta(days=1),
        )
        self._create_exam_appointment(
            patient=self.patient,
            case=self.case,
            order_type=ExaminationOrder.OrderType.PET_CT_TNM,
            scheduled_at=now + timedelta(days=3),
            appointment_status=Appointment.AppointmentStatus.REQUESTED,
        )
        self._create_exam_appointment(
            patient=self.patient,
            case=self.case,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            scheduled_at=now + timedelta(days=4),
            appointment_status=Appointment.AppointmentStatus.CANCELLED,
        )

        other_patient = self._create_patient(
            code="EXAM002",
            phone="01010000002",
        )
        other_case = self._create_case(
            patient=other_patient,
            code="EXAM-CASE-002",
        )
        self._create_exam_appointment(
            patient=other_patient,
            case=other_case,
            order_type=ExaminationOrder.OrderType.PDL1,
            scheduled_at=now + timedelta(days=5),
        )

        response = self.client.get(
            "/api/patients/exam-schedules/",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["id"],
            str(included.id),
        )
        self.assertEqual(
            response.data[0]["order_type"],
            ExaminationOrder.OrderType.XRAY,
        )

    def test_serializes_all_exam_names_and_preparation_guides(self):
        expected_names = {
            ExaminationOrder.OrderType.XRAY:
                "흉부 X-ray 검사",
            ExaminationOrder.OrderType.CT:
                "흉부 CT 검사",
            ExaminationOrder.OrderType.PET_CT_TNM:
                "PET-CT 및 TNM 병기 평가",
            ExaminationOrder.OrderType.PATHOLOGY_GENE:
                "조직·유전자 검사",
            ExaminationOrder.OrderType.PDL1:
                "PD-L1 검사",
        }

        for index, order_type in enumerate(
            expected_names,
            start=1,
        ):
            self._create_exam_appointment(
                patient=self.patient,
                case=self.case,
                order_type=order_type,
                scheduled_at=(
                    timezone.now()
                    + timedelta(days=index)
                ),
            )

        response = self.client.get(
            "/api/patients/exam-schedules/",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(len(response.data), 5)

        items = {
            item["order_type"]: item
            for item in response.data
        }

        for order_type, exam_name in expected_names.items():
            with self.subTest(order_type=order_type):
                self.assertEqual(
                    items[order_type]["exam_name"],
                    exam_name,
                )
                self.assertTrue(
                    items[order_type]["preparation_guide"],
                )
