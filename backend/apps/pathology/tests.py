from datetime import date
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import (
    AiAnalysis,
    AiResult,
    ModelVersion,
    PathologyAiResult,
    PDL1AiResult,
    SpecimenAdequacyAiResult,
)
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, Stage
from apps.clinical.models import ClinicalResult, PathologyResult
from apps.patients.models import Patient
from apps.pathology.models import (
    PathologySpecimen,
    PathologyWorkItem,
    WholeSlideImage,
)
from apps.pathology.services.workflow import calculate_workflow_status


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
            current_stage=Stage.PATHOLOGY,
        )

        self.pathology_order = ExaminationOrder.objects.create(
            case=self.case,
            exam_type=ExaminationOrder.ExamType.WSI,
            pathology_test_type=ExaminationOrder.PathologyTestType.SUBTYPE,
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
            uploaded_stage=Stage.PATHOLOGY,
            image_type=CaseImageAsset.ImageType.WSI,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gcs://test-bucket/test-slide.svs",
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
            analysis_type="PATHOLOGY_DIAGNOSIS",
        )
        self.ai_analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            source_image_asset=self.image_asset,
            model_version=self.model_version,
            analysis_type="PATHOLOGY_DIAGNOSIS",
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

        self.adequacy_model_version = ModelVersion.objects.create(
            model_name="adequacy-model",
            version="1.0",
            analysis_type="SPECIMEN_ADEQUACY",
        )
        self.adequacy_analysis = AiAnalysis.objects.create(
            case=self.case,
            source_image_asset=self.image_asset,
            model_version=self.adequacy_model_version,
            analysis_type="SPECIMEN_ADEQUACY",
            status=AiAnalysis.Status.SUCCEEDED,
        )
        self.adequacy_result = AiResult.objects.create(
            ai_analysis=self.adequacy_analysis,
            schema_version="1.0",
            result_payload={},
        )
        SpecimenAdequacyAiResult.objects.create(
            ai_result=self.adequacy_result,
            adequacy_status="ADEQUATE",
            tumor_cell_ratio=62.50,
            confidence=0.9250,
        )

        self.pdl1_model_version = ModelVersion.objects.create(
            model_name="pdl1-amd-mil",
            version="final_model",
            analysis_type="PDL1_CLASSIFICATION",
        )
        self.pdl1_analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=self.pathology_order,
            source_image_asset=self.image_asset,
            model_version=self.pdl1_model_version,
            analysis_type="PDL1_CLASSIFICATION",
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
            stage=Stage.PATHOLOGY,
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
        self.assertFalse(
            ClinicalResult.objects.filter(
                case=self.case,
                result_status=ClinicalResult.ResultStatus.DRAFT,
            ).exists()
        )

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
            current_stage=Stage.PATHOLOGY,
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
            current_stage=Stage.PATHOLOGY,
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
            exam_type=ExaminationOrder.ExamType.WSI,
            pathology_test_type=ExaminationOrder.PathologyTestType.PDL1,
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
            uploaded_stage=Stage.PATHOLOGY,
            image_type=CaseImageAsset.ImageType.WSI,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gcs://test-bucket/pdl1-slide.svs",
            file_format="SVS",
            status=CaseImageAsset.Status.READY,
        )
        pdl1_analysis = AiAnalysis.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            source_image_asset=pdl1_asset,
            model_version=self.pdl1_model_version,
            analysis_type="PDL1_CLASSIFICATION",
            status=AiAnalysis.Status.SUCCEEDED,
        )
        AiResult.objects.create(
            ai_analysis=pdl1_analysis,
            schema_version="1.0",
            result_payload={},
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
            exam_type=ExaminationOrder.ExamType.WSI,
            pathology_test_type=ExaminationOrder.PathologyTestType.GENE,
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
            exam_type=ExaminationOrder.ExamType.WSI,
            pathology_test_type=ExaminationOrder.PathologyTestType.PDL1,
            requesting_doctor=self.user,
            purpose="PD-L1 follow-up",
        )
        gene_order = ExaminationOrder.objects.create(
            case=self.case,
            exam_type=ExaminationOrder.ExamType.WSI,
            pathology_test_type=ExaminationOrder.PathologyTestType.GENE,
            requesting_doctor=self.user,
            purpose="Gene follow-up",
        )
        pdl1_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
        )
        gene_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=gene_order,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
        )
        self.authenticate_pathology_user()

        response = self.client.get(reverse("pathology:workstation-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(str(response.data["results"][0]["case_id"]), str(self.case.id))

        detail_response = self.client.get(
            reverse("pathology:case-workflow", kwargs={"case_id": self.case.id})
        )
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["pathology_test_type"] for item in detail_response.data["orders"]],
            ["SUBTYPE", "PDL1", "GENE"],
        )
        results = {
            item["pathology_test_type"]: item for item in detail_response.data["orders"]
        }
        pdl1_row = results["PDL1"]
        gene_row = results["GENE"]
        self.assertEqual(pdl1_row["pathology_test_type"], "PDL1")
        self.assertEqual(pdl1_row["pathology_test_type_label"], "PD-L1 검사")
        self.assertEqual(pdl1_row["current_exam_or_task"], "PD-L1 검사")
        self.assertEqual(pdl1_row["requesting_doctor"]["id"], self.user.id)
        self.assertIsNone(pdl1_row["specimen"])
        self.assertIsNone(pdl1_row["latest_wsi"])
        self.assertIsNone(pdl1_row["latest_ai_analysis"])
        self.assertEqual(pdl1_row["workflow_status"], "SCHEDULED")
        self.assertEqual(gene_row["pathology_test_type"], "GENE")
        self.assertEqual(gene_row["pathology_test_type_label"], "유전자 검사")
        self.assertEqual(gene_row["current_exam_or_task"], "유전자 검사")
        self.assertIsNone(gene_row["specimen"])
        self.assertIsNone(gene_row["latest_wsi"])
        self.assertIsNone(gene_row["latest_ai_analysis"])

    def test_pathology_test_filter_does_not_include_other_orders_from_same_case(self):
        pdl1_order = ExaminationOrder.objects.create(
            case=self.case,
            exam_type=ExaminationOrder.ExamType.WSI,
            pathology_test_type=ExaminationOrder.PathologyTestType.PDL1,
            requesting_doctor=self.user,
            purpose="PD-L1 follow-up",
        )
        pdl1_work_item = PathologyWorkItem.objects.create(
            case=self.case,
            examination_order=pdl1_order,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
        )
        self.authenticate_pathology_user()

        response = self.client.get(
            reverse("pathology:workstation-list"),
            {"pathology_test_type": "PDL1"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(str(response.data["results"][0]["id"]), str(pdl1_work_item.id))

    def test_review_and_diagnosis_reject_ai_result_from_another_order(self):
        pdl1_order = ExaminationOrder.objects.create(
            case=self.case,
            exam_type=ExaminationOrder.ExamType.WSI,
            pathology_test_type=ExaminationOrder.PathologyTestType.PDL1,
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

        self.client.force_authenticate(user=self.user)
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
            current_stage=Stage.PATHOLOGY,
        )
        PathologyWorkItem.objects.create(
            case=other_case,
            task_type=PathologyWorkItem.TaskType.WSI_UPLOAD,
        )
        self.authenticate_pathology_user()

        response = self.client.get(reverse("pathology:workstation-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(
            str(response.data["results"][0]["id"]),
            str(self.work_item.id),
        )
        self.assertEqual(
            response.data["results"][0]["workflow_status"],
            "REVIEW_COMPLETED",
        )

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
        self.assertEqual(matching_response.data["count"], 1)
        self.assertEqual(
            matching_response.data["results"][0]["workflow_status"],
            "REVIEW_COMPLETED",
        )
        self.assertEqual(non_matching_response.status_code, status.HTTP_200_OK)
        self.assertEqual(non_matching_response.data["count"], 0)

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
        self.client.force_authenticate(user=self.user)

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
        self.client.force_authenticate(user=self.user)

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
        self.client.force_authenticate(user=self.user)

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
        self.client.force_authenticate(user=self.user)

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
        self.client.force_authenticate(user=self.user)

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
        self.client.force_authenticate(user=self.user)
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
        self.assertEqual(response.data[0]["analysis_type"], "PATHOLOGY_DIAGNOSIS")
        self.assertEqual(
            response.data[0]["result_detail"]["pathology"]["predicted_subtype"],
            "Adenocarcinoma",
        )

    def test_authenticated_user_can_read_case_adequacy_ai_results(self):
        self.client.force_authenticate(user=self.user)
        url = reverse(
            "pathology:case-adequacy-result-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["analysis_type"], "SPECIMEN_ADEQUACY")
        self.assertEqual(
            response.data[0]["result_detail"]["specimen_adequacy"]["adequacy_status"],
            "ADEQUATE",
        )

    def test_authenticated_user_can_read_case_pdl1_ai_results(self):
        self.client.force_authenticate(user=self.user)
        url = reverse(
            "pathology:case-pdl1-result-list",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["analysis_type"], "PDL1_CLASSIFICATION")
        detail = response.data[0]["result_detail"]["pdl1"]
        self.assertEqual(detail["predicted_class"], 2)
        self.assertEqual(detail["predicted_tps_range"], "GE_50")
        self.assertEqual(detail["predicted_tps_range_label"], "≥50%")
        self.assertNotIn("tps_percent", detail)

    @patch("apps.pathology.views.request_pdl1_prediction")
    def test_authenticated_user_can_run_pdl1_analysis(self, mock_predict):
        mock_predict.return_value = {
            "main_index": "P-0019599",
            "pdl1_image_id": "597881",
            "patch_count": 1059,
            "predicted_class": 2,
            "predicted_tps_range": "GE_50",
            "confidence": 0.9977335929870605,
            "probabilities": {
                "class_0": 0.000016584608601988293,
                "class_1": 0.002249843906611204,
                "class_2": 0.9977335929870605,
            },
        }
        self.pathology_order.pathology_test_type = ExaminationOrder.PathologyTestType.PDL1
        self.pathology_order.save(update_fields=["pathology_test_type", "updated_at"])
        self.authenticate_pathology_user()
        url = reverse(
            "pathology:case-pdl1-analysis-run",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.post(
            url,
            {
                "feature_file": SimpleUploadedFile(
                    "slide-features.pt",
                    b"serialized-features",
                    content_type="application/octet-stream",
                ),
                "wsi_id": str(self.wsi.id),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], AiAnalysis.Status.SUCCEEDED)
        self.assertEqual(
            response.data["result_detail"]["pdl1"]["predicted_tps_range"],
            "GE_50",
        )
        self.assertNotIn(
            "tps_percent",
            response.data["result_detail"]["pdl1"],
        )
        created_analysis = AiAnalysis.objects.get(id=response.data["id"])
        self.assertEqual(created_analysis.source_image_asset, self.image_asset)
        self.assertEqual(created_analysis.ai_result.pdl1_detail.predicted_class, 2)
        mock_predict.assert_called_once_with(b"serialized-features")

    @patch("apps.pathology.views.request_pdl1_prediction")
    def test_pdl1_analysis_requires_wsi_from_pdl1_order(self, mock_predict):
        from apps.pathology.services.pdl1_inference import PDL1InferenceError

        mock_predict.side_effect = PDL1InferenceError(
            "추론 서비스에 연결할 수 없습니다.",
        )
        self.authenticate_pathology_user()
        url = reverse(
            "pathology:case-pdl1-analysis-run",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.post(
            url,
            {
                "feature_file": SimpleUploadedFile("features.pt", b"features"),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("wsi_id", response.data)
        mock_predict.assert_not_called()

    def test_pdl1_analysis_rejects_non_pt_file(self):
        self.client.force_authenticate(user=self.user)
        url = reverse(
            "pathology:case-pdl1-analysis-run",
            kwargs={"case_id": self.case.id},
        )

        response = self.client.post(
            url,
            {"feature_file": SimpleUploadedFile("features.txt", b"features")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("feature_file", response.data)

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
            stage=Stage.PATHOLOGY,
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
        self.client.force_authenticate(user=self.user)
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
            stage=Stage.PATHOLOGY,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        PathologyResult.objects.create(
            clinical_result=draft,
            malignancy_status=PathologyResult.MalignancyStatus.INDETERMINATE,
        )
        self.client.force_authenticate(user=self.user)
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

    def test_authenticated_user_can_confirm_draft_diagnosis(self):
        draft = ClinicalResult.objects.create(
            case=self.case,
            stage=Stage.PATHOLOGY,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        PathologyResult.objects.create(
            clinical_result=draft,
            malignancy_status=PathologyResult.MalignancyStatus.BENIGN,
        )
        self.client.force_authenticate(user=self.user)
        url = reverse(
            "pathology:diagnosis-confirm",
            kwargs={"diagnosis_id": draft.id},
        )

        response = self.client.post(
            url,
            {"work_item_id": str(self.work_item.id)},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["result_status"], "CONFIRMED")
        self.assertEqual(response.data["confirmed_by_name"], self.user.name)
        self.assertIsNotNone(response.data["confirmed_at"])
        self.work_item.refresh_from_db()
        self.assertEqual(
            self.work_item.status,
            PathologyWorkItem.Status.COMPLETED,
        )
        self.assertIsNotNone(self.work_item.completed_at)

    def test_draft_creation_requires_matching_diagnostic_review_work_item(self):
        self.client.force_authenticate(user=self.user)
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
        self.client.force_authenticate(user=self.user)
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
