from datetime import date
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import DoctorDashboardMemo, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.cases.services.case_assistant import (
    CaseAssistantServiceError,
    build_dashboard_context,
    dashboard_case_references,
)
from apps.patients.models import Patient


class DoctorDashboardAssistantTests(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="Dashboard Hospital", code="DASH-HOSP")
        department = Department.objects.create(
            hospital=self.hospital,
            code="PULMONOLOGY",
            name="Pulmonology",
        )
        role = DepartmentRole.objects.create(
            department=department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="Doctor",
        )
        self.doctor = User.objects.create_user(
            login_id="dashboard-doctor",
            password="test",
            name="Dashboard Doctor",
            department_role=role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.other_doctor = User.objects.create_user(
            login_id="other-dashboard-doctor",
            password="test",
            name="Other Doctor",
            department_role=role,
            account_status=User.AccountStatus.ACTIVE,
        )
        patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="DASH-PATIENT",
            name="환자 A",
            birth_date=date(1970, 1, 1),
            sex=Patient.Sex.FEMALE,
            phone_number="010-0000-0000",
            phone_number_hash="dashboard-patient",
        )
        self.case = LungCancerCase.objects.create(
            patient=patient,
            case_code="RADPT0002",
            primary_doctor=self.doctor,
            current_stage=WorkflowStage.CT,
        )
        ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.CT,
            requesting_doctor=self.doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="CT",
            status=ExaminationOrder.Status.SCHEDULED,
        )
        token = AccessToken.for_user(self.doctor)
        token["hospital_id"] = str(self.hospital.id)
        token["department_id"] = str(department.id)
        token["department_code"] = department.code
        token["role"] = role.role
        self.client = APIClient()
        self.client.force_authenticate(user=self.doctor, token=token)
        self.url = reverse("doctor-dashboard-assistant")
        self.memo_url = reverse("doctor-dashboard-memo", kwargs={"case_id": self.case.id})

    def test_context_contains_only_assigned_active_hospital_cases_and_minimal_fields(self):
        other_patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="OTHER-PATIENT",
            name="환자 B",
            birth_date=date(1980, 1, 1),
            sex=Patient.Sex.MALE,
            phone_number="010-0000-0001",
            phone_number_hash="other-dashboard-patient",
        )
        LungCancerCase.objects.create(
            patient=other_patient,
            case_code="OTHER0001",
            primary_doctor=self.other_doctor,
            current_stage=WorkflowStage.XRAY,
        )

        context = build_dashboard_context(self.doctor, str(self.hospital.id))

        self.assertEqual(context["summary"]["active_case_count"], 1)
        self.assertEqual(context["cases"][0]["case_code"], "RADPT0002")
        self.assertEqual(context["cases"][0]["attention_category"], "RESULT_WAITING")
        self.assertNotIn("id", context["cases"][0])
        self.assertNotIn("patient_code", context["cases"][0])

    @patch("apps.cases.views.ask_dashboard_assistant")
    def test_endpoint_passes_dashboard_scope_context_and_returns_validated_references(self, ask):
        ask.return_value = {
            "answer": "RADPT0002 — CT 검사 결과 대기",
            "context_used": ["summary", "cases"],
        }

        response = self.client.post(
            self.url,
            {"message": "결과 대기 Case", "history": []},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        context = ask.call_args.args[0]
        self.assertEqual([item["case_code"] for item in context["cases"]], ["RADPT0002"])
        self.assertEqual(response.data["case_references"][0]["case_code"], "RADPT0002")
        self.assertNotIn("id", response.data["case_references"][0])

    @patch("apps.cases.views.ask_dashboard_assistant")
    def test_ai_failure_is_a_non_mutating_bad_gateway_response(self, ask):
        ask.side_effect = CaseAssistantServiceError("Genkit unavailable")

        response = self.client.post(self.url, {"message": "오늘 확인할 Case"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(LungCancerCase.objects.get(pk=self.case.pk).current_stage, WorkflowStage.CT)

    @patch("apps.cases.views.ask_case_assistant")
    def test_existing_case_assistant_endpoint_remains_available(self, ask):
        ask.return_value = {"answer": "기존 Case 답변", "context_used": ["case"]}

        response = self.client.post(
            reverse("doctor-case-assistant", kwargs={"case_id": self.case.id}),
            {"message": "현재 상태", "history": []},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["answer"], "기존 Case 답변")
        self.assertEqual(response.data["case_id"], str(self.case.id))

    def test_reference_resolution_ignores_unknown_or_unmentioned_case_codes(self):
        context = build_dashboard_context(self.doctor, str(self.hospital.id))

        self.assertEqual(dashboard_case_references("UNKNOWN0001", context), [])
        self.assertEqual(
            dashboard_case_references("RADPT0002 상태입니다.", context)[0]["case_code"],
            "RADPT0002",
        )

    def test_dashboard_memo_is_saved_per_doctor_and_case(self):
        self.assertEqual(self.client.get(self.memo_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get(self.memo_url).data["content"], "")

        response = self.client.put(self.memo_url, {"content": "CT 결과를 확인합니다."}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["content"], "CT 결과를 확인합니다.")
        self.assertEqual(DoctorDashboardMemo.objects.get(case=self.case, author=self.doctor).content, "CT 결과를 확인합니다.")

        response = self.client.put(self.memo_url, {"content": "수정된 메모"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(DoctorDashboardMemo.objects.filter(case=self.case, author=self.doctor).count(), 1)
        self.assertEqual(response.data["content"], "수정된 메모")

    def test_dashboard_memo_cannot_be_read_or_written_by_another_doctor(self):
        token = AccessToken.for_user(self.other_doctor)
        token["hospital_id"] = str(self.hospital.id)
        token["department_code"] = "PULMONOLOGY"
        token["role"] = "DOCTOR"
        self.client.force_authenticate(user=self.other_doctor, token=token)

        self.assertEqual(self.client.get(self.memo_url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            self.client.put(self.memo_url, {"content": "다른 의사 메모"}, format="json").status_code,
            status.HTTP_404_NOT_FOUND,
        )
