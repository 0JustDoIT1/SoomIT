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
from apps.patients.models import Patient, PatientQuestionnaire


@override_settings(
    SOOMIT_ADMINISTRATION_DEPARTMENT_CODE=(
        ADMINISTRATION_DEPARTMENT_CODE
    )
)
class CoordinatorQuestionnaireAPITests(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(
            code="QUESTIONNAIRE-TEST",
            name="문진표 테스트 병원",
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
            login_id="questionnaire-admin",
            password="password123",
            name="원무테스트",
            department_role=self.admin_role,
            account_status=User.AccountStatus.ACTIVE,
        )

        self.other_department = Department.objects.create(
            hospital=self.hospital,
            code="PULMONOLOGY",
            name="호흡기내과",
        )
        self.other_role = DepartmentRole.objects.create(
            department=self.other_department,
            role=DepartmentRole.Role.DOCTOR,
            display_name="의사",
        )
        self.other_user = User.objects.create_user(
            login_id="questionnaire-doctor",
            password="password123",
            name="의사테스트",
            department_role=self.other_role,
            account_status=User.AccountStatus.ACTIVE,
        )

        self.patient = Patient.objects.create(
            hospital=self.hospital,
            patient_code="QUESTIONNAIRE001",
            name="문진표환자",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01090000001",
            phone_number_hash="questionnaire-patient-1",
        )

        self.questionnaire = PatientQuestionnaire.objects.create(
            patient=self.patient,
            questionnaire_type="PRE_VISIT",
            questionnaire_version="1.0",
            responses={
                "symptoms": ["기침"],
            },
            is_completed=True,
            completed_at=timezone.now(),
        )

        self.url = (
            f"/api/patients/{self.patient.id}/questionnaire/"
        )

    def _token_for(self, user):
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

    def test_authentication_is_required(self):
        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_non_administration_staff_is_forbidden(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=(
                f"Bearer {self._token_for(self.other_user)}"
            )
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_administration_medical_staff_can_read(self):
        self.client.credentials(
            HTTP_AUTHORIZATION=(
                f"Bearer {self._token_for(self.admin_user)}"
            )
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            response.data["id"],
            str(self.questionnaire.id),
        )
        self.assertTrue(response.data["is_completed"])

    def test_cannot_read_questionnaire_from_other_hospital(self):
        other_hospital = Hospital.objects.create(
            code="QUESTIONNAIRE-OTHER",
            name="다른 병원",
        )

        other_patient = Patient.objects.create(
            hospital=other_hospital,
            patient_code="QUESTIONNAIRE002",
            name="다른병원환자",
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01090000002",
            phone_number_hash="questionnaire-patient-2",
        )

        PatientQuestionnaire.objects.create(
            patient=other_patient,
            questionnaire_type="PRE_VISIT",
            questionnaire_version="1.0",
            responses={"symptoms": ["기침"]},
            is_completed=True,
            completed_at=timezone.now(),
        )

        self.client.credentials(
            HTTP_AUTHORIZATION=(
                f"Bearer {self._token_for(self.admin_user)}"
            )
        )

        response = self.client.get(
            f"/api/patients/{other_patient.id}/questionnaire/"
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_returns_404_when_completed_questionnaire_does_not_exist(
        self,
    ):
        self.questionnaire.delete()

        self.client.credentials(
            HTTP_AUTHORIZATION=(
                f"Bearer {self._token_for(self.admin_user)}"
            )
        )

        response = self.client.get(self.url)

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )
