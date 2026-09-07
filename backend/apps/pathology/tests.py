from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import (
    AiAnalysis,
    AiResult,
    ModelVersion,
    PathologyAiResult,
    SpecimenAdequacyAiResult,
)
from apps.cases.models import CaseImageAsset, LungCancerCase, Stage
from apps.patients.models import Patient
from apps.pathology.models import (
    PathologySpecimen,
    PathologyWorkItem,
    WholeSlideImage,
)


class PathologyReadAPITestCase(APITestCase):
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
            role=DepartmentRole.Role.DOCTOR,
            display_name="병리과 전문의",
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

        self.specimen = PathologySpecimen.objects.create(
            case=self.case,
            specimen_code="SPECIMEN-001",
            specimen_type=PathologySpecimen.SpecimenType.BIOPSY,
            body_site="Lung",
            status=PathologySpecimen.Status.READY,
            created_by_user=self.user,
        )

        self.image_asset = CaseImageAsset.objects.create(
            case=self.case,
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
