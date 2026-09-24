from datetime import date, datetime
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import (
    AiAnalysis,
    AiResult,
    AnalysisType,
    ModelVersion,
    PathologyAiResult,
    PDL1AiResult,
)
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.clinical.models import ClinicalResult, PDL1Result, PathologyResult
from apps.patients.models import Patient
from apps.pathology.models import (
    PathologySpecimen,
    PathologyWorkItem,
    WholeSlideImage,
)
from apps.pathology.services.workflow import calculate_workflow_status
from apps.pathology.services.pdl1_storage import PDL1StorageError
from apps.pathology.tasks import (
    register_wsi_with_orthanc_task,
    run_pathology_gene_analysis,
    run_pdl1_analysis,
)


class PathologyReadAPITestCase(APITestCase):
    def authenticate_pathology_user(self):
        token = AccessToken.for_user(self.user)
        token["hospital_id"] = str(self.hospital.id)
        token["department_id"] = str(self.department.id)
        token["department_code"] = self.department.code
        token["role"] = self.department_role.role
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def setUp(self):
        self.hospital = Hospital.objects.create(
            name="테스트병원",
            code="TEST-HOSPITAL",
        )

        self.department = Department.objects.create(
            hospital=self.hospital,
            code="PATHOLOGY",
            name="병리과",
        )

        self.department_role = DepartmentRole.objects.create(
            department=self.department,
            role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="임상병리사",
        )

        self.user = User.objects.create_user(
            login_id="pathology_test",
            password="test-password",
            name="테스트 병리의사",
            department_role=self.department_role,
            account_status=User.AccountStatus.ACTIVE,
        )

        self.patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="TEST-P001",
            name="테스트 환자",
            birth_date=date(1960, 1, 1),
            sex=Patient.Sex.MALE,
            phone_number="010-0000-0000",
            phone_number_hash="test-phone-hash",
        )

        self.case = LungCancerCase.objects.create(
            patient=self.patient,
            case_code="TEST-CASE-001",
            primary_doctor=self.user,
            current_stage=WorkflowStage.PATHOLOGY_GENE,
        )

        self.pathology_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            requesting_doctor=self.user,
            purpose="Test pathology order",
            status=ExaminationOrder.Status.COMPLETED,
        )

        self.specimen = PathologySpecimen.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            specimen_code="SPECIMEN-001",
            specimen_type=PathologySpecimen.SpecimenType.BIOPSY,
            body_site="Lung",
            status=PathologySpecimen.Status.READY,
            created_by_user=self.user,
        )

        self.image_asset = CaseImageAsset.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            image_type=CaseImageAsset.ImageType.WSI,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gs://test-bucket/test-slide.svs",
            file_format="SVS",
            status=CaseImageAsset.Status.READY,
        )

        self.wsi = WholeSlideImage.objects.create(
            specimen=self.specimen,
            image_asset=self.image_asset,
            slide_code="SLIDE-001",
            version=1,
            stain=WholeSlideImage.Stain.HE,
            original_filename="test-slide.svs",
            sha256="a" * 64,
            mpp=0.25,
            is_current=True,
            uploaded_by_user=self.user,
        )

        self.work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            specimen=self.specimen,
            wsi=self.wsi,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            status=PathologyWorkItem.Status.PENDING,
            priority=PathologyWorkItem.Priority.NORMAL,
            assigned_to=self.user,
        )

        self.model_version = ModelVersion.objects.create(
            model_name="pathology-model",
            version="1.0",
            analysis_type="PATHOLOGY_GENE_ANALYSIS",
        )
        self.ai_analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            source_image_asset=self.image_asset,
            model_version=self.model_version,
            analysis_type="PATHOLOGY_GENE_ANALYSIS",
            status=AiAnalysis.Status.SUCCEEDED,
        )
        self.ai_result = AiResult.objects.create(
            ai_analysis=self.ai_analysis,
            schema_version="1.0",
            result_payload={},
        )
        PathologyAiResult.objects.create(
            ai_result=self.ai_result,
            malignancy_assessment="MALIGNANT",
            malignancy_probability=0.8750,
            predicted_histologic_type="NSCLC",
            predicted_subtype="Adenocarcinoma",
            subtype_confidence=0.8125,
        )

        self.pdl1_model_version = ModelVersion.objects.create(
            model_name="pdl1-amd-mil",
            version="final_model",
            analysis_type="PDL1_ANALYSIS",
        )
        self.pdl1_analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            source_image_asset=self.image_asset,
            model_version=self.pdl1_model_version,
            analysis_type="PDL1_ANALYSIS",
            status=AiAnalysis.Status.SUCCEEDED,
        )
        self.pdl1_ai_result = AiResult.objects.create(
            ai_analysis=self.pdl1_analysis,
            schema_version="1.0",
            result_payload={},
        )
        PDL1AiResult.objects.create(
            ai_result=self.pdl1_ai_result,
            predicted_class=2,
            predicted_tps_range=PDL1AiResult.TpsRange.GE_50,
            confidence=0.995406985,
            probabilities={
                "class_0": 0.0001,
                "class_1": 0.004493015,
                "class_2": 0.995406985,
            },
        )

        self.clinical_result = ClinicalResult.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            source_image_asset=self.image_asset,
            reviewed_ai_result=self.ai_result,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_by_user=self.user,
        )
        PathologyResult.objects.create(
            clinical_result=self.clinical_result,
            malignancy_status=PathologyResult.MalignancyStatus.MALIGNANT,
            histologic_type="NSCLC",
            subtype="Adenocarcinoma",
            diagnosis_summary="Confirmed pathology diagnosis",
        )

    def prepare_review_submission(self):
        self.clinical_result.delete()
        self.work_item.task_type = PathologyWorkItem.TaskType.PATHOLOGY_ANALYSIS
        self.work_item.status = PathologyWorkItem.Status.COMPLETED
        self.work_item.save(update_fields=["task_type", "status", "updated_at"])
        self.authenticate_pathology_user()
        return reverse(
            "pathology:case-submit-for-review",
            kwargs={"case_id": self.case.id},
        )

    def prepare_pdl1_review_submission(self):
        order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
            requesting_doctor=self.user,
            purpose="PD-L1 follow-up",
            status=ExaminationOrder.Status.ORDERED,
        )
        specimen = PathologySpecimen.objects.create(
            case=self.case,
            examination_order=order,
            specimen_code="SPECIMEN-PDL1-SUBMIT",
            specimen_type=PathologySpecimen.SpecimenType.BIOPSY,
            status=PathologySpecimen.Status.READY,
            created_by_user=self.user,
        )
        asset = CaseImageAsset.objects.create(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.PDL1,
            image_type=CaseImageAsset.ImageType.WSI,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gs://test-bucket/pdl1-slide.svs",
            file_format="SVS",
            status=CaseImageAsset.Status.READY,
        )
        wsi = WholeSlideImage.objects.create(
            specimen=specimen,
            image_asset=asset,
            slide_code="SLIDE-PDL1-SUBMIT",
            version=1,
            stain=WholeSlideImage.Stain.PDL1,
            original_filename="pdl1-slide.svs",
            sha256="b" * 64,
            uploaded_by_user=self.user,
        )
        self.work_item.examination_order = order
        self.work_item.specimen = specimen
        self.work_item.wsi = wsi
        self.work_item.task_type = PathologyWorkItem.TaskType.PATHOLOGY_ANALYSIS
        self.work_item.status = PathologyWorkItem.Status.COMPLETED
        self.work_item.save(
            update_fields=["examination_order", "specimen", "wsi", "task_type", "status", "updated_at"]
        )
        self.pdl1_analysis.examination_order = order
        self.pdl1_analysis.source_image_asset = asset
        self.pdl1_analysis.save(update_fields=["examination_order", "source_image_asset"])
        self.pdl1_ai_result.result_payload = {
            "predicted_class": 2,
            "predicted_tps_range": PDL1AiResult.TpsRange.GE_50,
            "predicted_tps_range_label": "≥50%",
            "confidence": 0.995406985,
            "probabilities": {
                "class_0": 0.0001,
                "class_1": 0.004493015,
                "class_2": 0.995406985,
            },
            "model_revision": "pdl1-revision-test",
        }
        self.pdl1_ai_result.save(update_fields=["result_payload"])
        self.authenticate_pathology_user()
        url = reverse("pathology:case-submit-for-review", kwargs={"case_id": self.case.id})
        return url, order, specimen, asset, wsi

    def test_pdl1_review_submission_creates_clinical_draft_from_succeeded_ai_result(self):
        url, order, _, asset, wsi = self.prepare_pdl1_review_submission()

        response = self.client.post(
            url,
            {"work_item_id": self.work_item.id, "ai_analysis_id": self.pdl1_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        clinical_result = ClinicalResult.objects.get(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.PDL1,
        )
        self.assertEqual(clinical_result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(clinical_result.source_image_asset, asset)
        self.assertEqual(clinical_result.reviewed_ai_result, self.pdl1_ai_result)
        detail = clinical_result.pdl1_detail
        self.assertIsNone(detail.tps_percent)
        self.assertEqual(detail.interpretation, "AI predicted TPS range: ≥50%")
        self.assertIn("confidence=0.995406985", detail.note)
        self.assertIn("class_2=0.995406985", detail.note)
        self.assertIn("pdl1-amd-mil (final_model)", detail.note)
        self.assertIn("pdl1-revision-test", detail.note)
        self.assertEqual(detail.source_wsi, wsi)
        review = PathologyWorkItem.objects.get(id=response.data["review_work_item_id"])
        self.assertEqual(review.task_type, PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW)

    def test_pdl1_review_submission_preserves_current_ai_draft(self):
        url, order, _, _, wsi = self.prepare_pdl1_review_submission()
        draft = ClinicalResult.objects.create(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.PDL1,
            source_image_asset=self.pdl1_analysis.source_image_asset,
            reviewed_ai_result=self.pdl1_ai_result,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        PDL1Result.objects.create(
            clinical_result=draft,
            tps_percent="62.50",
            interpretation="Existing current-analysis draft",
            note="Keep this existing draft",
            source_wsi=wsi,
        )

        response = self.client.post(
            url,
            {"work_item_id": self.work_item.id, "ai_analysis_id": self.pdl1_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        draft.refresh_from_db()
        self.assertEqual(draft.reviewed_ai_result, self.pdl1_ai_result)
        self.assertEqual(draft.pdl1_detail.tps_percent, 62.5)
        self.assertEqual(draft.pdl1_detail.interpretation, "Existing current-analysis draft")
        self.assertEqual(draft.pdl1_detail.note, "Keep this existing draft")

    def test_pdl1_review_submission_refreshes_stale_draft_to_latest_ai_result(self):
        url, order, _, _, wsi = self.prepare_pdl1_review_submission()
        stale_draft = ClinicalResult.objects.create(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.PDL1,
            source_image_asset=self.pdl1_analysis.source_image_asset,
            reviewed_ai_result=self.pdl1_ai_result,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        PDL1Result.objects.create(
            clinical_result=stale_draft,
            tps_percent="5.00",
            interpretation="Stale analysis result",
            note="Stale note",
            source_wsi=wsi,
        )
        latest_analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=order,
            source_image_asset=self.pdl1_analysis.source_image_asset,
            model_version=self.pdl1_model_version,
            analysis_type=AnalysisType.PDL1_ANALYSIS,
            status=AiAnalysis.Status.SUCCEEDED,
        )
        latest_ai_result = AiResult.objects.create(
            ai_analysis=latest_analysis,
            schema_version="pdl1-v1",
            result_payload={
                "predicted_class": 1,
                "predicted_tps_range": PDL1AiResult.TpsRange.FROM_1_TO_49,
                "predicted_tps_range_label": "1–49%",
                "confidence": 0.75,
                "probabilities": {"class_0": 0.1, "class_1": 0.75, "class_2": 0.15},
            },
        )
        PDL1AiResult.objects.create(
            ai_result=latest_ai_result,
            predicted_class=1,
            predicted_tps_range=PDL1AiResult.TpsRange.FROM_1_TO_49,
            confidence=0.75,
            probabilities={"class_0": 0.1, "class_1": 0.75, "class_2": 0.15},
        )

        response = self.client.post(
            url,
            {"work_item_id": self.work_item.id, "ai_analysis_id": latest_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        stale_draft.refresh_from_db()
        self.assertEqual(stale_draft.reviewed_ai_result, latest_ai_result)
        self.assertEqual(stale_draft.source_image_asset, latest_analysis.source_image_asset)
        self.assertIsNone(stale_draft.pdl1_detail.tps_percent)
        self.assertEqual(stale_draft.pdl1_detail.interpretation, "AI predicted TPS range: 1–49%")
        self.assertEqual(stale_draft.pdl1_detail.source_wsi, wsi)
        self.assertIn("confidence=0.75", stale_draft.pdl1_detail.note)

    def test_pdl1_review_submission_rejects_pending_and_running_analysis(self):
        url, _, _, _, _ = self.prepare_pdl1_review_submission()
        for analysis_status in (AiAnalysis.Status.PENDING, AiAnalysis.Status.RUNNING):
            with self.subTest(analysis_status=analysis_status):
                self.pdl1_analysis.status = analysis_status
                self.pdl1_analysis.save(update_fields=["status"])
                response = self.client.post(
                    url,
                    {"work_item_id": self.work_item.id, "ai_analysis_id": self.pdl1_analysis.id},
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.pdl1_analysis.status = AiAnalysis.Status.SUCCEEDED
        self.pdl1_analysis.save(update_fields=["status"])

    def test_pdl1_review_submission_rejects_non_latest_analysis(self):
        url, order, _, asset, _ = self.prepare_pdl1_review_submission()
        AiAnalysis.objects.create(
            case=self.case,
            examination_order=order,
            source_image_asset=asset,
            model_version=self.pdl1_model_version,
            analysis_type=AnalysisType.PDL1_ANALYSIS,
            status=AiAnalysis.Status.PENDING,
        )

        response = self.client.post(
            url,
            {"work_item_id": self.work_item.id, "ai_analysis_id": self.pdl1_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pdl1_review_submission_does_not_overwrite_confirmed_result(self):
        url, order, _, _, _ = self.prepare_pdl1_review_submission()
        confirmed = ClinicalResult.objects.create(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.PDL1,
            reviewed_ai_result=self.pdl1_ai_result,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_by_user=self.user,
            confirmed_at=timezone.now(),
        )

        response = self.client.post(
            url,
            {"work_item_id": self.work_item.id, "ai_analysis_id": self.pdl1_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        confirmed.refresh_from_db()
        self.assertEqual(confirmed.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertEqual(confirmed.reviewed_ai_result, self.pdl1_ai_result)
        self.assertFalse(hasattr(confirmed, "pdl1_detail"))

    def test_pathology_staff_can_submit_succeeded_analysis_for_review(self):
        url = self.prepare_review_submission()

        response = self.client.post(
            url,
            {"work_item_id": self.work_item.id, "ai_analysis_id": self.ai_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["submitted"])
        review = PathologyWorkItem.objects.get(id=response.data["review_work_item_id"])
        self.assertEqual(review.task_type, PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW)
        self.assertEqual(review.status, PathologyWorkItem.Status.PENDING)
        self.assertIsNone(review.assigned_to_id)
        self.assertEqual(review.specimen_id, self.work_item.specimen_id)
        self.assertEqual(review.wsi_id, self.work_item.wsi_id)
        draft = ClinicalResult.objects.get(
                case=self.case,
                result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        self.assertEqual(draft.reviewed_ai_result, self.ai_result)
        self.assertEqual(draft.pathology_detail.subtype, "Adenocarcinoma")

    def test_review_submission_rejects_running_analysis(self):
        url = self.prepare_review_submission()
        self.ai_analysis.status = AiAnalysis.Status.RUNNING
        self.ai_analysis.save(update_fields=["status"])

        response = self.client.post(
            url,
            {"work_item_id": self.work_item.id, "ai_analysis_id": self.ai_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_review_submission_rejects_analysis_from_another_case(self):
        url = self.prepare_review_submission()
        other_patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="TEST-P002",
            name="Other patient",
            birth_date=date(1970, 1, 1),
            sex=Patient.Sex.FEMALE,
            phone_number="010-9999-9999",
            phone_number_hash="other-case-phone-hash",
        )
        other_case = LungCancerCase.objects.create(
            patient=other_patient,
            case_code="TEST-CASE-002",
            current_stage=WorkflowStage.PATHOLOGY_GENE,
        )
        self.ai_analysis.case = other_case
        self.ai_analysis.save(update_fields=["case"])

        response = self.client.post(
            url,
            {"work_item_id": self.work_item.id, "ai_analysis_id": self.ai_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_review_submission_rejects_other_hospital_case(self):
        self.prepare_review_submission()
        other_hospital = Hospital.objects.create(name="Other hospital", code="OTHER-REVIEW")
        other_patient = Patient.objects.create(
            hospital=other_hospital,
            patient_code="OTHER-REVIEW-P001",
            name="Other hospital patient",
            birth_date=date(1970, 1, 1),
            sex=Patient.Sex.FEMALE,
            phone_number="010-8888-8888",
            phone_number_hash="other-hospital-review-hash",
        )
        other_case = LungCancerCase.objects.create(
            patient=other_patient,
            case_code="OTHER-REVIEW-CASE",
            current_stage=WorkflowStage.PATHOLOGY_GENE,
        )

        response = self.client.post(
            reverse("pathology:case-submit-for-review", kwargs={"case_id": other_case.id}),
            {"work_item_id": self.work_item.id, "ai_analysis_id": self.ai_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_review_submission_rejects_analysis_type_mismatch(self):
        url = self.prepare_review_submission()

        response = self.client.post(
            url,
            {"work_item_id": self.work_item.id, "ai_analysis_id": self.pdl1_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_review_submission_is_idempotent_and_keeps_ai_completed(self):
        url = self.prepare_review_submission()
        payload = {"work_item_id": self.work_item.id, "ai_analysis_id": self.ai_analysis.id}

        first = self.client.post(url, payload, format="json")
        second = self.client.post(url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertFalse(second.data["submitted"])
        self.assertEqual(first.data["review_work_item_id"], second.data["review_work_item_id"])
        self.assertEqual(
            PathologyWorkItem.objects.filter(
                case=self.case,
                task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            ).count(),
            1,
        )

        review = PathologyWorkItem.objects.get(id=first.data["review_work_item_id"])
        self.case.workstation_confirmed_results = []
        self.case.workstation_review_items = [review]
        self.case.workstation_analyses = [self.ai_analysis]
        self.assertEqual(calculate_workflow_status(self.work_item), "AI_COMPLETED")

    def test_legacy_null_order_uses_unambiguous_relationships(self):
        url = self.prepare_review_submission()
        self.work_item.examination_order = None
        self.work_item.save(update_fields=["examination_order", "updated_at"])
        self.ai_analysis.examination_order = None
        self.ai_analysis.save(update_fields=["examination_order"])

        response = self.client.post(
            url,
            {"work_item_id": self.work_item.id, "ai_analysis_id": self.ai_analysis.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        review = PathologyWorkItem.objects.get(id=response.data["review_work_item_id"])
        self.assertEqual(review.examination_order_id, self.pathology_order.id)

    def test_workflow_and_review_submission_are_scoped_to_examination_order(self):
        self.work_item.status = PathologyWorkItem.Status.COMPLETED
        self.work_item.save(update_fields=["status", "updated_at"])
        pdl1_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
            requesting_doctor=self.user,
            purpose="PD-L1 follow-up",
            status=ExaminationOrder.Status.COMPLETED,
        )
        pdl1_specimen = PathologySpecimen.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            specimen_code="SPECIMEN-PDL1",
            specimen_type=PathologySpecimen.SpecimenType.BIOPSY,
            status=PathologySpecimen.Status.READY,
            created_by_user=self.user,
        )
        pdl1_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            specimen=pdl1_specimen,
            task_type=PathologyWorkItem.TaskType.PATHOLOGY_ANALYSIS,
            status=PathologyWorkItem.Status.COMPLETED,
        )
        self.case.workstation_confirmed_results = [self.clinical_result]
        self.case.workstation_review_items = [self.work_item]
        self.case.workstation_analyses = [self.ai_analysis]
        self.assertNotEqual(calculate_workflow_status(pdl1_work_item), "REVIEW_COMPLETED")

        pdl1_asset = CaseImageAsset.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            workflow_stage=WorkflowStage.PDL1,
            image_type=CaseImageAsset.ImageType.WSI,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gcs://test-bucket/pdl1-slide.svs",
            file_format="SVS",
            status=CaseImageAsset.Status.READY,
        )
        pdl1_wsi = WholeSlideImage.objects.create(
            specimen=pdl1_specimen,
            image_asset=pdl1_asset,
            slide_code="SLIDE-PDL1",
            version=1,
            stain=WholeSlideImage.Stain.PDL1,
            original_filename="pdl1-slide.svs",
            sha256="c" * 64,
            uploaded_by_user=self.user,
        )
        pdl1_analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            source_image_asset=pdl1_asset,
            model_version=self.pdl1_model_version,
            analysis_type="PDL1_ANALYSIS",
            status=AiAnalysis.Status.SUCCEEDED,
        )
        pdl1_ai_result = AiResult.objects.create(
            ai_analysis=pdl1_analysis,
            schema_version="1.0",
            result_payload={
                "predicted_class": 2,
                "predicted_tps_range": PDL1AiResult.TpsRange.GE_50,
                "predicted_tps_range_label": "≥50%",
                "confidence": 0.995406985,
                "probabilities": {
                    "class_0": 0.0001,
                    "class_1": 0.004493015,
                    "class_2": 0.995406985,
                },
            },
        )
        PDL1AiResult.objects.create(
            ai_result=pdl1_ai_result,
            predicted_class=2,
            predicted_tps_range=PDL1AiResult.TpsRange.GE_50,
            confidence=0.995406985,
            probabilities={
                "class_0": 0.0001,
                "class_1": 0.004493015,
                "class_2": 0.995406985,
            },
        )
        pdl1_draft = ClinicalResult.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            workflow_stage=WorkflowStage.PDL1,
            source_image_asset=pdl1_asset,
            reviewed_ai_result=pdl1_ai_result,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        PDL1Result.objects.create(
            clinical_result=pdl1_draft,
            tps_percent="55.00",
            interpretation="Positive",
            source_wsi=pdl1_wsi,
        )
        self.case.workstation_analyses = [pdl1_analysis, self.ai_analysis]
        self.assertEqual(calculate_workflow_status(pdl1_work_item), "AI_COMPLETED")

        self.authenticate_pathology_user()
        url = reverse(
            "pathology:case-submit-for-review",
            kwargs={"case_id": self.case.id},
        )
        payload = {"work_item_id": pdl1_work_item.id, "ai_analysis_id": pdl1_analysis.id}
        first = self.client.post(url, payload, format="json")
        second = self.client.post(url, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(
            PathologyWorkItem.objects.filter(
                case=self.case,
                task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            ).count(),
            2,
        )

        gene_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            requesting_doctor=self.user,
            purpose="Gene follow-up",
        )
        gene_specimen = PathologySpecimen.objects.create(
            case=self.case,
            examination_order=gene_order,
            specimen_code="SPECIMEN-GENE",
            specimen_type=PathologySpecimen.SpecimenType.BIOPSY,
            created_by_user=self.user,
        )
        gene_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=gene_order,
            specimen=gene_specimen,
            task_type=PathologyWorkItem.TaskType.PATHOLOGY_ANALYSIS,
        )
        pdl1_review = PathologyWorkItem.objects.get(id=first.data["review_work_item_id"])
        self.case.workstation_review_items = [pdl1_review, self.work_item]
        self.case.workstation_confirmed_results = [self.clinical_result]
        self.case.workstation_analyses = [pdl1_analysis, self.ai_analysis]
        self.assertNotIn(
            calculate_workflow_status(gene_work_item),
            {"AI_COMPLETED", "REVIEW_COMPLETED"},
        )

    def test_follow_up_orders_without_specimens_use_direct_order_in_workstation(self):
        pdl1_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
            requesting_doctor=self.user,
            purpose="PD-L1 follow-up",
        )
        gene_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            requesting_doctor=self.user,
            purpose="Gene follow-up",
        )
        pdl1_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
        )
        pdl1_older_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            task_type=PathologyWorkItem.TaskType.QUALITY_CHECK,
        )
        pdl1_latest_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            task_type=PathologyWorkItem.TaskType.PATHOLOGY_ANALYSIS,
        )
        gene_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=gene_order,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
        )
        gene_older_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=gene_order,
            task_type=PathologyWorkItem.TaskType.QUALITY_CHECK,
        )
        gene_latest_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=gene_order,
            task_type=PathologyWorkItem.TaskType.PATHOLOGY_ANALYSIS,
        )
        older_timestamp = timezone.make_aware(datetime(2025, 1, 1, 10, 0, 0))
        latest_timestamp = timezone.make_aware(datetime(2025, 1, 1, 10, 10, 0))
        PathologyWorkItem.objects.filter(
            id__in=[pdl1_work_item.id, pdl1_older_work_item.id, gene_work_item.id, gene_older_work_item.id]
        ).update(created_at=older_timestamp)
        PathologyWorkItem.objects.filter(
            id__in=[pdl1_older_work_item.id, pdl1_latest_work_item.id, gene_latest_work_item.id]
        ).update(created_at=latest_timestamp)
        self.authenticate_pathology_user()

        response = self.client.get(reverse("pathology:workstation-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(
            {item["order_type"] for item in response.data["results"]},
            {"PATHOLOGY_GENE", "PDL1"},
        )
        self.assertTrue(
            all(str(item["case_id"]) == str(self.case.id) for item in response.data["results"])
        )
        self.assertEqual(
            {str(item["examination_order"]["id"]) for item in response.data["results"]},
            {str(pdl1_order.id), str(gene_order.id)},
        )
        self.assertEqual(
            [str(item["examination_order"]["id"]) for item in response.data["results"]],
            [str(order.id) for order in (gene_order, pdl1_order)],
        )
        result_by_order_id = {
            str(item["examination_order"]["id"]): item for item in response.data["results"]
        }
        self.assertEqual(
            str(result_by_order_id[str(pdl1_order.id)]["id"]),
            str(max([pdl1_older_work_item.id, pdl1_latest_work_item.id], key=str)),
        )
        self.assertEqual(
            str(result_by_order_id[str(gene_order.id)]["id"]), str(gene_latest_work_item.id)
        )

        detail_response = self.client.get(
            reverse("pathology:case-workflow", kwargs={"case_id": self.case.id})
        )
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["order_type"] for item in detail_response.data["orders"]],
            ["PATHOLOGY_GENE", "PATHOLOGY_GENE", "PDL1"],
        )
        results = {
            str(item["examination_order"]["id"]): item
            for item in detail_response.data["orders"]
        }
        pdl1_row = results[str(pdl1_order.id)]
        gene_row = results[str(gene_order.id)]
        self.assertEqual(pdl1_row["order_type"], "PDL1")
        self.assertEqual(pdl1_row["order_type_label"], "PD-L1 검사")
        self.assertEqual(pdl1_row["current_exam_or_task"], pdl1_row["order_type_label"])
        self.assertEqual(pdl1_row["requesting_doctor"]["id"], self.user.id)
        self.assertIsNone(pdl1_row["specimen"])
        self.assertIsNone(pdl1_row["latest_wsi"])
        self.assertIsNone(pdl1_row["latest_ai_analysis"])
        self.assertEqual(pdl1_row["workflow_status"], "SCHEDULED")
        self.assertEqual(gene_row["order_type"], "PATHOLOGY_GENE")
        self.assertEqual(gene_row["current_exam_or_task"], gene_row["order_type_label"])
        self.assertIsNone(gene_row["specimen"])
        self.assertIsNone(gene_row["latest_wsi"])
        self.assertIsNone(gene_row["latest_ai_analysis"])

    def test_pathology_test_filter_does_not_include_other_orders_from_same_case(self):
        pdl1_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
            requesting_doctor=self.user,
            purpose="PD-L1 follow-up",
        )
        PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
        )
        PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            task_type=PathologyWorkItem.TaskType.QUALITY_CHECK,
        )
        pdl1_latest_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            task_type=PathologyWorkItem.TaskType.PATHOLOGY_ANALYSIS,
        )
        PathologyWorkItem.objects.filter(examination_order=pdl1_order).exclude(
            id=pdl1_latest_work_item.id
        ).update(created_at=timezone.make_aware(datetime(2025, 1, 1, 10, 0, 0)))
        pdl1_latest_work_item.created_at = timezone.make_aware(datetime(2025, 1, 1, 10, 10, 0))
        pdl1_latest_work_item.save(update_fields=["created_at"])
        self.authenticate_pathology_user()

        response = self.client.get(
            reverse("pathology:workstation-list"),
            {"order_type": "PDL1"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(str(response.data["results"][0]["id"]), str(pdl1_latest_work_item.id))
        self.assertEqual(response.data["results"][0]["order_type"], "PDL1")

    def test_gene_order_filter_keeps_only_latest_work_item(self):
        gene_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            requesting_doctor=self.user,
            purpose="Gene follow-up",
        )
        older_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=gene_order,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
        )
        latest_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=gene_order,
            task_type=PathologyWorkItem.TaskType.PATHOLOGY_ANALYSIS,
        )
        PathologyWorkItem.objects.filter(id=older_work_item.id).update(
            created_at=timezone.make_aware(datetime(2025, 1, 1, 10, 0, 0))
        )
        PathologyWorkItem.objects.filter(id=latest_work_item.id).update(
            created_at=timezone.make_aware(datetime(2025, 1, 1, 10, 10, 0))
        )
        self.authenticate_pathology_user()

        response = self.client.get(
            reverse("pathology:workstation-list"),
            {"order_type": "PATHOLOGY_GENE"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(str(response.data["results"][0]["id"]), str(latest_work_item.id))
        self.assertEqual(response.data["results"][0]["order_type"], "PATHOLOGY_GENE")

    def test_work_items_without_orders_remain_independent(self):
        patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="TEST-P002",
            name="Orderless patient",
            birth_date=date(1965, 1, 1),
            sex=Patient.Sex.FEMALE,
            phone_number="010-0000-0001",
            phone_number_hash="test-phone-hash-orderless",
        )
        case = LungCancerCase.objects.create(
            patient=patient,
            case_code="TEST-CASE-002",
            primary_doctor=self.user,
            current_stage=WorkflowStage.PATHOLOGY_GENE,
        )
        work_items = [
            PathologyWorkItem.objects.create(
                case=case,
                task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
            )
            for _ in range(2)
        ]
        self.authenticate_pathology_user()

        response = self.client.get(reverse("pathology:workstation-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(
            {str(item["id"]) for item in response.data["results"]},
            {str(item.id) for item in work_items},
        )

    def test_review_and_diagnosis_reject_ai_result_from_another_order(self):
        pdl1_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
            requesting_doctor=self.user,
            purpose="PD-L1 follow-up",
        )
        pdl1_specimen = PathologySpecimen.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            specimen_code="SPECIMEN-PDL1-MISMATCH",
            specimen_type=PathologySpecimen.SpecimenType.BIOPSY,
            created_by_user=self.user,
        )
        pdl1_review = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            specimen=pdl1_specimen,
            task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
        )
        self.authenticate_pathology_user()

        submit_response = self.client.post(
            reverse("pathology:case-submit-for-review", kwargs={"case_id": self.case.id}),
            {"work_item_id": pdl1_review.id, "ai_analysis_id": self.pdl1_analysis.id},
            format="json",
        )
        self.assertEqual(submit_response.status_code, status.HTTP_400_BAD_REQUEST)

        self.authenticate_pathology_user()
        diagnosis_response = self.client.post(
            reverse("pathology:case-diagnosis-list", kwargs={"case_id": self.case.id}),
            {
                "work_item_id": pdl1_review.id,
                "malignancy_status": "MALIGNANT",
                "reviewed_ai_result_id": self.ai_result.id,
            },
            format="json",
        )
        self.assertEqual(diagnosis_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pathology_workstation_is_hospital_scoped(self):
        other_hospital = Hospital.objects.create(
            name="다른 테스트병원",
            code="OTHER-HOSPITAL",
        )
        other_patient = Patient.objects.create(
            hospital=other_hospital,
            patient_code="OTHER-P001",
            name="다른 병원 환자",
            birth_date=date(1970, 1, 1),
            sex=Patient.Sex.FEMALE,
            phone_number="010-1111-1111",
            phone_number_hash="other-phone-hash",
        )
        other_case = LungCancerCase.objects.create(
            patient=other_patient,
            case_code="OTHER-CASE-001",
            current_stage=WorkflowStage.PATHOLOGY_GENE,
        )
        PathologyWorkItem.objects.create(
            case=other_case,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
        )
        self.authenticate_pathology_user()

        response = self.client.get(reverse("pathology:workstation-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(len(response.data["results"]), 0)

    def test_pathology_workstation_filters_by_projected_workflow_status(self):
        self.authenticate_pathology_user()
        url = reverse("pathology:workstation-list")

        matching_response = self.client.get(
            url,
            {"workflow_status": "REVIEW_COMPLETED"},
        )
        non_matching_response = self.client.get(
            url,
            {"workflow_status": "SCHEDULED"},
        )

        self.assertEqual(matching_response.status_code, status.HTTP_200_OK)
        self.assertEqual(matching_response.data["count"], 0)
        self.assertEqual(non_matching_response.status_code, status.HTTP_200_OK)
        self.assertEqual(non_matching_response.data["count"], 0)

    def test_completed_exam_history_returns_only_review_completed_orders(self):
        pending_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
            requesting_doctor=self.user,
            purpose="Pending PD-L1",
        )
        PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pending_order,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
            status=PathologyWorkItem.Status.PENDING,
        )
        self.authenticate_pathology_user()

        response = self.client.get(reverse("pathology:completed-exam-history"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(len(response.data[0]["completed_exams"]), 1)
        completed = response.data[0]["completed_exams"][0]
        self.assertEqual(completed["order_type"], "PATHOLOGY_GENE")
        self.assertEqual(completed["workflow_status"], "REVIEW_COMPLETED")
        self.assertIsNone(completed["completed_at"])

    def test_non_pathology_staff_cannot_access_workstation(self):
        other_department = Department.objects.create(
            hospital=self.hospital,
            code="ADMINISTRATION",
            name="원무과",
        )
        other_role = DepartmentRole.objects.create(
            department=other_department,
            role=DepartmentRole.Role.MEDICAL_STAFF,
            display_name="원무 직원",
        )
        other_user = User.objects.create_user(
            login_id="administration_test",
            password="test-password",
            name="원무 테스트",
            department_role=other_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.client.force_authenticate(user=other_user)

        response = self.client.get(reverse("pathology:workstation-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        protected_get_urls = [
            reverse(
                "pathology:case-pdl1-result-list",
                kwargs={"case_id": self.case.id},
            ),
            reverse(
                "pathology:case-specimen-list",
                kwargs={"case_id": self.case.id},
            ),
            reverse(
                "pathology:specimen-wsi-list",
                kwargs={"specimen_id": self.specimen.id},
            ),
            reverse(
                "pathology:wsi-pyramid",
                kwargs={"wsi_id": self.wsi.id},
            ),
        ]
        for url in protected_get_urls:
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

        run_url = reverse(
            "pathology:case-pdl1-analysis-run",
            kwargs={"case_id": self.case.id},
        )
        self.assertEqual(
            self.client.post(run_url, {}, format="multipart").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        submit_url = reverse(
            "pathology:case-submit-for-review",
            kwargs={"case_id": self.case.id},
        )
        self.assertEqual(
            self.client.post(
                submit_url,
                {
                    "work_item_id": self.work_item.id,
                    "ai_analysis_id": self.ai_analysis.id,
                },
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_unauthenticated_user_cannot_access_work_items(self):
        url = reverse("pathology:work-item-list")
        response = self.client.get(url)

        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_authenticated_user_can_read_work_items(self):
        self.client.force_authenticate(user=self.user)

        url = reverse("pathology:work-item-list")
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            str(response.data[0]["id"]),
            str(self.work_item.id),
        )

    def test_unauthenticated_user_cannot_access_work_item_detail(self):
        url = reverse(
            "pathology:work-item-detail",
            kwargs={"id": self.work_item.id},
        )
        response = self.client.get(url)

        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_authenticated_user_can_read_work_item_detail(self):
        self.client.force_authenticate(user=self.user)

        url = reverse(
            "pathology:work-item-detail",
            kwargs={"id": self.work_item.id},
        )
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data["id"]), str(self.work_item.id))
        self.assertEqual(response.data["patient_name"], self.patient.name)
        self.assertEqual(response.data["case_code"], self.case.case_code)
        self.assertEqual(
            response.data["specimen_code"],
            self.specimen.specimen_code,
        )
        self.assertEqual(response.data["slide_code"], self.wsi.slide_code)

    def test_authenticated_user_can_read_case_specimens(self):
        self.authenticate_pathology_user()

        url = reverse(
            "pathology:case-specimen-list",
            kwargs={"case_id": self.case.id},
        )
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            str(response.data[0]["id"]),
            str(self.specimen.id),
        )

    def test_authenticated_user_can_read_specimen_wsis(self):
        self.authenticate_pathology_user()

        url = reverse(
            "pathology:specimen-wsi-list",
            kwargs={"specimen_id": self.specimen.id},
        )
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            str(response.data[0]["id"]),
            str(self.wsi.id),
        )

    @patch("apps.pathology.views.get_wsi_pyramid")
    def test_authenticated_user_can_read_wsi_pyramid(self, mock_pyramid):
        self.wsi.orthanc_series_id = "orthanc-series-1"
        self.wsi.save(update_fields=["orthanc_series_id", "updated_at"])
        mock_pyramid.return_value = {
            "Resolutions": [1, 2, 4],
            "Sizes": [[2048, 1024], [1024, 512], [512, 256]],
            "TileWidth": 512,
            "TileHeight": 512,
            "TotalWidth": 2048,
            "TotalHeight": 1024,
        }
        self.authenticate_pathology_user()

        response = self.client.get(
            reverse("pathology:wsi-pyramid", kwargs={"wsi_id": self.wsi.id}),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["width"], 2048)
        self.assertIn("{level}/{x}/{y}", response.data["tile_url_template"])
        mock_pyramid.assert_called_once_with("orthanc-series-1")

    @patch("apps.pathology.views.get_wsi_tile")
    def test_authenticated_user_can_read_wsi_tile(self, mock_tile):
        from apps.pathology.services.orthanc import OrthancBinaryResponse

        self.wsi.orthanc_series_id = "orthanc-series-1"
        self.wsi.save(update_fields=["orthanc_series_id", "updated_at"])
        mock_tile.return_value = OrthancBinaryResponse(b"jpeg-tile", "image/jpeg")
        self.authenticate_pathology_user()

        response = self.client.get(
            reverse(
                "pathology:wsi-tile",
                kwargs={"wsi_id": self.wsi.id, "level": 0, "x": 1, "y": 2},
            ),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.content, b"jpeg-tile")
        self.assertEqual(response["Content-Type"], "image/jpeg")
        mock_tile.assert_called_once_with("orthanc-series-1", 0, 1, 2)

    def test_wsi_pyramid_requires_orthanc_series(self):
        self.authenticate_pathology_user()

        response = self.client.get(
            reverse("pathology:wsi-pyramid", kwargs={"wsi_id": self.wsi.id}),
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_unauthenticated_user_cannot_access_case_ai_results(self):
        url = reverse(
            "pathology:case-ai-result-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.get(url)

        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_authenticated_user_can_read_case_pathology_ai_results(self):
        self.authenticate_pathology_user()
        url = reverse(
            "pathology:case-ai-result-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(str(response.data[0]["case_id"]), str(self.case.id))
        self.assertEqual(
            str(response.data[0]["source_image_asset_id"]),
            str(self.image_asset.id),
        )
        self.assertEqual(response.data[0]["analysis_type"], "PATHOLOGY_GENE_ANALYSIS")
        self.assertEqual(
            response.data[0]["result_detail"]["pathology"]["predicted_subtype"],
            "Adenocarcinoma",
        )

    @patch("apps.pathology.views.run_pathology_gene_analysis.delay")
    def test_pathology_gene_run_uses_submitted_wsi_order(self, delay):
        newer_order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PATHOLOGY_GENE,
            requesting_doctor=self.user,
            purpose="Newer pathology order without WSI",
        )
        ModelVersion.objects.create(
            model_name="pathology-analysis",
            version="pathology-analysis-v1",
            analysis_type="PATHOLOGY_GENE_ANALYSIS",
        )
        self.authenticate_pathology_user()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse(
                    "pathology:case-pathology-gene-analysis-run",
                    kwargs={"case_id": self.case.id},
                ),
                {"wsi_id": str(self.wsi.id)},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        analysis = AiAnalysis.objects.get(id=response.data["id"])
        self.assertEqual(analysis.examination_order_id, self.pathology_order.id)
        self.assertEqual(analysis.source_image_asset_id, self.image_asset.id)
        self.assertNotEqual(analysis.examination_order_id, newer_order.id)
        delay.assert_called_once_with(str(analysis.id))

    def test_pathology_gene_analysis_cancel_marks_pending_analysis_cancelled(self):
        analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            source_image_asset=self.image_asset,
            model_version=self.model_version,
            analysis_type="PATHOLOGY_GENE_ANALYSIS",
            status=AiAnalysis.Status.PENDING,
        )
        self.authenticate_pathology_user()

        response = self.client.post(
            reverse(
                "pathology:case-pathology-gene-analysis-cancel",
                kwargs={"case_id": self.case.id, "analysis_id": analysis.id},
            ),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        analysis.refresh_from_db()
        self.assertEqual(analysis.status, AiAnalysis.Status.CANCELLED)
        self.assertIsNotNone(analysis.completed_at)

    def test_pathology_gene_analysis_cancel_rejects_completed_analysis(self):
        self.authenticate_pathology_user()

        response = self.client.post(
            reverse(
                "pathology:case-pathology-gene-analysis-cancel",
                kwargs={"case_id": self.case.id, "analysis_id": self.ai_analysis.id},
            ),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.ai_analysis.refresh_from_db()
        self.assertEqual(self.ai_analysis.status, AiAnalysis.Status.SUCCEEDED)

    @patch("apps.pathology.tasks.request_pathology_prediction")
    def test_cancelled_pathology_gene_task_does_not_save_late_result(self, prediction):
        self.image_asset.storage_uri = "gs://test-bucket/test-slide.svs"
        self.image_asset.save(update_fields=["storage_uri"])
        analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            source_image_asset=self.image_asset,
            model_version=self.model_version,
            analysis_type="PATHOLOGY_GENE_ANALYSIS",
            status=AiAnalysis.Status.PENDING,
        )

        def cancel_analysis(**kwargs):
            AiAnalysis.objects.filter(id=analysis.id).update(status=AiAnalysis.Status.CANCELLED)
            return {
                "tissue": {
                    "predicted_label": "LUAD",
                    "confidence_score": 0.9,
                    "probabilities": {"Benign": 0.05, "LUAD": 0.9, "LUSC": 0.05},
                },
                "gene": {"predictions": {"EGFR": {"probability": 0.7}}},
            }

        prediction.side_effect = cancel_analysis

        self.assertEqual(run_pathology_gene_analysis(str(analysis.id)), "cancelled")
        self.assertFalse(AiResult.objects.filter(ai_analysis=analysis).exists())
        analysis.refresh_from_db()
        self.assertEqual(analysis.status, AiAnalysis.Status.CANCELLED)

    def _pending_pathology_gene_analysis(self):
        return AiAnalysis.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            source_image_asset=self.image_asset,
            model_version=self.model_version,
            analysis_type=AnalysisType.PATHOLOGY_GENE_ANALYSIS,
            status=AiAnalysis.Status.PENDING,
        )

    @patch("apps.pathology.tasks.request_pathology_prediction")
    def test_pathology_gene_task_creates_clinical_draft_after_ai_succeeds(self, prediction):
        self.clinical_result.delete()
        self.work_item.delete()
        PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            specimen=self.specimen,
            wsi=self.wsi,
            task_type=PathologyWorkItem.TaskType.PATHOLOGY_ANALYSIS,
            status=PathologyWorkItem.Status.COMPLETED,
        )
        analysis = self._pending_pathology_gene_analysis()
        prediction.return_value = {
            "tissue": {
                "predicted_label": "LUAD",
                "confidence_score": 0.9,
                "probabilities": {"Benign": 0.05, "LUAD": 0.9, "LUSC": 0.05},
            },
            "gene": {"predictions": {"EGFR": {"probability": 0.7}}},
        }

        self.assertEqual(run_pathology_gene_analysis(str(analysis.id)), "succeeded")

        draft = ClinicalResult.objects.get(
            case=self.case,
            examination_order=self.pathology_order,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
        )
        analysis.refresh_from_db()
        self.assertEqual(analysis.status, AiAnalysis.Status.SUCCEEDED)
        self.assertEqual(draft.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertEqual(draft.source_image_asset, self.image_asset)
        self.assertEqual(draft.reviewed_ai_result.ai_analysis_id, analysis.id)
        self.assertEqual(draft.pathology_detail.subtype, "LUAD")
        self.assertFalse(
            PathologyWorkItem.objects.filter(
                case=self.case,
                examination_order=self.pathology_order,
                task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            ).exists()
        )

    @patch("apps.pathology.tasks.request_pathology_prediction")
    def test_pathology_gene_task_preserves_existing_draft(self, prediction):
        self.clinical_result.result_status = ClinicalResult.ResultStatus.DRAFT
        self.clinical_result.save(update_fields=["result_status", "updated_at"])
        original_ai_result_id = self.clinical_result.reviewed_ai_result_id
        analysis = self._pending_pathology_gene_analysis()
        prediction.return_value = {
            "tissue": {
                "predicted_label": "LUAD",
                "confidence_score": 0.9,
                "probabilities": {"Benign": 0.05, "LUAD": 0.9, "LUSC": 0.05},
            },
            "gene": {"predictions": {"EGFR": {"probability": 0.7}}},
        }

        self.assertEqual(run_pathology_gene_analysis(str(analysis.id)), "succeeded")

        self.clinical_result.refresh_from_db()
        self.assertEqual(self.clinical_result.reviewed_ai_result_id, original_ai_result_id)
        self.assertEqual(
            ClinicalResult.objects.filter(
                case=self.case,
                examination_order=self.pathology_order,
                workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            ).count(),
            1,
        )
        self.assertFalse(
            PathologyWorkItem.objects.filter(
                case=self.case,
                examination_order=self.pathology_order,
                task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            ).exists()
        )

    @patch("apps.pathology.tasks.request_pathology_prediction")
    def test_pathology_gene_task_preserves_existing_confirmed_result(self, prediction):
        original_ai_result_id = self.clinical_result.reviewed_ai_result_id
        analysis = self._pending_pathology_gene_analysis()
        prediction.return_value = {
            "tissue": {
                "predicted_label": "LUAD",
                "confidence_score": 0.9,
                "probabilities": {"Benign": 0.05, "LUAD": 0.9, "LUSC": 0.05},
            },
            "gene": {"predictions": {"EGFR": {"probability": 0.7}}},
        }

        self.assertEqual(run_pathology_gene_analysis(str(analysis.id)), "succeeded")

        self.clinical_result.refresh_from_db()
        self.assertEqual(self.clinical_result.result_status, ClinicalResult.ResultStatus.CONFIRMED)
        self.assertEqual(self.clinical_result.reviewed_ai_result_id, original_ai_result_id)
        self.assertEqual(
            ClinicalResult.objects.filter(
                case=self.case,
                examination_order=self.pathology_order,
                workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            ).count(),
            1,
        )

    @patch("apps.pathology.tasks.request_pdl1_prediction")
    @patch("apps.pathology.tasks.download_pdl1_annotation_bytes", return_value=b"annotation")
    def test_pdl1_task_creates_draft_without_diagnostic_review_after_ai_succeeds(self, annotation, prediction):
        order = ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
            requesting_doctor=self.user,
            purpose="PD-L1 automatic review",
            status=ExaminationOrder.Status.ORDERED,
        )
        specimen = PathologySpecimen.objects.create(
            case=self.case,
            examination_order=order,
            specimen_code="PDL1-AUTO-REVIEW",
            specimen_type=PathologySpecimen.SpecimenType.OTHER,
            status=PathologySpecimen.Status.READY,
            created_by_user=self.user,
        )
        asset = CaseImageAsset.objects.create(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.PDL1,
            image_type=CaseImageAsset.ImageType.WSI,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gs://test-bucket/pdl1-auto.svs",
            file_format="SVS",
            status=CaseImageAsset.Status.READY,
            metadata={"pdl1_annotation": {"storage_uri": "gs://test-bucket/pdl1-auto.annotations", "roi_layer": "Tumor"}},
        )
        wsi = WholeSlideImage.objects.create(
            specimen=specimen,
            image_asset=asset,
            slide_code="PDL1-AUTO-REVIEW",
            stain=WholeSlideImage.Stain.PDL1,
            original_filename="pdl1-auto.svs",
            sha256="c" * 64,
            uploaded_by_user=self.user,
        )
        PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=order,
            specimen=specimen,
            wsi=wsi,
            task_type=PathologyWorkItem.TaskType.PD_L1_REVIEW,
            status=PathologyWorkItem.Status.COMPLETED,
        )
        analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=order,
            source_image_asset=asset,
            model_version=self.pdl1_model_version,
            analysis_type=AnalysisType.PDL1_ANALYSIS,
            status=AiAnalysis.Status.PENDING,
            input_metadata={"roi_layer": "Tumor"},
        )
        prediction.return_value = {
            "predicted_class": 0,
            "predicted_tps_range": PDL1AiResult.TpsRange.LT_1,
            "predicted_tps_range_label": "<1%",
            "confidence": 0.99,
            "probabilities": {"class_0": 0.99, "class_1": 0.01, "class_2": 0.0},
        }

        self.assertEqual(run_pdl1_analysis(str(analysis.id)), "succeeded")

        draft = ClinicalResult.objects.get(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.PDL1,
        )
        self.assertEqual(draft.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertFalse(
            PathologyWorkItem.objects.filter(
                case=self.case,
                examination_order=order,
                task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            ).exists()
        )
        self.assertEqual(run_pdl1_analysis(str(analysis.id)), "already_completed")
        self.assertFalse(
            PathologyWorkItem.objects.filter(
                case=self.case,
                examination_order=order,
                task_type=PathologyWorkItem.TaskType.DIAGNOSTIC_REVIEW,
            ).exists()
        )

    def test_workstation_excludes_analysis_for_noncurrent_he_wsi(self):
        self.wsi.is_current = False
        self.wsi.save(update_fields=["is_current", "updated_at"])
        current_asset = CaseImageAsset.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            image_type=CaseImageAsset.ImageType.WSI,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gs://test-bucket/current-slide.svs",
            file_format="SVS",
            status=CaseImageAsset.Status.READY,
        )
        WholeSlideImage.objects.create(
            specimen=self.specimen,
            image_asset=current_asset,
            slide_code=self.wsi.slide_code,
            version=2,
            stain=WholeSlideImage.Stain.HE,
            original_filename="current-slide.svs",
            sha256="b" * 64,
            is_current=True,
            uploaded_by_user=self.user,
        )
        self.authenticate_pathology_user()

        response = self.client.get(
            reverse("pathology:case-workflow", kwargs={"case_id": self.case.id}),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["orders"][0]["latest_gene_analysis"])


    def test_authenticated_user_can_read_case_pdl1_ai_results(self):
        self.authenticate_pathology_user()
        url = reverse(
            "pathology:case-pdl1-result-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["analysis_type"], "PDL1_ANALYSIS")
        detail = response.data[0]["result_detail"]["pdl1"]
        self.assertEqual(detail["predicted_class"], 2)
        self.assertEqual(detail["predicted_tps_range"], "GE_50")
        self.assertEqual(detail["predicted_tps_range_label"], "≥50%")
        self.assertNotIn("tps_percent", detail)

    @patch("apps.pathology.views.list_pdl1_test_samples")
    def test_pdl1_test_sample_list_hides_gcs_uris(self, list_samples):
        list_samples.return_value = (
            {
                "sample_id": "demo-pdl1",
                "display_name": "Demo PD-L1",
                "roi_layer": "Tumor",
            },
        )
        self.authenticate_pathology_user()

        response = self.client.get(reverse("pathology:pdl1-test-sample-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"][0]["sample_id"], "demo-pdl1")
        self.assertNotIn("wsi_gcs_uri", response.data["results"][0])
        self.assertNotIn("annotation_gcs_uri", response.data["results"][0])

    def _create_pdl1_order(self):
        return ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
            requesting_doctor=self.user,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="PD-L1 upload test",
            status=ExaminationOrder.Status.ORDERED,
        )

    @patch("apps.pathology.views.upload_pdl1_input")
    def test_pdl1_input_upload_links_two_files_to_the_independent_order(self, upload):
        order = self._create_pdl1_order()
        upload.side_effect = ["gs://bucket/pathology/pdl1/wsi/input.svs", "gs://bucket/pathology/pdl1/annotation/input.annotations"]
        self.authenticate_pathology_user()
        response = self.client.post(
            reverse("pathology:order-pdl1-input-upload", kwargs={"order_id": order.id}),
            {"wsi_file": SimpleUploadedFile("input.svs", b"wsi"), "annotation_file": SimpleUploadedFile("input.annotations", b"annotation"), "roi_layer": "Tumor"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["upload_ready"])
        asset = CaseImageAsset.objects.get(id=response.data["wsi"]["image_asset_id"])
        self.assertEqual(asset.status, CaseImageAsset.Status.READY)
        self.assertEqual(asset.metadata["pdl1_annotation"]["storage_uri"], "gs://bucket/pathology/pdl1/annotation/input.annotations")
        self.assertEqual(WholeSlideImage.objects.get(image_asset=asset).stain, WholeSlideImage.Stain.PDL1)
        self.assertEqual(upload.call_count, 2)

    @patch("apps.pathology.views.create_and_upload_wsi_preview")
    @patch("apps.pathology.views.register_wsi_with_orthanc_task.delay")
    @patch("apps.pathology.views.upload_pdl1_input")
    def test_pdl1_upload_enqueues_wsi_orthanc_registration(self, upload, delay, preview):
        order = self._create_pdl1_order()
        upload.side_effect = [
            "gs://bucket/pathology/pdl1/wsi/input.svs",
            "gs://bucket/pathology/pdl1/annotation/input.annotations",
        ]
        self.authenticate_pathology_user()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse("pathology:order-pdl1-input-upload", kwargs={"order_id": order.id}),
                {
                    "wsi_file": SimpleUploadedFile("input.svs", b"wsi"),
                    "annotation_file": SimpleUploadedFile("input.annotations", b"annotation"),
                    "roi_layer": "Tumor",
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        delay.assert_called_once_with(str(response.data["wsi"]["id"]))

    @patch("apps.pathology.views.create_and_upload_wsi_preview")
    @patch("apps.pathology.views.register_wsi_with_orthanc_task.delay")
    @patch("apps.pathology.views.upload_pathology_wsi", return_value="gs://bucket/pathology/he/input.svs")
    def test_he_upload_enqueues_wsi_orthanc_registration(self, upload, delay, preview):
        self.authenticate_pathology_user()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse("pathology:order-pathology-gene-input-upload", kwargs={"order_id": self.pathology_order.id}),
                {"wsi_file": SimpleUploadedFile("input.svs", b"he-wsi")},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        delay.assert_called_once_with(str(response.data["wsi_id"]))

    @patch("apps.pathology.tasks.register_wsi_with_orthanc")
    def test_wsi_orthanc_registration_task_delegates_without_touching_ai(self, register):
        register.return_value = "registered"

        outcome = register_wsi_with_orthanc_task(str(self.wsi.id))

        self.assertEqual(outcome, "registered")
        register.assert_called_once_with(str(self.wsi.id))

    def test_wsi_registration_persists_only_the_new_orthanc_series(self):
        from apps.pathology.services import wsi_orthanc_registration

        with patch.object(
            wsi_orthanc_registration,
            "_orthanc_request",
            side_effect=[
                ["older-series", "new-series"],
                {"Instances": ["new-instance"], "MainDicomTags": {"SeriesInstanceUID": "1.2.3.4"}},
                {"MainDicomTags": {"StudyInstanceUID": "1.2.3", "SOPInstanceUID": "1.2.3.4.5"}},
            ],
        ):
            series_id = wsi_orthanc_registration._persist_new_series(
                wsi_id=str(self.wsi.id),
                before_series_ids={"older-series"},
            )

        self.wsi.refresh_from_db()
        self.assertEqual(series_id, "new-series")
        self.assertEqual(self.wsi.orthanc_series_id, "new-series")
        self.assertEqual(self.wsi.orthanc_instance_id, "new-instance")
        self.assertEqual(self.wsi.study_instance_uid, "1.2.3")
        self.assertEqual(self.wsi.series_instance_uid, "1.2.3.4")
        self.assertEqual(self.wsi.sop_instance_uid, "1.2.3.4.5")

    @patch("apps.pathology.views.upload_pdl1_input", side_effect=PDL1StorageError("GCS unavailable"))
    def test_pdl1_input_upload_failure_creates_no_ready_asset(self, upload):
        order = self._create_pdl1_order()
        self.authenticate_pathology_user()
        response = self.client.post(
            reverse("pathology:order-pdl1-input-upload", kwargs={"order_id": order.id}),
            {"wsi_file": SimpleUploadedFile("input.svs", b"wsi"), "annotation_file": SimpleUploadedFile("input.annotations", b"annotation"), "roi_layer": "Tumor"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertFalse(CaseImageAsset.objects.filter(examination_order=order).exists())

    @patch("apps.pathology.views.run_pdl1_analysis.delay")
    def test_pdl1_analysis_requires_uploaded_pair_then_enqueues(self, delay):
        order = self._create_pdl1_order()
        self.authenticate_pathology_user()
        url = reverse("pathology:case-pdl1-analysis-run", kwargs={"case_id": self.case.id})
        response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        asset = CaseImageAsset.objects.create(case=self.case, examination_order=order, workflow_stage=WorkflowStage.PDL1, image_type=CaseImageAsset.ImageType.WSI, storage_type=CaseImageAsset.StorageType.GCS, storage_uri="gs://bucket/pdl1/input.svs", file_format="SVS", status=CaseImageAsset.Status.READY, metadata={"pdl1_annotation": {"storage_uri": "gs://bucket/pdl1/input.annotations", "roi_layer": "Tumor"}})
        specimen = PathologySpecimen.objects.create(case=self.case, examination_order=order, specimen_code="PDL1-UPLOAD", specimen_type=PathologySpecimen.SpecimenType.OTHER, status=PathologySpecimen.Status.READY, created_by_user=self.user)
        WholeSlideImage.objects.create(specimen=specimen, image_asset=asset, slide_code="PDL1-UPLOAD", stain=WholeSlideImage.Stain.PDL1, original_filename="input.svs", sha256="a" * 64, uploaded_by_user=self.user)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        analysis = AiAnalysis.objects.get(id=response.data["id"])
        self.assertEqual(analysis.source_image_asset, asset)
        self.assertEqual(analysis.input_metadata, {"roi_layer": "Tumor"})
        delay.assert_called_once_with(str(analysis.id))

    @patch("apps.pathology.views.run_pdl1_analysis.delay")
    def test_pdl1_analysis_does_not_use_a_completed_order_as_active(self, delay):
        order = self._create_pdl1_order()
        order.status = ExaminationOrder.Status.COMPLETED
        order.save(update_fields=["status", "updated_at"])
        self.authenticate_pathology_user()

        response = self.client.post(
            reverse("pathology:case-pdl1-analysis-run", kwargs={"case_id": self.case.id}),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        delay.assert_not_called()

    def test_pdl1_draft_uses_the_order_linked_to_wsi_and_analysis(self):
        ExaminationOrder.objects.create(
            case=self.case,
            order_type=ExaminationOrder.OrderType.PDL1,
            requesting_doctor=self.user,
            priority=ExaminationOrder.Priority.NORMAL,
            purpose="Historical PD-L1",
            status=ExaminationOrder.Status.COMPLETED,
        )
        order = self._create_pdl1_order()
        asset = CaseImageAsset.objects.create(
            case=self.case,
            examination_order=order,
            workflow_stage=WorkflowStage.PDL1,
            image_type=CaseImageAsset.ImageType.WSI,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gs://bucket/pdl1/confirm.svs",
            file_format="SVS",
            status=CaseImageAsset.Status.READY,
        )
        specimen = PathologySpecimen.objects.create(
            case=self.case,
            examination_order=order,
            specimen_code="PDL1-CONFIRM",
            specimen_type=PathologySpecimen.SpecimenType.OTHER,
            status=PathologySpecimen.Status.READY,
            created_by_user=self.user,
        )
        wsi = WholeSlideImage.objects.create(
            specimen=specimen,
            image_asset=asset,
            slide_code="PDL1-CONFIRM",
            stain=WholeSlideImage.Stain.PDL1,
            original_filename="confirm.svs",
            sha256="b" * 64,
            uploaded_by_user=self.user,
        )
        analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=order,
            source_image_asset=asset,
            model_version=self.pdl1_model_version,
            analysis_type=AnalysisType.PDL1_ANALYSIS,
            status=AiAnalysis.Status.SUCCEEDED,
        )
        ai_result = AiResult.objects.create(
            ai_analysis=analysis,
            schema_version="pdl1-v1",
            result_payload={},
        )
        self.department_role.role = DepartmentRole.Role.DOCTOR
        self.department_role.save(update_fields=["role"])
        self.authenticate_pathology_user()

        response = self.client.post(
            reverse("pathology:pdl1-result-draft", kwargs={"case_id": self.case.id}),
            {
                "ai_analysis_id": str(analysis.id),
                "source_wsi_id": str(wsi.id),
                "tps_percent": "55.00",
                "interpretation": "Positive",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        clinical_result = ClinicalResult.objects.get(id=response.data["id"])
        self.assertEqual(clinical_result.examination_order, order)
        self.assertEqual(clinical_result.reviewed_ai_result, ai_result)
        self.assertEqual(clinical_result.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertIsNone(clinical_result.confirmed_by_user_id)
        self.assertEqual(PDL1Result.objects.get(clinical_result=clinical_result).source_wsi, wsi)

    def test_unauthenticated_user_cannot_access_case_diagnoses(self):
        url = reverse(
            "pathology:case-diagnosis-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.get(url)

        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_authenticated_user_can_read_case_diagnoses(self):
        self.client.force_authenticate(user=self.user)
        url = reverse(
            "pathology:case-diagnosis-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(str(response.data[0]["case_id"]), str(self.case.id))
        self.assertEqual(response.data[0]["result_status"], "CONFIRMED")
        self.assertEqual(
            response.data[0]["pathology"]["diagnosis_summary"],
            "Confirmed pathology diagnosis",
        )

    def test_unauthenticated_user_cannot_access_case_reports(self):
        url = reverse(
            "pathology:case-report-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.get(url)

        self.assertIn(
            response.status_code,
            [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN],
        )

    def test_case_reports_include_only_confirmed_pathology_results(self):
        draft = ClinicalResult.objects.create(
            case=self.case,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        PathologyResult.objects.create(
            clinical_result=draft,
            malignancy_status=PathologyResult.MalignancyStatus.BENIGN,
            diagnosis_summary="Unconfirmed draft",
        )
        self.client.force_authenticate(user=self.user)
        url = reverse(
            "pathology:case-report-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(str(response.data[0]["id"]), str(self.clinical_result.id))
        self.assertEqual(response.data[0]["patient_name"], self.patient.name)
        self.assertEqual(
            response.data[0]["specimen"]["specimen_code"],
            self.specimen.specimen_code,
        )
        self.assertEqual(response.data[0]["wsi"]["slide_code"], self.wsi.slide_code)
        self.assertEqual(
            response.data[0]["diagnosis"]["diagnosis_summary"],
            "Confirmed pathology diagnosis",
        )

    def test_authenticated_user_can_create_draft_diagnosis(self):
        self.authenticate_pathology_user()
        url = reverse(
            "pathology:case-diagnosis-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.post(
            url,
            {
                "malignancy_status": "MALIGNANT",
                "histologic_type": "NSCLC",
                "subtype": "Squamous cell carcinoma",
                "diagnosis_summary": "Draft diagnosis",
                "work_item_id": str(self.work_item.id),
                "source_image_asset_id": str(self.image_asset.id),
                "reviewed_ai_result_id": str(self.ai_result.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["result_status"], "DRAFT")
        self.assertEqual(
            response.data["pathology"]["diagnosis_summary"],
            "Draft diagnosis",
        )
        self.work_item.refresh_from_db()
        self.assertEqual(
            self.work_item.status,
            PathologyWorkItem.Status.IN_PROGRESS,
        )

    def test_authenticated_user_can_update_draft_diagnosis(self):
        draft = ClinicalResult.objects.create(
            case=self.case,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        PathologyResult.objects.create(
            clinical_result=draft,
            malignancy_status=PathologyResult.MalignancyStatus.INDETERMINATE,
        )
        self.authenticate_pathology_user()
        url = reverse(
            "pathology:diagnosis-detail",
            kwargs={"diagnosis_id": draft.id},
        )

        response = self.client.patch(
            url,
            {
                "malignancy_status": "BENIGN",
                "diagnosis_summary": "Updated draft",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["pathology"]["malignancy_status"],
            "BENIGN",
        )
        self.assertEqual(
            response.data["pathology"]["diagnosis_summary"],
            "Updated draft",
        )

    def test_pathology_user_cannot_confirm_draft_diagnosis(self):
        draft = ClinicalResult.objects.create(
            case=self.case,
            workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        PathologyResult.objects.create(
            clinical_result=draft,
            malignancy_status=PathologyResult.MalignancyStatus.BENIGN,
        )
        self.authenticate_pathology_user()
        url = reverse(
            "pathology:diagnosis-confirm",
            kwargs={"diagnosis_id": draft.id},
        )

        response = self.client.post(
            url,
            {"work_item_id": str(self.work_item.id)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        draft.refresh_from_db()
        self.assertEqual(draft.result_status, ClinicalResult.ResultStatus.DRAFT)
        self.assertIsNone(draft.confirmed_by_user_id)
        self.work_item.refresh_from_db()
        self.assertNotEqual(self.work_item.status, PathologyWorkItem.Status.COMPLETED)
        self.assertIsNone(self.work_item.completed_at)

    def test_draft_creation_requires_matching_diagnostic_review_work_item(self):
        self.authenticate_pathology_user()
        self.work_item.task_type = PathologyWorkItem.TaskType.PATHOLOGY_ANALYSIS
        self.work_item.save(update_fields=["task_type", "updated_at"])
        url = reverse(
            "pathology:case-diagnosis-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.post(
            url,
            {
                "work_item_id": str(self.work_item.id),
                "malignancy_status": "MALIGNANT",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("work_item_id", response.data)

    def test_confirmed_diagnosis_cannot_be_updated(self):
        self.authenticate_pathology_user()
        url = reverse(
            "pathology:diagnosis-detail",
            kwargs={"diagnosis_id": self.clinical_result.id},
        )

        response = self.client.patch(
            url,
            {"diagnosis_summary": "Changed after confirmation"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
