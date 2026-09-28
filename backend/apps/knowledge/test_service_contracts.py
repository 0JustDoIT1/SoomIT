import json
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings
from google.auth.exceptions import DefaultCredentialsError

from apps.knowledge.services.medgemma_client import (
    MedgemmaServiceError,
    request_chat_completion,
)


@override_settings(MEDGEMMA_SERVICE_URL="https://medgemma.test", MEDGEMMA_SERVICE_TIMEOUT_SECONDS=1)
class MedgemmaContractTests(SimpleTestCase):
    @override_settings(MEDGEMMA_SERVICE_USE_ID_TOKEN=True)
    @patch("google.oauth2.id_token.fetch_id_token", side_effect=DefaultCredentialsError("private credential path"))
    def test_auth_failure_is_a_service_error_without_credential_details(self, fetch):
        with self.assertRaises(MedgemmaServiceError) as raised:
            request_chat_completion([])
        self.assertNotIn("private credential path", str(raised.exception))

    @override_settings(MEDGEMMA_SERVICE_USE_ID_TOKEN=False)
    @patch("apps.knowledge.services.medgemma_client.urlopen")
    def test_invalid_answer_content_is_rejected(self, urlopen):
        for content in (None, "", "   ", [], {"text": "answer"}, 42):
            with self.subTest(content=content):
                response = MagicMock()
                response.read.return_value = json.dumps({"choices": [{"message": {"content": content}}]}).encode()
                urlopen.return_value.__enter__.return_value = response
                with self.assertRaises(MedgemmaServiceError):
                    request_chat_completion([])

    @override_settings(MEDGEMMA_SERVICE_USE_ID_TOKEN=False)
    @patch("apps.knowledge.services.medgemma_client.urlopen")
    def test_valid_answer_is_preserved(self, urlopen):
        urlopen.return_value.__enter__.return_value.read.return_value = b'{"choices":[{"message":{"content":"Answer [1]"}}]}'
        self.assertEqual(request_chat_completion([]), "Answer [1]")
