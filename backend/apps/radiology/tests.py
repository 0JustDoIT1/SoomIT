from datetime import date, timedelta

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import AiAnalysis, AiResult, ModelVersion
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, Stage
from apps.clinical.models import ClinicalResult
from apps.patients.models import Appointment, Patient


@override_settings(SOOMIT_RADIOLOGY_DEPARTMENT_CODE="RADIOLOGY")
class RadiologyWorklistAPITestCase(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="테스트병원", code="TEST-HOSPITAL")
        self.other_hospital = Hospital.objects.create(name="다른병원", code="OTHER-HOSPITAL")
        self.department = Department.objects.create(
            hospital=self.hospital,
            code="RADIOLOGY",
            name="영상의학과",
        )
        self.other_department = Department.objects.create(
            hospital=self.other_hospital,
            code="RADIOLOGY",
            name="영상의학과",
        )
        self.pathology_department = Department.objects.create(
            hospital=self.hospital,
            code="PATHOLOGY",
            name="병리과",
        )
        self.radiology_role = DepartmentRole.objects.create(
            department=self.department,
            role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="방사선사",
        )
        self.other_radiology_role = DepartmentRole.objects.create(
            department=self.other_department,
            role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="방사선사",
        )
        self.pathology_role = DepartmentRole.objects.create(
            department=self.pathology_department,
            role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="임상병리사",
        )
        self.doctor_role = DepartmentRole.objects.create(
            department=self.department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="의사",
        )
        self.user = self._create_user("radiology", self.radiology_role)
        self.other_user = self._create_user("other-radiology", self.other_radiology_role)
        self.pathology_user = self._create_user("pathology", self.pathology_role)
        self.doctor = self._create_user("doctor", self.doctor_role)
        self.patient = self._create_patient(self.hospital, "P001")
        self.other_patient = self._create_patient(self.other_hospital, "P001")
        self.case = self._create_case(self.patient, "CASE-001")
        self.other_case = self._create_case(self.other_patient, "CASE-OTHER")
        self.order = self._create_order(self.case)
        self.other_order = self._create_order(self.other_case)
        self.model_version = ModelVersion.objects.create(
            model_name="xray-model",
            version="1.0",
            analysis_type="XRAY_SCREENING",
        )
        self.url = reverse("radiology:worklist")
        self._authenticate(self.user, self.hospital)

    def _create_user(self, login_id, department_role, account_status=User.AccountStatus.ACTIVE):
        return User.objects.create_user(
            login_id=login_id,
            password="test-password",
            name=login_id,
            department_role=department_role,
            account_status=account_status,
        )

    def _create_patient(self, hospital, patient_code):
        return Patient.objects.create(
            hospital=hospital,
            patient_code=patient_code,
            name=f"환자-{patient_code}",
            birth_date=date(1960, 1, 1),
            sex=Patient.Sex.MALE,
            phone_number="010-0000-0000",
            phone_number_hash=f"hash-{hospital.id}-{patient_code}",
        )

    def _create_case(self, patient, case_code):
        return LungCancerCase.objects.create(
            patient=patient,
            case_code=case_code,
            primary_doctor=self.doctor,
            current_stage=Stage.XRAY,
        )

    def _create_order(self, case, **overrides):
        values = {
            "case": case,
            "exam_type": ExaminationOrder.ExamType.XRAY,
            "requesting_doctor": self.doctor,
            "priority": ExaminationOrder.Priority.NORMAL,
            "purpose": "흉부 영상 검사",
            "status": ExaminationOrder.Status.ORDERED,
        }
        values.update(overrides)
        return ExaminationOrder.objects.create(**values)

    def _create_asset(self, order, **overrides):
        values = {
            "case": order.case,
            "examination_order": order,
            "uploaded_stage": Stage.XRAY,
            "image_type": CaseImageAsset.ImageType.XRAY,
            "storage_type": CaseImageAsset.StorageType.ORTHANC,
            "storage_uri": f"orthanc://studies/{order.id}-{CaseImageAsset.objects.count()}",
            "file_format": "DICOM",
            "status": CaseImageAsset.Status.READY,
        }
        values.update(overrides)
        return CaseImageAsset.objects.create(**values)

    def _create_analysis(self, asset, status_value):
        return AiAnalysis.objects.create(
            case=asset.case,
            source_image_asset=asset,
            analysis_type="XRAY_SCREENING",
            model_version=self.model_version,
            status=status_value,
        )

    def _authenticate(self, user, hospital, department_code="RADIOLOGY", role="TECHNOLOGIST"):
        token = AccessToken.for_user(user)
        token["hospital_id"] = str(hospital.id)
        token["department_id"] = str(user.department_role.department_id)
        token["department_code"] = department_code
        token["role"] = role
        self.client.force_authenticate(user=user, token=token)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None, token=None)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_requires_active_radiology_technologist(self):
        cases = [
            (self.pathology_user, self.hospital, "PATHOLOGY", "TECHNOLOGIST"),
            (self.doctor, self.hospital, "RADIOLOGY", "DOCTOR"),
        ]
        for user, hospital, department_code, role in cases:
            with self.subTest(user=user.login_id):
                self._authenticate(user, hospital, department_code, role)
                response = self.client.get(self.url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_staff_is_denied(self):
        inactive = self._create_user(
            "inactive-radiology",
            self.radiology_role,
            User.AccountStatus.DISABLED,
        )
        self._authenticate(inactive, self.hospital)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_hospital_claim_is_denied(self):
        token = AccessToken.for_user(self.user)
        token["department_id"] = str(self.department.id)
        token["department_code"] = "RADIOLOGY"
        token["role"] = "TECHNOLOGIST"
        self.client.force_authenticate(user=self.user, token=token)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_filters_worklist_by_token_hospital(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["examination_order"]["id"], str(self.order.id))

    def test_filters_and_validates_query_parameters(self):
        self.order.exam_type = ExaminationOrder.ExamType.CT
        self.order.priority = ExaminationOrder.Priority.URGENT
        self.order.status = ExaminationOrder.Status.SCHEDULED
        self.order.save(update_fields=["exam_type", "priority", "status", "updated_at"])
        response = self.client.get(
            self.url,
            {"exam_type": "CT", "priority": "URGENT", "status": "SCHEDULED"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        invalid = self.client.get(self.url, {"exam_type": "PET_CT"})
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        reversed_dates = self.client.get(
            self.url,
            {"date_from": "2026-09-11", "date_to": "2026-09-10"},
        )
        self.assertEqual(reversed_dates.status_code, status.HTTP_400_BAD_REQUEST)

    def test_date_filter_and_representative_schedule_exclude_cancelled(self):
        now = timezone.now()
        Appointment.objects.create(
            patient=self.patient,
            case=self.case,
            examination_order=self.order,
            doctor=self.doctor,
            scheduled_at=now + timedelta(days=3),
            appointment_status=Appointment.AppointmentStatus.CANCELLED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.DOCTOR_ORDER,
        )
        expected = Appointment.objects.create(
            patient=self.patient,
            case=self.case,
            examination_order=self.order,
            doctor=self.doctor,
            scheduled_at=now + timedelta(days=1),
            appointment_status=Appointment.AppointmentStatus.CONFIRMED,
            visit_status=Appointment.VisitStatus.SCHEDULED,
            created_by_type=Appointment.CreatedByType.DOCTOR_ORDER,
        )
        response = self.client.get(
            self.url,
            {"date_from": expected.scheduled_at.date(), "date_to": expected.scheduled_at.date()},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        expected_value = response.renderer_context["view"].get_serializer().fields[
            "scheduled_at"
        ].to_representation(expected.scheduled_at)
        self.assertEqual(response.data[0]["scheduled_at"], expected_value)

    def test_latest_asset_analysis_and_count_are_prefetched_summaries(self):
        first_asset = self._create_asset(self.order)
        latest_asset = self._create_asset(self.order)
        analysis = self._create_analysis(first_asset, AiAnalysis.Status.RUNNING)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = response.data[0]
        self.assertEqual(row["image_asset_count"], 2)
        self.assertEqual(row["latest_image_asset"]["id"], str(latest_asset.id))
        self.assertEqual(row["latest_ai_analysis"]["id"], str(analysis.id))
        self.assertEqual(row["workflow_status"], "AI_RUNNING")

    def test_workflow_status_uses_only_current_ai_result_review(self):
        asset = self._create_asset(self.order)
        analysis = self._create_analysis(asset, AiAnalysis.Status.SUCCEEDED)
        ai_result = AiResult.objects.create(
            ai_analysis=analysis,
            schema_version="1.0",
            result_payload={},
        )
        ClinicalResult.objects.create(
            case=self.case,
            stage=Stage.XRAY,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
        )
        pending_response = self.client.get(self.url)
        self.assertEqual(pending_response.data[0]["workflow_status"], "REVIEW_PENDING")

        ClinicalResult.objects.create(
            case=self.case,
            stage=Stage.XRAY,
            reviewed_ai_result=ai_result,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
        )
        completed_response = self.client.get(self.url)
        self.assertEqual(completed_response.data[0]["workflow_status"], "REVIEW_COMPLETED")

    def test_succeeded_without_result_is_read_only_ai_failed_workflow(self):
        asset = self._create_asset(self.order)
        analysis = self._create_analysis(asset, AiAnalysis.Status.SUCCEEDED)
        response = self.client.get(self.url)
        analysis.refresh_from_db()
        self.assertEqual(response.data[0]["workflow_status"], "AI_FAILED")
        self.assertEqual(analysis.status, AiAnalysis.Status.SUCCEEDED)

    def test_workflow_status_fallbacks(self):
        response = self.client.get(self.url)
        self.assertEqual(response.data[0]["workflow_status"], "EXAM_PENDING")

        self.order.status = ExaminationOrder.Status.COMPLETED
        self.order.save(update_fields=["status", "updated_at"])
        response = self.client.get(self.url)
        self.assertEqual(response.data[0]["workflow_status"], "IMAGE_PENDING")

        self._create_asset(self.order)
        response = self.client.get(self.url)
        self.assertEqual(response.data[0]["workflow_status"], "AI_READY")

    def test_cancelled_failed_and_pending_workflow_statuses(self):
        self.order.status = ExaminationOrder.Status.CANCELLED
        self.order.save(update_fields=["status", "updated_at"])
        response = self.client.get(self.url)
        self.assertEqual(response.data[0]["workflow_status"], "CANCELLED")

        self.order.status = ExaminationOrder.Status.COMPLETED
        self.order.save(update_fields=["status", "updated_at"])
        asset = self._create_asset(self.order)
        analysis = self._create_analysis(asset, AiAnalysis.Status.FAILED)
        response = self.client.get(self.url)
        self.assertEqual(response.data[0]["workflow_status"], "AI_FAILED")

        analysis.status = AiAnalysis.Status.PENDING
        analysis.save(update_fields=["status"])
        response = self.client.get(self.url)
        self.assertEqual(response.data[0]["workflow_status"], "AI_RUNNING")

    def test_query_count_does_not_increase_with_rows(self):
        asset = self._create_asset(self.order)
        self._create_analysis(asset, AiAnalysis.Status.RUNNING)
        with CaptureQueriesContext(connection) as one_row_queries:
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        for index in range(3):
            patient = self._create_patient(self.hospital, f"P-EXTRA-{index}")
            case = self._create_case(patient, f"CASE-EXTRA-{index}")
            order = self._create_order(case)
            extra_asset = self._create_asset(order)
            self._create_analysis(extra_asset, AiAnalysis.Status.RUNNING)

        with CaptureQueriesContext(connection) as multiple_row_queries:
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.assertEqual(len(one_row_queries), len(multiple_row_queries))
