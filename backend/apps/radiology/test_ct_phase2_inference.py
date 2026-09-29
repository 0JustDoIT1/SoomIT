import io
import json
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from django.test import SimpleTestCase, override_settings

from apps.radiology.services.ct_phase2_inference import (
    CtPhase2InferenceError,
    request_ct_phase2_analysis,
)


def response(payload):
    context = Mock()
    context.__enter__ = Mock(
        return_value=io.BytesIO(json.dumps(payload).encode("utf-8"))
    )
    context.__exit__ = Mock(return_value=False)
    return context


@override_settings(
    CT_ANALYSIS_PHASE2_SERVICE_URL="https://phase2.example.test",
    CT_ANALYSIS_PHASE2_SERVICE_USE_ID_TOKEN=False,
    CT_ANALYSIS_PHASE2_TIMEOUT_SECONDS=30,
)
class CtPhase2InferenceTests(SimpleTestCase):
    @patch("apps.radiology.services.ct_phase2_inference.sleep")
    @patch("apps.radiology.services.ct_phase2_inference.urlopen")
    def test_retries_cloud_run_capacity_429(self, urlopen_mock, sleep_mock):
        urlopen_mock.side_effect = [
            HTTPError("https://phase2.example.test", 429, "capacity", {}, None),
            response(
                {
                    "status": "READY_FOR_N_MODEL",
                    "n_input_uri": "gs://bucket/n-input.json",
                }
            ),
        ]

        payload = request_ct_phase2_analysis(case_id="case-1")

        self.assertEqual(payload["n_input_uri"], "gs://bucket/n-input.json")
        self.assertEqual(urlopen_mock.call_count, 2)
        sleep_mock.assert_called_once_with(5)

    @patch("apps.radiology.services.ct_phase2_inference.sleep")
    @patch("apps.radiology.services.ct_phase2_inference.urlopen")
    def test_does_not_retry_non_capacity_http_error(self, urlopen_mock, sleep_mock):
        urlopen_mock.side_effect = HTTPError(
            "https://phase2.example.test", 400, "invalid", {}, None
        )

        with self.assertRaises(CtPhase2InferenceError):
            request_ct_phase2_analysis(case_id="case-1")

        self.assertEqual(urlopen_mock.call_count, 1)
        sleep_mock.assert_not_called()
