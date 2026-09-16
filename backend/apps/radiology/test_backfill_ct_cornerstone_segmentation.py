from datetime import date
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import AiAnalysis, AiResult, CtAiResult, ModelVersion
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import Patient

from .services.ct_analysis_inference import CtAnalysisInferenceError


BACKFILL_RESPONSE = {
    "artifact_uri": "gs://soomit-bucket/ct-analysis/h/c/o/a/",
    "cornerstone_manifest_uri": "gs://soomit-bucket/ct-analysis/h/c/o/a/phase1/cornerstone/cornerstone_manifest.json",
    "cornerstone_segmentation": {
        "schema_version": "ct-cornerstone-labelmap-v1",
        "scalar_type": "uint8",
        "dimensions": [12, 12, 12],
        "labelmap_uri": "gs://soomit-bucket/ct-analysis/h/c/o/a/phase1/cornerstone/labelmap.bin",
        "metadata_uri": "gs://soomit-bucket/ct-analysis/h/c/o/a/phase1/cornerstone/labelmap_metadata.json",
        "geometry_uri": "gs://soomit-bucket/ct-analysis/h/c/o/a/phase1/cornerstone/geometry.json",
        "segments": [{"segment_index": 1, "id": "N001", "name": "Nodule 1", "category": "NODULE", "color": [255, 59, 48]}],
    },
}


class BackfillCtCornerstoneSegmentationCommandTestCase(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="테스트병원", code="TEST-HOSPITAL")
        department = Department.objects.create(hospital=hospital, code="RADIOLOGY", name="영상의학과")
        role = DepartmentRole.objects.create(department=department, role=DepartmentRole.Role.DOCTOR, display_name="의사")
        doctor = User.objects.create_user(login_id="doctor", password="test-password", name="doctor", department_role=role)
        patient = Patient.objects.create(
            hospital=hospital, patient_code="P001", name="환자", birth_date=date(1960, 1, 1),
            sex=Patient.Sex.MALE, phone_number="010-0000-0000", phone_number_hash="hash-1",
        )
        case = LungCancerCase.objects.create(patient=patient, case_code="CASE-001", primary_doctor=doctor, current_stage=WorkflowStage.CT)
        order = ExaminationOrder.objects.create(
            case=case, order_type=ExaminationOrder.OrderType.CT, requesting_doctor=doctor,
            priority=ExaminationOrder.Priority.NORMAL, purpose="CT", status=ExaminationOrder.Status.ORDERED,
        )
        asset = CaseImageAsset.objects.create(
            case=case, examination_order=order, workflow_stage=WorkflowStage.CT,
            image_type=CaseImageAsset.ImageType.CT, storage_type=CaseImageAsset.StorageType.ORTHANC,
            storage_uri="orthanc://series/abc", file_format="DICOM", status=CaseImageAsset.Status.READY,
        )
        model_version = ModelVersion.objects.create(model_name="ct-model", version="1.0", analysis_type="CT_ANALYSIS")
        self.analysis_without_labelmap = AiAnalysis.objects.create(
            case=case, source_image_asset=asset, analysis_type="CT_ANALYSIS",
            model_version=model_version, status=AiAnalysis.Status.SUCCEEDED,
        )
        self.result_without_labelmap = AiResult.objects.create(
            ai_analysis=self.analysis_without_labelmap,
            schema_version="ct-phase1-v1",
            result_payload={"artifact_uri": "gs://soomit-bucket/ct-analysis/h/c/o/a/", "case_id": "case-001"},
            result_files=[{"type": "artifact_root", "uri": "gs://soomit-bucket/ct-analysis/h/c/o/a/"}],
        )
        CtAiResult.objects.create(ai_result=self.result_without_labelmap, overall_malignancy_risk=None)

        self.analysis_with_labelmap = AiAnalysis.objects.create(
            case=case, source_image_asset=asset, analysis_type="CT_ANALYSIS",
            model_version=model_version, status=AiAnalysis.Status.SUCCEEDED,
        )
        self.result_with_labelmap = AiResult.objects.create(
            ai_analysis=self.analysis_with_labelmap,
            schema_version="ct-phase1-v1",
            result_payload={
                "artifact_uri": "gs://soomit-bucket/ct-analysis/h/c/o/b/",
                "case_id": "case-002",
                "cornerstone_segmentation": {"labelmap_uri": "gs://soomit-bucket/ct-analysis/h/c/o/b/phase1/cornerstone/labelmap.bin"},
            },
            result_files=[],
        )
        CtAiResult.objects.create(ai_result=self.result_with_labelmap, overall_malignancy_risk=None)

    @patch("apps.radiology.management.commands.backfill_ct_cornerstone_segmentation.request_ct_cornerstone_backfill")
    def test_dry_run_does_not_call_the_service_or_change_anything(self, backfill):
        out = StringIO()
        call_command("backfill_ct_cornerstone_segmentation", stdout=out)

        backfill.assert_not_called()
        self.result_without_labelmap.refresh_from_db()
        self.assertNotIn("cornerstone_segmentation", self.result_without_labelmap.result_payload)
        self.assertIn("planned: 1", out.getvalue())
        self.assertIn("skipped 1", out.getvalue())

    @patch("apps.radiology.management.commands.backfill_ct_cornerstone_segmentation.request_ct_cornerstone_backfill")
    def test_execute_backfills_only_the_missing_result(self, backfill):
        backfill.return_value = BACKFILL_RESPONSE

        call_command("backfill_ct_cornerstone_segmentation", "--execute", stdout=StringIO())

        backfill.assert_called_once_with(artifact_uri="gs://soomit-bucket/ct-analysis/h/c/o/a/", case_id="case-001")
        self.result_without_labelmap.refresh_from_db()
        self.assertEqual(
            self.result_without_labelmap.result_payload["cornerstone_segmentation"],
            BACKFILL_RESPONSE["cornerstone_segmentation"],
        )
        file_types = [item["type"] for item in self.result_without_labelmap.result_files]
        self.assertEqual(
            file_types,
            ["artifact_root", "cornerstone_labelmap", "cornerstone_labelmap_metadata", "cornerstone_geometry"],
        )

        self.result_with_labelmap.refresh_from_db()
        self.assertEqual(self.result_with_labelmap.result_files, [])

    @patch(
        "apps.radiology.management.commands.backfill_ct_cornerstone_segmentation.request_ct_cornerstone_backfill",
        side_effect=CtAnalysisInferenceError("service unavailable"),
    )
    def test_execute_raises_and_leaves_the_result_untouched_on_service_error(self, backfill):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command("backfill_ct_cornerstone_segmentation", "--execute", stdout=StringIO())

        self.result_without_labelmap.refresh_from_db()
        self.assertNotIn("cornerstone_segmentation", self.result_without_labelmap.result_payload)
