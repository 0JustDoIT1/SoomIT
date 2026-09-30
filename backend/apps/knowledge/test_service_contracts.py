import json
import base64
import time
from concurrent.futures import Future, ThreadPoolExecutor
from threading import Event
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings
from google.auth.exceptions import DefaultCredentialsError

from apps.knowledge.services.medgemma_client import (
    MedgemmaServiceError,
    request_chat_completion,
)


@override_settings(MEDGEMMA_SERVICE_URL="https://medgemma.test", MEDGEMMA_SERVICE_TIMEOUT_SECONDS=1)
class MedgemmaContractTests(SimpleTestCase):
    @override_settings(MEDGEMMA_SERVICE_USE_ID_TOKEN=False)
    def test_identical_concurrent_requests_share_inference_but_later_calls_regenerate(self):
        entered, follower, release = Event(), Event(), Event()

        class ObservedFuture(Future):
            def result(self, timeout=None):
                follower.set()
                return super().result(timeout=timeout)

        def generate(*args):
            entered.set()
            if not release.wait(2):
                raise RuntimeError("test timed out")
            return "answer"

        with patch("apps.knowledge.services.medgemma_client.Future", ObservedFuture), patch(
            "apps.knowledge.services.medgemma_client._request_chat_completion", side_effect=generate,
        ) as upstream, ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(request_chat_completion, [{"role": "user", "content": "same"}])
            self.assertTrue(entered.wait(1))
            second = pool.submit(request_chat_completion, [{"role": "user", "content": "same"}])
            try:
                self.assertTrue(follower.wait(1))
            finally:
                release.set()
            self.assertEqual(first.result(), "answer")
            self.assertEqual(second.result(), "answer")
            self.assertEqual(upstream.call_count, 1)
            request_chat_completion([{"role": "user", "content": "same"}])
            self.assertEqual(upstream.call_count, 2)

    def test_id_token_reused_only_until_expiry_margin(self):
        from apps.knowledge.services import medgemma_client as client
        client._id_tokens.clear()
        now = time.time()
        encoded = base64.urlsafe_b64encode(json.dumps({"exp": now + 3600}).encode()).decode().rstrip("=")
        token = "header." + encoded + ".signature"
        try:
            with patch("google.oauth2.id_token.fetch_id_token", return_value=token) as fetch:
                self.assertEqual(client._fetch_id_token(), token)
                self.assertEqual(client._fetch_id_token(), token)
                self.assertEqual(fetch.call_count, 1)
                with patch.object(client.time, "time", return_value=now + 3550):
                    client._fetch_id_token()
                self.assertEqual(fetch.call_count, 2)
        finally:
            client._id_tokens.clear()

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
