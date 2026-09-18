from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import AiAnalysis, AiResult, CtAiResult, ModelVersion, NoduleAiResult
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import Patient
from apps.radiology.tasks import _confirmed_histology, run_ct_analysis


PHASE1_PAYLOAD = {
    "status": "READY_FOR_T_MODEL",
    "model_revision": "ct-analysis-v1.0.0",
    "case_id": "case-001",
    "artifact_uri": "gs://soomit-bucket/ct-analysis/case-001/",
    "phase1_result_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/phase1_result.json",
    "t_input_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/t_input/case-001_0000.nii.gz",
    "visualization_manifest_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/visualization/visualization_manifest.json",
    "visualization": {
        "schema_version": "ct-visualization-v1",
        "layers": [
            {
                "id": "N001",
                "category": "NODULE",
                "mesh_relative_path": "nodules/N001.glb",
                "mesh_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/visualization/nodules/N001.glb",
            }
        ],
    },
    "cornerstone_manifest_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/cornerstone/cornerstone_manifest.json",
    "cornerstone_segmentation": {
        "schema_version": "ct-cornerstone-labelmap-v1",
        "scalar_type": "uint8",
        "dimensions": [512, 512, 133],
        "labelmap_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/cornerstone/labelmap.bin",
        "metadata_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/cornerstone/labelmap_metadata.json",
        "geometry_uri": "gs://soomit-bucket/ct-analysis/case-001/phase1/cornerstone/geometry.json",
        "segments": [
            {"segment_index": 1, "id": "N001", "name": "Nodule 1", "category": "NODULE", "color": [255, 59, 48]},
        ],
    },
    "result": {
        "case_id": "case-001",
        "phase": "CT_ANALYSIS_PHASE_1",
        "segmentation": {"mask": "/tmp/seg.nii.gz", "nodule_count": 2},
        "nodules": [
            {
                "nodule_id": "N001",
                "quantification": {"volume_mm3": 120.5, "equivalent_diameter_mm": 6.1},
                "morphology": {"prediction": {"shape": "SPICULATED"}},
                "texture": {"prediction": {"pattern": "SOLID"}},
                "malignancy": {"prediction": {"probability": 0.82, "malignancy_score": 82.0, "prediction": "MALIGNANT"}},
                "patch_metadata": {"morphology_ct": "/tmp/N001_ct.npy"},
            },
            {
                "nodule_id": "N002",
                "quantification": {"volume_mm3": 40.2, "equivalent_diameter_mm": 3.2},
                "morphology": {"prediction": {"shape": "ROUND"}},
                "texture": {"prediction": {"pattern": "GROUND_GLASS"}},
                "malignancy": {"prediction": {"probability": 0.11, "malignancy_score": 11.0, "prediction": "BENIGN"}},
                "patch_metadata": {"morphology_ct": "/tmp/N002_ct.npy"},
            },
        ],
    },
}


class CtAnalysisTaskTestCase(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="CT Task Hospital", code="CT-TASK")
        department = Department.objects.create(
            hospital=hospital, code="RADIOLOGY", name="Radiology"
        )
        role = DepartmentRole.objects.create(
            department=department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="Doctor",
        )
        doctor = User.objects.create_user(
            login_id="ct-task-doctor",
            password="test-password",
            name="Doctor",
            department_role=role,
        )
        patient = Patient.objects.create(
            hospital=hospital,
            patient_code="CT-TASK-001",
            name="Task Patient",
            birth_date=date(1960, 1, 1),
            sex=Patient.Sex.MALE,
            phone_number="010-0000-0001",
            phone_number_hash="ct-task-patient",
        )
        self.case = LungCancerCase.objects.create(
            patient=patient,
            case_code="CT-TASK-CASE",
            primary_doctor=doctor,
            current_stage=WorkflowStage.CT,
        )
        order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.CT,
            requesting_doctor=doctor,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="CT task test",
            status=ExaminationOrder.Status.ORDERED,
        )
        self.asset = CaseImageAsset.objects.create(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.CT,
            image_type=CaseImageAsset.ImageType.CT,
            storage_type=CaseImageAsset.StorageType.ORTHANC,
            storage_uri="orthanc://series/abc123",
            file_format="DICOM",
            series_instance_uid="1.2.3.4.5",
            orthanc_series_id="a" * 40,
            status=CaseImageAsset.Status.READY,
        )
        model_version = ModelVersion.objects.create(
            model_name="ct-task-model",
            version="1.0",
            analysis_type="CT_ANALYSIS",
        )
        self.analysis = AiAnalysis.objects.create(
            case=self.case,
            source_image_asset=self.asset,
            analysis_type="CT_ANALYSIS",
            model_version=model_version,
            status=AiAnalysis.Status.PENDING,
        )

    def test_missing_confirmed_pathology_uses_unknown_histology(self):
        self.assertEqual(_confirmed_histology(self.analysis), "unknown")

    @patch("apps.radiology.tasks.request_ct_phase1_analysis", return_value=PHASE1_PAYLOAD)
    def test_success_persists_full_payload_and_nodules(self, infer):
        self.assertEqual(run_ct_analysis(str(self.analysis.id)), "succeeded")

        infer.assert_called_once_with(
            orthanc_series_id=self.asset.orthanc_series_id,
            case_id=str(self.analysis.case_id),
            output_gcs_uri=(
                "gs://soomit-bucket/ct-analysis/"
                f"{self.case.patient.hospital_id}/{self.case.id}/"
                f"{self.asset.examination_order_id}/{self.analysis.id}"
            ),
            series_instance_uid=self.asset.series_instance_uid,
        )
        self.analysis.refresh_from_db()
        result = AiResult.objects.get(ai_analysis=self.analysis)
        detail = CtAiResult.objects.get(ai_result=result)
        nodules = list(NoduleAiResult.objects.filter(ct_ai_result=detail).order_by("nodule_no"))

        self.assertEqual(self.analysis.status, AiAnalysis.Status.SUCCEEDED)
        self.assertIsNotNone(self.analysis.started_at)
        self.assertIsNotNone(self.analysis.completed_at)
        self.assertIsNone(self.analysis.error_message)
        self.assertEqual(result.schema_version, "ct-phase1-v1")
        self.assertEqual(result.result_payload, PHASE1_PAYLOAD)
        self.assertEqual(len(result.result_files), 7)
        file_types = [item["type"] for item in result.result_files]
        self.assertEqual(
            file_types,
            [
                "artifact_root",
                "phase1_result",
                "t_input",
                "visualization_manifest",
                "cornerstone_labelmap",
                "cornerstone_labelmap_metadata",
                "cornerstone_geometry",
            ],
        )
        self.assertEqual(detail.overall_malignancy_risk, Decimal("82"))
        self.assertEqual(len(nodules), 2)
        self.assertEqual(nodules[0].nodule_no, 1)
        self.assertEqual(nodules[0].malignancy_risk, Decimal("82"))
        self.assertIsNone(nodules[0].detection_confidence)
        self.assertEqual(nodules[0].finding_payload["nodule_id"], "N001")
        self.assertEqual(nodules[1].nodule_no, 2)
        self.assertEqual(nodules[1].malignancy_risk, Decimal("11"))

    @patch("apps.radiology.tasks.request_ct_phase1_analysis")
    def test_missing_orthanc_series_id_marks_failed_without_calling_service(self, infer):
        self.asset.orthanc_series_id = None
        self.asset.save(update_fields=["orthanc_series_id", "updated_at"])

        self.assertEqual(run_ct_analysis(str(self.analysis.id)), "invalid_source_image")

        infer.assert_not_called()
        self.analysis.refresh_from_db()
        self.assertEqual(self.analysis.status, AiAnalysis.Status.FAILED)
        self.assertTrue(self.analysis.error_message)
        self.assertFalse(AiResult.objects.filter(ai_analysis=self.analysis).exists())

    @patch("apps.radiology.tasks.request_ct_phase1_analysis", side_effect=RuntimeError("phase1 unavailable"))
    def test_inference_failure_marks_analysis_failed_without_results(self, infer):
        self.assertEqual(run_ct_analysis(str(self.analysis.id)), "failed")

        infer.assert_called_once()
        self.analysis.refresh_from_db()
        self.assertEqual(self.analysis.status, AiAnalysis.Status.FAILED)
        self.assertIsNotNone(self.analysis.completed_at)
        self.assertTrue(self.analysis.error_message)
        self.assertFalse(AiResult.objects.filter(ai_analysis=self.analysis).exists())

    @patch("apps.radiology.tasks.request_ct_phase1_analysis")
    def test_duplicate_execution_does_not_create_or_call_again(self, infer):
        result = AiResult.objects.create(
            ai_analysis=self.analysis,
            schema_version="ct-phase1-v1",
            result_payload=PHASE1_PAYLOAD,
            result_files=[],
        )
        CtAiResult.objects.create(ai_result=result, overall_malignancy_risk=Decimal("82"))

        self.assertEqual(run_ct_analysis(str(self.analysis.id)), "already_completed")
        infer.assert_not_called()
        self.assertEqual(AiResult.objects.filter(ai_analysis=self.analysis).count(), 1)
