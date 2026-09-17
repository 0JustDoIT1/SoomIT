from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import Hospital
from apps.cases.models import LungCancerCase, WorkflowStage
from apps.clinical.models import ClinicalResult
from apps.patients.models import Patient, PatientAccount
from apps.patients.patient_tokens import issue_patient_tokens


@override_settings(AI_SERVICE_TOKEN="test-ai-service-token")
class PatientDataAIAPITests(APITestCase):
    def setUp(self):
        self.hospital = Hospital.objects.create(name="Test Hospital", code="AI-PATIENT-TEST")
        self.patient = self._patient("P0001", "patient-one")
        self.other_patient = self._patient("P0002", "patient-two")
        self.account = self._account(self.patient, "account-one")
        self.other_account = self._account(self.other_patient, "account-two")
        self.access_token = issue_patient_tokens(self.account)["access"]
        self.other_access_token = issue_patient_tokens(self.other_account)["access"]

    def _patient(self, patient_code, phone_hash):
        return Patient.objects.create(
            hospital=self.hospital,
            patient_code=patient_code,
            name=patient_code,
            birth_date="1980-01-01",
            sex=Patient.Sex.UNKNOWN,
            phone_number="01000000000",
            phone_number_hash=phone_hash,
        )

    @staticmethod
    def _account(patient, phone_hash):
        return PatientAccount.objects.create(
            patient=patient,
            phone_number="01000000000",
            phone_number_hash=phone_hash,
            phone_verified_at=timezone.now(),
            link_status=PatientAccount.LinkStatus.LINKED,
        )

    def _get(self, resource, token=None, query=None):
        headers = {"HTTP_AUTHORIZATION": "Bearer test-ai-service-token"}
        if token is not None:
            headers["HTTP_X_PATIENT_ACCESS_TOKEN"] = token
        return self.client.get(f"/api/ai/patient/{resource}/", query or {}, **headers)

    def test_patient_context_is_required(self):
        response = self._get("info")

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_service_authentication_is_required(self):
        response = self.client.get(
            "/api/ai/patient/info/",
            HTTP_X_PATIENT_ACCESS_TOKEN=self.access_token,
        )

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unknown_resource_returns_not_found(self):
        response = self._get("unknown", self.access_token)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unlinked_patient_context_is_forbidden(self):
        unlinked = PatientAccount.objects.create(
            phone_number="01099999999",
            phone_number_hash="unlinked-account",
            link_status=PatientAccount.LinkStatus.UNLINKED,
        )
        token = issue_patient_tokens(unlinked)["access"]

        response = self._get("info", token)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_patient_info_uses_authenticated_account_not_query_parameters(self):
        response = self._get(
            "info",
            self.access_token,
            {"patient_id": str(self.other_patient.id), "patient_code": self.other_patient.patient_code},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["patient"]["patient_id"], str(self.patient.id))
        self.assertEqual(response.data["patient"]["patient_code"], self.patient.patient_code)
        self.assertTrue(response.data["patient"]["patient_account"]["linked"])

    def test_empty_patient_data_is_successful(self):
        expected = {
            "case": {"case": None},
            "examinations": {"examinations": []},
            "appointments": {"appointments": []},
            "clinical-results": {"clinical_results": []},
            "treatment": {"treatment": None},
            "medications": {"medications": []},
            "symptoms": {"symptoms": []},
            "labs": {"labs": []},
        }

        for resource, body in expected.items():
            with self.subTest(resource=resource):
                response = self._get(resource, self.access_token)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data, body)

    def test_clinical_results_only_include_confirmed_results_for_authenticated_patient(self):
        own_case = LungCancerCase.objects.create(
            patient=self.patient,
            case_code="CASE-OWN",
            current_stage=WorkflowStage.XRAY,
        )
        other_case = LungCancerCase.objects.create(
            patient=self.other_patient,
            case_code="CASE-OTHER",
            current_stage=WorkflowStage.XRAY,
        )
        own_result = ClinicalResult.objects.create(
            case=own_case,
            workflow_stage=WorkflowStage.XRAY,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_at=timezone.now(),
        )
        ClinicalResult.objects.create(
            case=own_case,
            workflow_stage=WorkflowStage.CT,
            result_status=ClinicalResult.ResultStatus.DRAFT,
        )
        ClinicalResult.objects.create(
            case=other_case,
            workflow_stage=WorkflowStage.XRAY,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_at=timezone.now(),
        )

        response = self._get("clinical-results", self.access_token)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["id"] for item in response.data["clinical_results"]],
            [str(own_result.id)],
        )

    def test_existing_clinical_results_api_uses_logged_in_patient(self):
        own_case = LungCancerCase.objects.create(
            patient=self.patient,
            case_code="PUBLIC-CASE-OWN",
            current_stage=WorkflowStage.XRAY,
        )
        other_case = LungCancerCase.objects.create(
            patient=self.other_patient,
            case_code="PUBLIC-CASE-OTHER",
            current_stage=WorkflowStage.XRAY,
        )
        own_result = ClinicalResult.objects.create(
            case=own_case,
            workflow_stage=WorkflowStage.XRAY,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_at=timezone.now(),
        )
        ClinicalResult.objects.create(
            case=other_case,
            workflow_stage=WorkflowStage.XRAY,
            result_status=ClinicalResult.ResultStatus.CONFIRMED,
            confirmed_at=timezone.now(),
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.access_token}")

        response = self.client.get("/api/clinical/results/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data], [str(own_result.id)])
