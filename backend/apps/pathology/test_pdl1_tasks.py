from datetime import date
from unittest.mock import patch

from django.test import TestCase

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import AiAnalysis, AiResult, ModelVersion, PDL1AiResult
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import Patient
from apps.pathology.tasks import run_pdl1_analysis


PREDICTION = {
    "model_revision": "final_model", "model_sha256": "abc123", "main_index": "case-patient",
    "pdl1_image_id": "asset", "patch_count": 99, "predicted_class": 2,
    "predicted_tps_range": "GE_50", "predicted_tps_range_label": ">=50%",
    "confidence": 0.9886972904205322,
    "probabilities": {"class_0": 0.000187133, "class_1": 0.011115523, "class_2": 0.988697344},
    "preprocessing": {"tile_size": 224},
}


class PDL1AnalysisTaskTestCase(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="PDL1 Task Hospital", code="PDL1-TASK")
        department = Department.objects.create(hospital=hospital, code="PATHOLOGY", name="Pathology")
        role = DepartmentRole.objects.create(department=department, role=DepartmentRole.Role.TECHNOLOGIST, display_name="Technologist")
        doctor = User.objects.create_user(login_id="pdl1-task-user", password="test-password", name="Technologist", department_role=role)
        patient = Patient.objects.create(hospital=hospital, patient_code="PDL1-TASK-001", name="Task Patient", birth_date=date(1960, 1, 1), sex=Patient.Sex.FEMALE, phone_number="010-0000-0000", phone_number_hash="pdl1-task-patient")
        case = LungCancerCase.objects.create(patient=patient, case_code="PDL1-TASK-CASE", primary_doctor=doctor, current_stage=WorkflowStage.PDL1)
        order = ExaminationOrder.objects.create(case=case, order_type=ExaminationOrder.OrderType.PDL1, requesting_doctor=doctor, priority=ExaminationOrder.Priority.NORMAL, purpose="PD-L1 task test", status=ExaminationOrder.Status.ORDERED)
        model_version = ModelVersion.objects.create(model_name="pdl1-amd-mil", version="final_model", analysis_type="PDL1_ANALYSIS")
        asset = CaseImageAsset.objects.create(case=case, examination_order=order, workflow_stage=WorkflowStage.PDL1, image_type=CaseImageAsset.ImageType.WSI, storage_type=CaseImageAsset.StorageType.GCS, storage_uri="gs://test-bucket/pathology/pdl1/wsi.svs", file_format="SVS", status=CaseImageAsset.Status.READY, metadata={"pdl1_annotation": {"storage_uri": "gs://test-bucket/pathology/pdl1/input.annotations", "roi_layer": "Tumor"}})
        self.analysis = AiAnalysis.objects.create(case=case, examination_order=order, analysis_type="PDL1_ANALYSIS", model_version=model_version, source_image_asset=asset, status=AiAnalysis.Status.PENDING, input_metadata={"roi_layer": "Tumor"})

    @patch("apps.pathology.tasks.request_pdl1_prediction", return_value=PREDICTION)
    @patch("apps.pathology.tasks.download_pdl1_annotation_bytes", return_value=b"<Annotations />")
    def test_success_reads_uploaded_annotation_and_persists_three_class_result(self, download, infer):
        self.assertEqual(run_pdl1_analysis(str(self.analysis.id)), "succeeded")
        download.assert_called_once_with("gs://test-bucket/pathology/pdl1/input.annotations")
        infer.assert_called_once_with(wsi_gcs_uri="gs://test-bucket/pathology/pdl1/wsi.svs", annotation_content=b"<Annotations />", roi_layer="Tumor", main_index=str(self.analysis.case.patient_id), pdl1_image_id=str(self.analysis.source_image_asset_id))
        self.analysis.refresh_from_db()
        result = AiResult.objects.get(ai_analysis=self.analysis)
        detail = PDL1AiResult.objects.get(ai_result=result)
        self.assertEqual(self.analysis.status, AiAnalysis.Status.SUCCEEDED)
        self.assertEqual(detail.predicted_tps_range, PDL1AiResult.TpsRange.GE_50)
        self.assertEqual(result.result_payload["preprocessing"], PREDICTION["preprocessing"])
        self.assertNotIn("tps_percent", result.result_payload)

    @patch("apps.pathology.tasks.download_pdl1_annotation_bytes", side_effect=RuntimeError("GCS unavailable"))
    def test_annotation_failure_marks_analysis_failed_without_a_result(self, download):
        self.assertEqual(run_pdl1_analysis(str(self.analysis.id)), "failed")
        self.analysis.refresh_from_db()
        self.assertEqual(self.analysis.status, AiAnalysis.Status.FAILED)
        self.assertFalse(AiResult.objects.filter(ai_analysis=self.analysis).exists())

    @patch("apps.pathology.tasks.request_pdl1_prediction")
    @patch("apps.pathology.tasks.download_pdl1_annotation_bytes")
    def test_existing_result_prevents_another_external_call(self, download, infer):
        result = AiResult.objects.create(ai_analysis=self.analysis, schema_version="pdl1-v1", result_payload={})
        PDL1AiResult.objects.create(ai_result=result, predicted_class=0, predicted_tps_range="LT_1", confidence="0.9", probabilities={"class_0": 0.9, "class_1": 0.05, "class_2": 0.05})
        self.assertEqual(run_pdl1_analysis(str(self.analysis.id)), "already_completed")
        download.assert_not_called()
        infer.assert_not_called()
