import json
from datetime import date
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.ai_results.models import AiAnalysis, AiResult, CtAiResult, ModelVersion
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import Patient


SEGMENTATION = {
    "schema_version": "ct-cornerstone-labelmap-v1",
    "scalar_type": "uint8",
    "dimensions": [2, 2, 2],
    "geometry_uri": "gs://private-bucket/ct/geometry.json",
    "labelmap_uri": "gs://private-bucket/ct/labelmap.bin",
    "segments": [{"segment_index": 1, "id": "N001", "name": "Nodule 1", "category": "NODULE", "color": [255, 0, 0]}],
}
GEOMETRY = {"spacing": [0.7, 0.7, 1.0], "origin": [0, 0, 0], "direction": [1, 0, 0, 0, 1, 0, 0, 0, 1]}
VISUALIZATION = {
    "layers": [{
        "id": "nodule-1", "name": "Nodule 1", "category": "NODULE", "color": "#ff0000",
        "default_visible": True, "default_opacity": 0.7, "supported_render_modes": ["surface"],
        "vertex_count": 10, "face_count": 8, "size_bytes": 100, "mesh_uri": "gs://private-bucket/ct/nodule-1.glb",
    }],
}


class DoctorCtSegmentationAPITests(TestCase):
    def setUp(self):
        hospital = Hospital.objects.create(name="CT Hospital", code="CT-HOSPITAL")
        department = Department.objects.create(hospital=hospital, code="PULMONOLOGY", name="Pulmonology")
        role = DepartmentRole.objects.create(department=department, role=DepartmentRole.Role.DOCTOR, display_name="Doctor")
        self.doctor = User.objects.create_user(login_id="ct-doctor", password="test", name="Doctor", department_role=role, account_status=User.AccountStatus.ACTIVE)
        patient = Patient.objects.create(hospital=hospital, patient_code="CT-PATIENT", name="Patient", birth_date=date(1970, 1, 1), sex=Patient.Sex.FEMALE, phone_number="010-0000-0000", phone_number_hash="ct-patient")
        self.case = LungCancerCase.objects.create(patient=patient, case_code="CT-CASE", primary_doctor=self.doctor, current_stage=WorkflowStage.CT)
        order = ExaminationOrder.objects.create(case=self.case, order_type=ExaminationOrder.OrderType.CT, requesting_doctor=self.doctor, priority=ExaminationOrder.Priority.NORMAL, purpose="CT", status=ExaminationOrder.Status.COMPLETED)
        asset = CaseImageAsset.objects.create(case=self.case, examination_order=order, workflow_stage=WorkflowStage.CT, image_type=CaseImageAsset.ImageType.CT, storage_type=CaseImageAsset.StorageType.ORTHANC, storage_uri="orthanc://series/ct", file_format="DICOM", status=CaseImageAsset.Status.READY)
        model = ModelVersion.objects.create(model_name="ct-model", version="1.0", analysis_type="CT_ANALYSIS")
        self.analysis = AiAnalysis.objects.create(case=self.case, examination_order=order, source_image_asset=asset, analysis_type="CT_ANALYSIS", model_version=model, status=AiAnalysis.Status.SUCCEEDED)
        result = AiResult.objects.create(ai_analysis=self.analysis, schema_version="ct-v1", result_payload={"cornerstone_segmentation": SEGMENTATION, "visualization": VISUALIZATION}, result_files=[])
        CtAiResult.objects.create(ai_result=result, overall_malignancy_risk=None)
        token = AccessToken.for_user(self.doctor)
        token["hospital_id"] = str(hospital.id)
        token["department_id"] = str(department.id)
        token["department_code"] = department.code
        token["role"] = role.role
        self.client = APIClient()
        self.client.force_authenticate(user=self.doctor, token=token)
        self.segmentation_url = reverse("doctor-case-ct-segmentation", kwargs={"case_id": self.case.id, "analysis_id": self.analysis.id})
        self.labelmap_url = reverse("doctor-case-ct-segmentation-labelmap", kwargs={"case_id": self.case.id, "analysis_id": self.analysis.id})
        self.visualization_url = reverse("doctor-case-ct-visualization", kwargs={"case_id": self.case.id, "analysis_id": self.analysis.id})

    @patch("apps.cases.views.download_ct_cornerstone_object")
    def test_returns_segmentation_metadata_without_private_uris(self, download):
        download.return_value = json.dumps(GEOMETRY).encode("utf-8")

        response = self.client.get(self.segmentation_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["dimensions"], [2, 2, 2])
        self.assertEqual(response.data["segments"], SEGMENTATION["segments"])
        self.assertNotIn("geometry_uri", response.data)
        self.assertNotIn("labelmap_uri", response.data)

    @patch("apps.cases.views.download_ct_cornerstone_object")
    def test_streams_labelmap_only_through_case_authorized_proxy(self, download):
        download.return_value = b"\x00\x01\x00\x00\x00\x00\x00\x00"

        response = self.client.get(self.labelmap_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.content, download.return_value)
        self.assertEqual(response["Content-Type"], "application/octet-stream")
        download.assert_called_once_with(SEGMENTATION["labelmap_uri"])

    @patch("apps.cases.views.download_ct_visualization")
    def test_returns_3d_layer_proxy_without_private_mesh_uri(self, download):
        manifest = self.client.get(self.visualization_url)

        self.assertEqual(manifest.status_code, status.HTTP_200_OK)
        layer = manifest.data["layers"][0]
        self.assertNotIn("mesh_uri", layer)
        self.assertIn("/api/doctor/cases/", layer["mesh_url"])
        layer_url = reverse("doctor-case-ct-visualization-layer", kwargs={"case_id": self.case.id, "analysis_id": self.analysis.id, "layer_id": "nodule-1"})
        download.return_value = b"glb"
        layer_response = self.client.get(layer_url)
        self.assertEqual(layer_response.status_code, status.HTTP_200_OK)
        self.assertEqual(layer_response.content, b"glb")
        download.assert_called_once_with(VISUALIZATION["layers"][0]["mesh_uri"])

    def test_cannot_access_another_doctors_case_analysis(self):
        other = User.objects.create_user(login_id="other-ct-doctor", password="test", name="Other", department_role=self.doctor.department_role, account_status=User.AccountStatus.ACTIVE)
        self.case.primary_doctor = other
        self.case.save(update_fields=["primary_doctor", "updated_at"])

        response = self.client.get(self.segmentation_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
