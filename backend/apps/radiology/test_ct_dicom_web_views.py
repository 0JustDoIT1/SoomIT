from datetime import date
from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Department, DepartmentRole, Hospital, User
from apps.cases.models import CaseImageAsset, ExaminationOrder, LungCancerCase, WorkflowStage
from apps.patients.models import Patient

from .services.orthanc_dicomweb import DicomWebResponse, OrthancDicomWebError


STUDY_UID = "1.2.840.10008.1.1"
SERIES_UID = "1.2.840.10008.1.2"
INSTANCE_UID = "1.2.840.10008.1.3"


@override_settings(SOOMIT_RADIOLOGY_DEPARTMENT_CODE="RADIOLOGY")
class CtDicomWebViewsTestCase(APITestCase):
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
        self.order = ExaminationOrder.objects.create(
            case=case, order_type=ExaminationOrder.OrderType.CT, requesting_doctor=doctor,
            priority=ExaminationOrder.Priority.NORMAL, purpose="CT", status=ExaminationOrder.Status.ORDERED,
        )
        self.asset = CaseImageAsset.objects.create(
            case=case, examination_order=self.order, workflow_stage=WorkflowStage.CT,
            image_type=CaseImageAsset.ImageType.CT, storage_type=CaseImageAsset.StorageType.ORTHANC,
            storage_uri="orthanc://series/abc", file_format="DICOM", status=CaseImageAsset.Status.READY,
            study_instance_uid=STUDY_UID, series_instance_uid=SERIES_UID, orthanc_series_id="a" * 40,
        )

        self.metadata_url = reverse(
            "radiology:order-ct-dicom-web-metadata", kwargs={"order_id": self.order.id, "asset_id": self.asset.id},
        )
        self.instances_url = reverse(
            "radiology:order-ct-dicom-web-instances", kwargs={"order_id": self.order.id, "asset_id": self.asset.id},
        )
        self.instance_url = reverse(
            "radiology:order-ct-dicom-web-instance",
            kwargs={"order_id": self.order.id, "asset_id": self.asset.id, "sop_instance_uid": INSTANCE_UID},
        )
        self._authenticate(self.user, self.hospital)

    def _authenticate(self, user, hospital):
        token = AccessToken.for_user(user)
        token["hospital_id"] = str(hospital.id)
        token["department_id"] = str(user.department_role.department_id)
        token["department_code"] = "RADIOLOGY"
        token["role"] = "TECHNOLOGIST"
        self.client.force_authenticate(user=user, token=token)

    @patch("apps.radiology.views.get_series_metadata")
    def test_metadata_endpoint_proxies_orthanc_response(self, get_metadata):
        get_metadata.return_value = DicomWebResponse(content=b"[{}]", content_type="application/dicom+json")

        response = self.client.get(self.metadata_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        get_metadata.assert_called_once_with(STUDY_UID, SERIES_UID)
        self.assertEqual(response.content, b"[{}]")
        self.assertEqual(response["Content-Type"], "application/dicom+json")

    @patch("apps.radiology.views.list_series_instances")
    def test_instances_endpoint_proxies_orthanc_response(self, list_instances):
        list_instances.return_value = DicomWebResponse(content=b"[{}]", content_type="application/dicom+json")

        response = self.client.get(self.instances_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        list_instances.assert_called_once_with(STUDY_UID, SERIES_UID)

    @patch("apps.radiology.views.retrieve_instance")
    def test_instance_endpoint_forwards_allowed_accept_header(self, retrieve):
        retrieve.return_value = DicomWebResponse(content=b"\x00\x01", content_type="application/dicom")

        response = self.client.get(self.instance_url, HTTP_ACCEPT="application/dicom")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        retrieve.assert_called_once_with(STUDY_UID, SERIES_UID, INSTANCE_UID, accept="application/dicom")
        self.assertEqual(response.content, b"\x00\x01")

    @patch("apps.radiology.views.retrieve_instance")
    def test_instance_endpoint_falls_back_for_unsupported_accept_header(self, retrieve):
        retrieve.return_value = DicomWebResponse(content=b"\x00", content_type="application/dicom")

        self.client.get(self.instance_url, HTTP_ACCEPT="text/html")

        retrieve.assert_called_once_with(STUDY_UID, SERIES_UID, INSTANCE_UID, accept="application/dicom")

    @patch("apps.radiology.views.get_series_metadata", side_effect=OrthancDicomWebError("boom"))
    def test_metadata_endpoint_returns_502_on_storage_error(self, get_metadata):
        response = self.client.get(self.metadata_url)
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)

    def test_asset_without_dicom_uids_returns_404(self):
        self.asset.study_instance_uid = None
        self.asset.save(update_fields=["study_instance_uid", "updated_at"])

        self.assertEqual(self.client.get(self.metadata_url).status_code, status.HTTP_404_NOT_FOUND)

    def test_other_hospitals_staff_cannot_access_the_series(self):
        self._authenticate(self.other_user, self.other_hospital)
        self.assertEqual(self.client.get(self.metadata_url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(self.instances_url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.client.get(self.instance_url).status_code, status.HTTP_404_NOT_FOUND)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None, token=None)
        self.assertEqual(self.client.get(self.metadata_url).status_code, status.HTTP_401_UNAUTHORIZED)
