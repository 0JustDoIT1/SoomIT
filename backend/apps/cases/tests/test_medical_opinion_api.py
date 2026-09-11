import uuid
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.cases.views import DoctorMedicalOpinionAPIView
from apps.knowledge.services.medgemma_client import MedgemmaServiceError


class DoctorMedicalOpinionAPITests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = SimpleNamespace(is_authenticated=True)
        self.case_id = uuid.uuid4()
        self.case = SimpleNamespace(id=self.case_id)

    def _request(self, data=None):
        request = self.factory.post("/medical-opinion/", data or {}, format="json")
        force_authenticate(request, user=self.user)
        return request

    @patch("apps.cases.views.generate_medical_opinion")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_generates_opinion_for_assigned_active_case(self, mock_objects, mock_generate):
        mock_objects.select_related.return_value.filter.return_value.first.return_value = self.case
        result_id = uuid.uuid4()
        mock_generate.return_value = {
            "opinion": "의료진 검토가 필요한 소견 초안입니다.",
            "source_results": [
                {"id": str(result_id), "stage": "CT", "confirmed_at": None},
            ],
        }

        response = DoctorMedicalOpinionAPIView.as_view()(self._request(), case_id=self.case_id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["opinion"], "의료진 검토가 필요한 소견 초안입니다.")
        mock_objects.select_related.return_value.filter.assert_called_once_with(
            id=self.case_id,
            primary_doctor=self.user,
            case_status="ACTIVE",
        )

    @patch("apps.cases.views.LungCancerCase.objects")
    def test_hides_unassigned_case(self, mock_objects):
        mock_objects.select_related.return_value.filter.return_value.first.return_value = None

        response = DoctorMedicalOpinionAPIView.as_view()(self._request(), case_id=self.case_id)

        self.assertEqual(response.status_code, 404)

    @patch("apps.cases.views.generate_medical_opinion")
    @patch("apps.cases.views.LungCancerCase.objects")
    def test_maps_medgemma_failure_to_bad_gateway(self, mock_objects, mock_generate):
        mock_objects.select_related.return_value.filter.return_value.first.return_value = self.case
        mock_generate.side_effect = MedgemmaServiceError("연결 실패")

        response = DoctorMedicalOpinionAPIView.as_view()(self._request(), case_id=self.case_id)

        self.assertEqual(response.status_code, 502)
