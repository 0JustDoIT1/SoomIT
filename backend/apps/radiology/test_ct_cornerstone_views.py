import json
from datetime import date
from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import AiAnalysis, AiResult, CtAiResult, ModelVersion
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import Patient

from .services.ct_cornerstone_storage import CtCornerstoneStorageError


CORNERSTONE_SEGMENTATION = {
    "schema_version": "ct-cornerstone-labelmap-v1",
    "scalar_type": "uint8",
    "dimensions": [12, 12, 12],
    "labelmap_uri": "gs://soomit-bucket/ct-analysis/h/c/o/a/phase1/cornerstone/labelmap.bin",
    "metadata_uri": "gs://soomit-bucket/ct-analysis/h/c/o/a/phase1/cornerstone/labelmap_metadata.json",
    "geometry_uri": "gs://soomit-bucket/ct-analysis/h/c/o/a/phase1/cornerstone/geometry.json",
    "segments": [
        {"segment_index": 1, "id": "N001", "name": "Nodule 1", "category": "NODULE", "color": [255, 59, 48]},
    ],
}

GEOMETRY = {
    "dimensions": [12, 12, 12],
    "spacing": [0.7, 0.7, 1.0],
    "origin": [-180.0, -180.0, -380.0],
    "direction": [1, 0, 0, 0, 1, 0, 0, 0, 1],
    "voxel_order": "slice_row_column",
}


@override_settings(SOOMIT_RADIOLOGY_DEPARTMENT_CODE="RADIOLOGY")
class CornerstoneSegmentationViewsTestCase(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="테스트병원", code="TEST-HOSPITAL")
        self.other_hospital = Hospital.objects.create(name="다른병원", code="OTHER-HOSPITAL")
        department = Department.objects.create(hospital=self.hospital, code="RADIOLOGY", name="영상의학과")
        other_department = Department.objects.create(hospital=self.other_hospital, code="RADIOLOGY", name="영상의학과")
        role = DepartmentRole.objects.create(
            department=department, role=DepartmentRole.Role.TECHNOLOGIST, display_name="방사선사",
        )
        other_role = DepartmentRole.objects.create(
            department=other_department, role=DepartmentRole.Role.TECHNOLOGIST, display_name="방사선사",
        )
        doctor_role = DepartmentRole.objects.create(
            department=department, role=DepartmentRole.Role.DOCTOR, display_name="의사",
        )
        self.user = User.objects.create_user(
            login_id="radiology", password="test-password", name="radiology", department_role=role,
            account_status=User.AccountStatus.ACTIVE,
        )
        self.other_user = User.objects.create_user(
            login_id="other-radiology", password="test-password", name="other-radiology", department_role=other_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        doctor = User.objects.create_user(
            login_id="doctor", password="test-password", name="doctor", department_role=doctor_role,
            account_status=User.AccountStatus.ACTIVE,
        )
        patient = Patient.objects.create(
            hospital=self.hospital, patient_code="P001", name="환자", birth_date=date(1960, 1, 1),
            sex=Patient.Sex.MALE, phone_number="010-0000-0000", phone_number_hash="hash-1",
        )
        case = LungCancerCase.objects.create(
            patient=patient, case_code="CASE-001", primary_doctor=doctor, current_stage=WorkflowStage.CT,
        )
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
        self.analysis = AiAnalysis.objects.create(
            case=case, source_image_asset=asset, analysis_type="CT_ANALYSIS",
            model_version=model_version, status=AiAnalysis.Status.SUCCEEDED,
        )
        ai_result = AiResult.objects.create(
            ai_analysis=self.analysis,
            schema_version="ct-phase1-v1",
            result_payload={"cornerstone_segmentation": CORNERSTONE_SEGMENTATION},
            result_files=[],
        )
        CtAiResult.objects.create(ai_result=ai_result, overall_malignancy_risk=None)

        self.metadata_url = reverse("radiology:analysis-cornerstone-segmentation", kwargs={"analysis_id": self.analysis.id})
        self.labelmap_url = reverse("radiology:analysis-cornerstone-labelmap", kwargs={"analysis_id": self.analysis.id})
        self._authenticate(self.user, self.hospital)

    def _authenticate(self, user, hospital):
        token = AccessToken.for_user(user)
        token["hospital_id"] = str(hospital.id)
        token["department_id"] = str(user.department_role.department_id)
        token["department_code"] = "RADIOLOGY"
        token["role"] = "TECHNOLOGIST"
        self.client.force_authenticate(user=user, token=token)

    @patch("apps.radiology.views.download_ct_cornerstone_object")
    def test_metadata_endpoint_returns_geometry_and_segments(self, download):
        download.return_value = json.dumps(GEOMETRY).encode("utf-8")

        response = self.client.get(self.metadata_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        download.assert_called_once_with(CORNERSTONE_SEGMENTATION["geometry_uri"])
        self.assertEqual(response.data["scalar_type"], "uint8")
        self.assertEqual(response.data["spacing"], GEOMETRY["spacing"])
        self.assertEqual(response.data["origin"], GEOMETRY["origin"])
        self.assertEqual(response.data["direction"], GEOMETRY["direction"])
        self.assertEqual(response.data["segments"], CORNERSTONE_SEGMENTATION["segments"])
        self.assertTrue(response.data["labelmap_url"].endswith(self.labelmap_url))

    @patch("apps.radiology.views.download_ct_cornerstone_object")
    def test_labelmap_endpoint_streams_binary_content(self, download):
        download.return_value = b"\x00\x01\x02"

        response = self.client.get(self.labelmap_url, HTTP_ACCEPT="application/octet-stream")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        download.assert_called_once_with(CORNERSTONE_SEGMENTATION["labelmap_uri"])
        self.assertEqual(response.content, b"\x00\x01\x02")
        self.assertEqual(response["Content-Type"], "application/octet-stream")

    @patch("apps.radiology.views.download_ct_cornerstone_object", side_effect=CtCornerstoneStorageError("boom"))
    def test_labelmap_endpoint_returns_502_on_storage_error(self, download):
        response = self.client.get(self.labelmap_url)
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)

    def test_missing_cornerstone_segmentation_returns_404(self):
        self.analysis.ai_result.result_payload = {}
        self.analysis.ai_result.save(update_fields=["result_payload"])

        self.assertEqual(self.client.get(self.metadata_url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(self.labelmap_url).status_code, status.HTTP_404_NOT_FOUND)

    def test_other_hospitals_staff_cannot_access_the_analysis(self):
        self._authenticate(self.other_user, self.other_hospital)

        self.assertEqual(self.client.get(self.metadata_url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(self.labelmap_url).status_code, status.HTTP_404_NOT_FOUND)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None, token=None)
        self.assertEqual(self.client.get(self.metadata_url).status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(self.client.get(self.labelmap_url).status_code, status.HTTP_401_UNAUTHORIZED)
