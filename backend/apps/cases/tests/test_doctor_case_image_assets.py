from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import CaseImageAsset, LungCancerCase, WorkflowStage
from apps.patients.models import Patient


class DoctorCaseImageAssetAPITests(TestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="Image Hospital", code="IMAGE-HOSP")
        department = Department.objects.create(
            hospital=self.hospital, code="PULMONOLOGY", name="Pulmonology"
        )
        role = DepartmentRole.objects.create(
            department=department, role=DepartmentRole.Role.DOCTOR, display_name="Doctor"
        )
        self.doctor = User.objects.create_user(
            login_id="image-doctor", password="test", name="Doctor",
            department_role=role, account_status=User.AccountStatus.ACTIVE,
        )
        patient = Patient.objects.create(
            hospital=self.hospital, patient_code="IMAGEPATIENT", name="Patient",
            birth_date=date(1970, 1, 1), sex=Patient.Sex.FEMALE,
            phone_number="01000000000", phone_number_hash="image-patient",
        )
        self.case = LungCancerCase.objects.create(
            patient=patient, case_code="IMAGECASE", primary_doctor=self.doctor,
            current_stage=WorkflowStage.XRAY,
        )
        self.xray = CaseImageAsset.objects.create(
            case=self.case, workflow_stage=WorkflowStage.XRAY,
            image_type=CaseImageAsset.ImageType.XRAY,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gs://test-bucket/xray/test.png", file_format="PNG",
            status=CaseImageAsset.Status.READY,
        )
        self.ct = CaseImageAsset.objects.create(
            case=self.case, workflow_stage=WorkflowStage.CT,
            image_type=CaseImageAsset.ImageType.CT,
            storage_type=CaseImageAsset.StorageType.ORTHANC,
            storage_uri="orthanc://series/test", file_format="DICOM",
            status=CaseImageAsset.Status.READY,
            orthanc_study_id="study", orthanc_series_id="series",
        )
        self.pet = CaseImageAsset.objects.create(
            case=self.case, workflow_stage=WorkflowStage.PET_CT_TNM,
            image_type=CaseImageAsset.ImageType.PET,
            storage_type=CaseImageAsset.StorageType.ORTHANC,
            storage_uri="orthanc://series/pet-test", file_format="DICOM",
            status=CaseImageAsset.Status.READY,
        )
        CaseImageAsset.objects.create(
            case=self.case, workflow_stage=WorkflowStage.PATHOLOGY_GENE,
            image_type=CaseImageAsset.ImageType.WSI,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gs://test-bucket/pathology/test.svs", file_format="SVS",
            status=CaseImageAsset.Status.READY,
        )
        self.client = APIClient()
        self.authenticate(self.doctor)
        self.list_url = reverse(
            "doctor-case-image-asset-list", kwargs={"case_id": self.case.id}
        )
        self.preview_url = reverse(
            "doctor-case-image-asset-preview",
            kwargs={"case_id": self.case.id, "asset_id": self.xray.id},
        )

    def authenticate(self, user):
        refresh = RefreshToken.for_user(user)
        refresh["hospital_id"] = str(user.department_role.department.hospital_id)
        refresh["department_id"] = str(user.department_role.department_id)
        refresh["department_code"] = user.department_role.department.code
        refresh["role"] = user.department_role.role
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def test_list_returns_assets_without_internal_locations(self):
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {row["id"] for row in response.data},
            {str(self.xray.id), str(self.ct.id), str(self.pet.id)},
        )
        rows = {row["id"]: row for row in response.data}
        self.assertEqual(rows[str(self.xray.id)]["preview_url"], self.preview_url)
        self.assertIsNone(rows[str(self.ct.id)]["preview_url"])
        self.assertIsNone(rows[str(self.pet.id)]["preview_url"])
        self.assertEqual(rows[str(self.ct.id)]["orthanc_study_id"], "study")
        self.assertIsNone(rows[str(self.xray.id)]["acquired_at"])
        for row in response.data:
            self.assertNotIn("storage_uri", row)

    def test_case_without_assets_returns_empty_list(self):
        CaseImageAsset.objects.filter(case=self.case).delete()
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    @patch("apps.cases.views.download_xray_image_bytes", return_value=b"image")
    def test_preview_returns_xray_bytes_and_checks_case_asset_relation(self, download):
        response = self.client.get(self.preview_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertEqual(response.content, b"image")
        download.assert_called_once_with(self.xray.storage_uri)
        wrong_asset = self.client.get(reverse(
            "doctor-case-image-asset-preview",
            kwargs={"case_id": self.case.id, "asset_id": self.ct.id},
        ))
        self.assertEqual(wrong_asset.status_code, 404)
        other_patient = Patient.objects.create(
            hospital=self.hospital, patient_code="IMAGEPATIENT2", name="Other Patient",
            birth_date=date(1971, 1, 1), sex=Patient.Sex.MALE,
            phone_number="01000000001", phone_number_hash="image-patient-2",
        )
        other_case = LungCancerCase.objects.create(
            patient=other_patient, case_code="SECONDIMAGECASE",
            primary_doctor=self.doctor, current_stage=WorkflowStage.XRAY,
        )
        other_asset = CaseImageAsset.objects.create(
            case=other_case, workflow_stage=WorkflowStage.XRAY,
            image_type=CaseImageAsset.ImageType.XRAY,
            storage_type=CaseImageAsset.StorageType.GCS,
            storage_uri="gs://test-bucket/xray/other.png", file_format="PNG",
            status=CaseImageAsset.Status.READY,
        )
        cross_case_response = self.client.get(reverse(
            "doctor-case-image-asset-preview",
            kwargs={"case_id": self.case.id, "asset_id": other_asset.id},
        ))
        self.assertEqual(cross_case_response.status_code, 404)

    def test_denies_unauthenticated_other_role_and_other_hospital_case(self):
        self.client.credentials()
        self.assertIn(self.client.get(self.list_url).status_code, (401, 403))

        radiology = Department.objects.create(
            hospital=self.hospital, code="RADIOLOGY", name="Radiology"
        )
        role = DepartmentRole.objects.create(
            department=radiology, role=DepartmentRole.Role.TECHNOLOGIST,
            display_name="Technologist",
        )
        technologist = User.objects.create_user(
            login_id="image-technologist", password="test", name="Technologist",
            department_role=role, account_status=User.AccountStatus.ACTIVE,
        )
        self.authenticate(technologist)
        self.assertEqual(self.client.get(self.list_url).status_code, 403)

        self.authenticate(self.doctor)
        other_hospital = Hospital.objects.create(name="Other Hospital", code="OTHER-IMAGE-HOSP")
        other_patient = Patient.objects.create(
            hospital=other_hospital, patient_code="OTHERIMAGEPATIENT", name="Other Patient",
            birth_date=date(1970, 1, 1), sex=Patient.Sex.MALE,
            phone_number="01000000001", phone_number_hash="other-image-patient",
        )
        other_case = LungCancerCase.objects.create(
            patient=other_patient, case_code="OTHERIMAGECASE",
            primary_doctor=self.doctor, current_stage=WorkflowStage.XRAY,
        )
        other_url = reverse("doctor-case-image-asset-list", kwargs={"case_id": other_case.id})
        self.assertEqual(self.client.get(other_url).status_code, 404)
        missing_url = reverse("doctor-case-image-asset-list", kwargs={"case_id": uuid4()})
        self.assertEqual(self.client.get(missing_url).status_code, 404)
