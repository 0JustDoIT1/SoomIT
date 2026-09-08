from datetime import date
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import (
    AiAnalysis,
    AiResult,
    ModelVersion,
    PathologyAiResult,
    PDL1AiResult,
    SpecimenAdequacyAiResult,
)
from apps.cases.models import CaseImageAsset, LungCancerCase, Stage
from apps.clinical.models import ClinicalResult, PathologyResult
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

        self.pdl1_model_version = ModelVersion.objects.create(
            model_name="pdl1-amd-mil",
            version="final_model",
            analysis_type="PDL1_CLASSIFICATION",
        )
        self.pdl1_analysis = AiAnalysis.objects.create(
            case=self.case,
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
        self.client.force_authenticate(user=self.user)
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
    def test_failed_pdl1_service_call_is_recorded(self, mock_predict):
        from apps.pathology.services.pdl1_inference import PDL1InferenceError

        mock_predict.side_effect = PDL1InferenceError(
            "추론 서비스에 연결할 수 없습니다.",
        )
        self.client.force_authenticate(user=self.user)
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

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        analysis = AiAnalysis.objects.get(id=response.data["analysis_id"])
        self.assertEqual(analysis.status, AiAnalysis.Status.FAILED)
        self.assertIsNotNone(analysis.completed_at)
        self.assertFalse(hasattr(analysis, "ai_result"))

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
