import json
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

from django.test import SimpleTestCase, override_settings

from apps.radiology.services.xray_inference import (
    XrayInferenceError,
    request_xray_prediction,
    validate_prediction,
)


def prediction_payload():
    return {
        "model_revision": "xray-v1",
        "image": {"width": 2048, "height": 2048},
        "classification": {
            "prediction": "Suspicious Lung Cancer",
            "class_index": 2,
            "assessment": "SUSPICIOUS",
            "suspicion_score": 0.8721,
            "probabilities": {
                "Normal": 0.0521,
                "Other Lung Disease": 0.0758,
                "Suspicious Lung Cancer": 0.8721,
            },
        },
        "detections": [
            {
                "class_id": 11,
                "class_name": "Nodule",
                "score": 0.8614,
                "bbox_xyxy": [320.4, 510.2, 615.8, 790.1],
            }
        ],
    }


class XrayInferenceTests(SimpleTestCase):
    def response(self, payload):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(payload).encode("utf-8")
        return response

    @override_settings(
        XRAY_SERVICE_URL="https://xray.example.test",
        XRAY_SERVICE_TIMEOUT_SECONDS=321,
        XRAY_SERVICE_USE_ID_TOKEN=True,
    )
    @patch("apps.radiology.services.xray_inference.urlopen")
    @patch("apps.radiology.services.xray_inference._fetch_id_token", return_value="test-token")
    def test_sends_original_png_with_expected_request(self, fetch_token, urlopen):
        original_png = b"\x89PNG\r\n\x1a\noriginal-bytes"
        urlopen.return_value = self.response(prediction_payload())

        result = request_xray_prediction(original_png)

        self.assertEqual(result["detections"][0]["bbox_xyxy"], [320.4, 510.2, 615.8, 790.1])
        fetch_token.assert_called_once_with()
        request = urlopen.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://xray.example.test/v1/predict?score_threshold=0.30",
        )
        self.assertEqual(request.data, original_png)
        self.assertEqual(request.get_header("Content-type"), "image/png")
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token")
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 321)

    @override_settings(
        XRAY_SERVICE_URL="https://xray.example.test",
        XRAY_SERVICE_USE_ID_TOKEN=False,
    )
    @patch("apps.radiology.services.xray_inference.urlopen")
    def test_parses_empty_detections(self, urlopen):
        payload = prediction_payload()
        payload["detections"] = []
        urlopen.return_value = self.response(payload)
        self.assertEqual(request_xray_prediction(b"png")["detections"], [])

    @override_settings(
        XRAY_SERVICE_URL="https://xray.example.test",
        XRAY_SERVICE_USE_ID_TOKEN=False,
    )
    @patch(
        "apps.radiology.services.xray_inference.urlopen",
        side_effect=HTTPError("https://xray.example.test", 403, "forbidden", {}, None),
    )
    def test_hides_authentication_error_details(self, _urlopen):
        with self.assertRaisesRegex(XrayInferenceError, "인증이 거부"):
            request_xray_prediction(b"png")

    @override_settings(
        XRAY_SERVICE_URL="https://xray.example.test",
        XRAY_SERVICE_USE_ID_TOKEN=False,
    )
    @patch("apps.radiology.services.xray_inference.urlopen")
    def test_invalid_json_raises_safe_error(self, urlopen):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b"not-json"
        urlopen.return_value = response
        with self.assertRaisesRegex(XrayInferenceError, "올바른 JSON"):
            request_xray_prediction(b"png")

    def test_missing_service_configuration_prevents_request(self):
        with override_settings(XRAY_SERVICE_URL=""), patch(
            "apps.radiology.services.xray_inference.urlopen"
        ) as urlopen:
            with self.assertRaisesRegex(XrayInferenceError, "XRAY_SERVICE_URL"):
                request_xray_prediction(b"png")
        urlopen.assert_not_called()

    def test_rejects_malformed_contract_and_bbox(self):
        payload = prediction_payload()
        del payload["classification"]["probabilities"]
        with self.assertRaises(XrayInferenceError):
            validate_prediction(payload)

        payload = prediction_payload()
        payload["detections"][0]["bbox_xyxy"] = [1, 2, 3]
        with self.assertRaises(XrayInferenceError):
            validate_prediction(payload)
