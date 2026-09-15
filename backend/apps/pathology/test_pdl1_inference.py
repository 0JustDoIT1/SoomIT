import base64
import json
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from apps.pathology.services.pdl1_inference import request_pdl1_prediction


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class PDL1InferenceRequestTestCase(SimpleTestCase):
    @override_settings(
        PDL1_INFERENCE_SERVICE_URL="https://pdl1.example.test",
        PDL1_INFERENCE_SERVICE_USE_ID_TOKEN=False,
        PDL1_INFERENCE_TIMEOUT_SECONDS=12,
    )
    @patch("apps.pathology.services.pdl1_inference.urlopen")
    def test_annotation_bytes_are_base64_encoded_for_the_cloud_request(self, urlopen):
        urlopen.return_value = _Response(
            {
                "predicted_class": 1,
                "predicted_tps_range": "FROM_1_TO_49",
                "confidence": 0.7,
                "probabilities": {"class_0": 0.1, "class_1": 0.7, "class_2": 0.2},
            }
        )

        request_pdl1_prediction(
            wsi_gcs_uri="gs://bucket/sample.svs",
            annotation_content=b"<Annotations />",
            roi_layer="Tumor-JS",
            main_index="main",
            pdl1_image_id="image",
        )

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["wsi_gcs_uri"], "gs://bucket/sample.svs")
        self.assertEqual(payload["annotation_base64"], base64.b64encode(b"<Annotations />").decode("ascii"))
        self.assertEqual(payload["roi_layer"], "Tumor-JS")
        self.assertEqual(payload["main_index"], "main")
        self.assertEqual(payload["pdl1_image_id"], "image")
        self.assertEqual(urlopen.call_args.kwargs["timeout"], 12)
