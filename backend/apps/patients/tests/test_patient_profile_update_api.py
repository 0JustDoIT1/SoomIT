from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Hospital
from apps.patients.models import Patient, PatientAccount
from apps.patients.patient_tokens import issue_patient_tokens


class PatientProfileUpdateAPITests(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(
            code="PROFILE-TEST",
            name="프로필 테스트 병원",
        )

        self.patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="PROFILE001",
            name="프로필환자",
            birth_date="1990-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01011112222",
            phone_number_hash="profile-patient-phone",
            postal_code="12345",
            address="기존 주소",
            address_detail="기존 상세주소",
        )

        self.account = PatientAccount.objects.create(
            patient=self.patient,
            phone_number="01011112222",
            phone_number_hash="profile-account-phone",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.LINKED,
        )

        token = issue_patient_tokens(self.account)["access"]

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )

    def test_patient_can_update_phone_and_address(self):
        response = self.client.patch(
            "/api/patients/profile/",
            {
                "phone_number": "01099998888",
                "postal_code": "54321",
                "address": "대전광역시 새 주소",
                "address_detail": "101동 202호",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        self.patient.refresh_from_db()

        self.assertEqual(
            self.patient.phone_number,
            "01099998888",
        )
        self.assertEqual(
            self.patient.postal_code,
            "54321",
        )
        self.assertEqual(
            self.patient.address,
            "대전광역시 새 주소",
        )
        self.assertEqual(
            self.patient.address_detail,
            "101동 202호",
        )

        self.assertEqual(
            response.data["postal_code"],
            "54321",
        )
        self.assertEqual(
            response.data["address"],
            "대전광역시 새 주소",
        )
        self.assertEqual(
            response.data["address_detail"],
            "101동 202호",
        )
