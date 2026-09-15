from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import AiAnalysis, AiResult, ModelVersion, XrayAiResult
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import Patient
from apps.radiology.tasks import run_xray_analysis


PREDICTION = {
    "model_revision": "xray-v1",
    "image": {"width": 1024, "height": 1024},
    "classification": {
        "prediction": "Suspicious Lung Cancer",
        "class_index": 2,
        "assessment": "SUSPICIOUS",
        "suspicion_score": 0.461561918258667,
        "probabilities": {
            "Normal": 0.23258483409881592,
            "Other Lung Disease": 0.3058532774448395,
            "Suspicious Lung Cancer": 0.461561918258667,
        },
    },
    "detections": [
        {
            "class_id": 9,
            "class_name": "Fracture",
            "score": 0.8192880749702454,
            "bbox_xyxy": [238.4, 364.4, 288.1, 441.9],
        }
    ],
}


class XrayAnalysisTaskTestCase(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="Task Hospital", code="XRAY-TASK")
        department = Department.objects.create(
            hospital=hospital, code="RADIOLOGY", name="Radiology"
        )
        role = DepartmentRole.objects.create(
            department=department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="Doctor",
        )
        doctor = User.objects.create_user(
            login_id="xray-task-doctor",
            password="test-password",
            name="Doctor",
            department_role=role,
        )
        patient = Patient.objects.create(
            hospital=hospital,
            patient_code="XRAY-TASK-001",
            name="Task Patient",
            birth_date=date(1960, 1, 1),
            sex=Patient.Sex.MALE,
            phone_number="010-0000-0000",
            phone_number_hash="xray-task-patient",
        )
        case = LungCancerCase.objects.create(
            patient=patient,
            case_code="XRAY-TASK-CASE",
            primary_doctor=doctor,
            current_stage=WorkflowStage.XRAY,
        )
        order = ExaminationOrder.objects.create(
            case=case,
            order_type=ExaminationOrder.OrderType.XRAY,
            requesting_doctor=doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="X-ray task test",
            status=ExaminationOrder.Status.ORDERED,
        )
        self.asset = CaseImageAsset.objects.create(
            case=case,
            examination_order=order,
            workflow_stage=WorkflowStage.XRAY,
            image_type=CaseImageAsset.ImageType.XRAY,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gs://test-bucket/xray/task.png",
            file_format="PNG",
            status=CaseImageAsset.Status.READY,
        )
        model_version = ModelVersion.objects.create(
            model_name="xray-task-model",
            version="1.0",
            analysis_type="XRAY_ANALYSIS",
        )
        self.analysis = AiAnalysis.objects.create(
            case=case,
            source_image_asset=self.asset,
            analysis_type="XRAY_ANALYSIS",
            model_version=model_version,
            status=AiAnalysis.Status.PENDING,
        )

    @patch("apps.radiology.tasks.request_xray_prediction", return_value=PREDICTION)
    @patch("apps.radiology.tasks.download_xray_image_bytes", return_value=b"fake-png-bytes")
    def test_success_persists_full_result_and_xray_detail(self, download, infer):
        self.assertEqual(run_xray_analysis(str(self.analysis.id)), "succeeded")

        download.assert_called_once_with(self.asset.storage_uri)
        infer.assert_called_once_with(b"fake-png-bytes")
        self.analysis.refresh_from_db()
        result = AiResult.objects.get(ai_analysis=self.analysis)
        detail = XrayAiResult.objects.get(ai_result=result)
        self.assertEqual(self.analysis.status, AiAnalysis.Status.SUCCEEDED)
        self.assertIsNotNone(self.analysis.started_at)
        self.assertIsNotNone(self.analysis.completed_at)
        self.assertIsNone(self.analysis.error_message)
        self.assertEqual(result.schema_version, "xray-v1")
        self.assertEqual(result.result_payload, PREDICTION)
        self.assertEqual(result.result_files, [])
        self.assertEqual(detail.assessment, XrayAiResult.Assessment.SUSPICIOUS)
        self.assertEqual(detail.suspicion_score, Decimal("0.4616"))

    @patch("apps.radiology.tasks.request_xray_prediction")
    @patch("apps.radiology.tasks.download_xray_image_bytes", side_effect=RuntimeError("storage unavailable"))
    def test_gcs_failure_marks_analysis_failed_without_results(self, download, infer):
        self.assertEqual(run_xray_analysis(str(self.analysis.id)), "failed")

        download.assert_called_once_with(self.asset.storage_uri)
        infer.assert_not_called()
        self.analysis.refresh_from_db()
        self.assertEqual(self.analysis.status, AiAnalysis.Status.FAILED)
        self.assertIsNotNone(self.analysis.completed_at)
        self.assertTrue(self.analysis.error_message)
        self.assertFalse(AiResult.objects.filter(ai_analysis=self.analysis).exists())
        self.assertEqual(XrayAiResult.objects.count(), 0)

    @patch("apps.radiology.tasks.request_xray_prediction", side_effect=RuntimeError("inference unavailable"))
    @patch("apps.radiology.tasks.download_xray_image_bytes", return_value=b"fake-png-bytes")
    def test_inference_failure_marks_analysis_failed_without_results(self, download, infer):
        self.assertEqual(run_xray_analysis(str(self.analysis.id)), "failed")

        download.assert_called_once_with(self.asset.storage_uri)
        infer.assert_called_once_with(b"fake-png-bytes")
        self.analysis.refresh_from_db()
        self.assertEqual(self.analysis.status, AiAnalysis.Status.FAILED)
        self.assertIsNotNone(self.analysis.completed_at)
        self.assertTrue(self.analysis.error_message)
        self.assertFalse(AiResult.objects.filter(ai_analysis=self.analysis).exists())

    @patch("apps.radiology.tasks.request_xray_prediction")
    @patch("apps.radiology.tasks.download_xray_image_bytes")
    def test_duplicate_execution_does_not_create_or_call_again(self, download, infer):
        result = AiResult.objects.create(
            ai_analysis=self.analysis,
            schema_version="xray-v1",
            result_payload=PREDICTION,
            result_files=[],
        )
        XrayAiResult.objects.create(
            ai_result=result,
            assessment=XrayAiResult.Assessment.SUSPICIOUS,
            suspicion_score="0.4616",
        )

        self.assertEqual(run_xray_analysis(str(self.analysis.id)), "already_completed")
        download.assert_not_called()
        infer.assert_not_called()
        self.assertEqual(AiResult.objects.filter(ai_analysis=self.analysis).count(), 1)
        self.assertEqual(XrayAiResult.objects.filter(ai_result=result).count(), 1)
