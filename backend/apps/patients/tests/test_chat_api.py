from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.patients.chat_views import PatientChatAPIView
from apps.patients.services.genkit_client import (
    GenkitServiceError,
    GenkitServiceNotConfigured,
)


class PatientChatAPITests(SimpleTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = SimpleNamespace(is_authenticated=True)

    def _request(self, data=None, authenticated=True):
        request = self.factory.post(
            "/api/patient/chat/",
            data or {"message": "폐 결절이 무엇인가요?", "history": []},
            format="json",
        )
        if authenticated:
            force_authenticate(request, user=self.user)
        return request

    def test_requires_authentication(self):
        response = PatientChatAPIView.as_view()(self._request(authenticated=False))

        self.assertEqual(response.status_code, 401)

    @patch("apps.patients.chat_views.request_patient_chat")
    def test_forwards_validated_conversation(self, mock_chat):
        mock_chat.return_value = {"answer": "검사 결과는 담당 의료진과 확인해주세요."}
        data = {
            "message": "제 검사 결과를 알려주세요.",
            "history": [{"role": "assistant", "content": "무엇을 도와드릴까요?"}],
        }

        response = PatientChatAPIView.as_view()(self._request(data))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["answer"], "검사 결과는 담당 의료진과 확인해주세요.")
        mock_chat.assert_called_once_with(
            message=data["message"],
            history=data["history"],
        )

    @patch("apps.patients.chat_views.request_patient_chat")
    def test_reports_unconfigured_service(self, mock_chat):
        mock_chat.side_effect = GenkitServiceNotConfigured("설정되지 않았습니다.")

        response = PatientChatAPIView.as_view()(self._request())

        self.assertEqual(response.status_code, 503)

    @patch("apps.patients.chat_views.request_patient_chat")
    def test_maps_genkit_failure_to_bad_gateway(self, mock_chat):
        mock_chat.side_effect = GenkitServiceError("연결할 수 없습니다.")

        response = PatientChatAPIView.as_view()(self._request())

        self.assertEqual(response.status_code, 502)
