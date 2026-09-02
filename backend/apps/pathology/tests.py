from datetime import date

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Department, DepartmentRole, Hospital, User
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