import hashlib
from datetime import timedelta

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.constants import ADMINISTRATION_DEPARTMENT_CODE
from apps.accounts.models import (
    Department,
    DepartmentRole,
    Hospital,
    User,
)
from apps.patients.models import (
    Patient,
    PatientAccount,
    PatientQuestionnaire,
    PatientQrToken,
)
from apps.patients.patient_tokens import issue_patient_tokens


@override_settings(
    SOOMIT_ADMINISTRATION_DEPARTMENT_CODE=(
        ADMINISTRATION_DEPARTMENT_CODE
    )
)
class PatientQrTokenAPITests(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(
            name="QR 테스트 병원",
            code="QR-TEST",
        )

        self.patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="QR001",
            name="QR 테스트 환자",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01000000000",
            phone_number_hash="qr-patient-phone",
        )

        self.account = PatientAccount.objects.create(
            patient=self.patient,
            phone_number="01000000000",
            phone_number_hash="qr-account-phone",
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.LINKED,
        )

        self.admin_department = Department.objects.create(
            hospital=self.hospital,
            code=ADMINISTRATION_DEPARTMENT_CODE,
            name="원무과",
        )
        self.admin_role = DepartmentRole.objects.create(
            department=self.admin_department,
            role=DepartmentRole.Role.MEDICAL_STAFF,
            display_name="원무직",
        )
        self.admin_user = User.objects.create_user(
            login_id="qr-admin",
            password="password123",
            name="QR 원무직",
            department_role=self.admin_role,
            account_status=User.AccountStatus.ACTIVE,
        )

    def _patient_auth(self):
        token = issue_patient_tokens(
            self.account
        )["access"]

        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )

    def _staff_token(self, user):
        token = AccessToken.for_user(user)

        token["hospital_id"] = str(
            user.department_role.department.hospital_id
        )
        token["department_id"] = str(
            user.department_role.department_id
        )
        token["department_code"] = (
            user.department_role.department.code
        )
        token["role"] = user.department_role.role

        return str(token)

    def _staff_auth(self, user=None):
        user = user or self.admin_user

        self.client.credentials(
            HTTP_AUTHORIZATION=(
                f"Bearer {self._staff_token(user)}"
            )
        )

    def _create_qr(self):
        self._patient_auth()

        response = self.client.post(
            "/api/patients/qr-token/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        return response.data["token"]

    def test_linked_patient_can_create_qr_token(self):
        raw_token = self._create_qr()

        token_hash = hashlib.sha256(
            raw_token.encode("utf-8")
        ).hexdigest()

        self.assertTrue(
            PatientQrToken.objects.filter(
                patient_account=self.account,
                token_hash=token_hash,
            ).exists()
        )

    def test_creating_new_qr_expires_previous_unused_qr(self):
        first_raw_token = self._create_qr()

        first_hash = hashlib.sha256(
            first_raw_token.encode("utf-8")
        ).hexdigest()

        first_qr = PatientQrToken.objects.get(
            token_hash=first_hash
        )

        self._create_qr()

        first_qr.refresh_from_db()

        self.assertLessEqual(
            first_qr.expires_at,
            timezone.now(),
        )
        self.assertIsNone(first_qr.used_at)

    def test_unlinked_account_cannot_create_qr_token(self):
        self.account.link_status = (
            PatientAccount.LinkStatus.UNLINKED
        )
        self.account.patient = None
        self.account.save(
            update_fields=[
                "link_status",
                "patient",
                "updated_at",
            ]
        )

        self._patient_auth()

        response = self.client.post(
            "/api/patients/qr-token/",
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_resolve_requires_staff_authentication(self):
        raw_token = self._create_qr()

        self.client.credentials()

        response = self.client.post(
            "/api/patients/qr-token/resolve/",
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_public_qr_resolve_returns_patient_and_latest_questionnaire(self):
        PatientQuestionnaire.objects.create(
            patient=self.patient,
            questionnaire_type="PRE_VISIT",
            questionnaire_version="1.0",
            responses={"current_symptoms": "기침"},
            is_completed=True,
            completed_at=timezone.now(),
        )
        raw_token = self._create_qr()

        self.client.credentials()
        response = self.client.post(
            "/api/patients/qr-token/public-resolve/",
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(response.data["patient"]["id"], str(self.patient.id))
        self.assertNotIn("phone_number", response.data["patient"])
        self.assertEqual(
            response.data["questionnaire"]["responses"]["current_symptoms"],
            "기침",
        )

    def test_public_qr_resolve_returns_null_when_no_questionnaire_exists(self):
        raw_token = self._create_qr()

        self.client.credentials()
        response = self.client.post(
            "/api/patients/qr-token/public-resolve/",
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["questionnaire"])

    def test_qr_token_can_be_resolved_only_once(self):
        raw_token = self._create_qr()
        self._staff_auth()

        first_response = self.client.post(
            "/api/patients/qr-token/resolve/",
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(
            first_response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            first_response.data["patient"]["patient_code"],
            self.patient.patient_code,
        )

        second_response = self.client.post(
            "/api/patients/qr-token/resolve/",
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(
            second_response.status_code,
            status.HTTP_409_CONFLICT,
        )

    def test_expired_qr_token_cannot_be_resolved(self):
        raw_token = "expired-test-token"

        PatientQrToken.objects.create(
            patient_account=self.account,
            token_hash=hashlib.sha256(
                raw_token.encode("utf-8")
            ).hexdigest(),
            expires_at=(
                timezone.now()
                - timedelta(seconds=1)
            ),
        )

        self._staff_auth()

        response = self.client.post(
            "/api/patients/qr-token/resolve/",
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_410_GONE,
        )

    def test_other_hospital_staff_cannot_resolve_qr(self):
        other_hospital = Hospital.objects.create(
            name="다른 QR 병원",
            code="QR-OTHER",
        )
        other_department = Department.objects.create(
            hospital=other_hospital,
            code=ADMINISTRATION_DEPARTMENT_CODE,
            name="원무과",
        )
        other_role = DepartmentRole.objects.create(
            department=other_department,
            role=DepartmentRole.Role.MEDICAL_STAFF,
            display_name="원무직",
        )
        other_user = User.objects.create_user(
            login_id="qr-other-admin",
            password="password123",
            name="다른 병원 원무직",
            department_role=other_role,
            account_status=User.AccountStatus.ACTIVE,
        )

        raw_token = self._create_qr()
        self._staff_auth(other_user)

        response = self.client.post(
            "/api/patients/qr-token/resolve/",
            {"token": raw_token},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )

        qr_token = PatientQrToken.objects.get(
            token_hash=hashlib.sha256(
                raw_token.encode("utf-8")
            ).hexdigest()
        )
        self.assertIsNone(qr_token.used_at)
