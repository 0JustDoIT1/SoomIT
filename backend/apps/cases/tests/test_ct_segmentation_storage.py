from unittest import TestCase
from unittest.mock import patch

from google.auth.exceptions import DefaultCredentialsError

from apps.radiology.services.ct_cornerstone_storage import (
    CtCornerstoneStorageError,
    download_ct_cornerstone_object,
)


URI = "gs://test-bucket/ct-analysis/hospital/case/order/analysis/phase1/cornerstone/geometry.json"


class CtSegmentationStorageTests(TestCase):
    @patch("apps.radiology.services.ct_cornerstone_storage.storage.Client")
    def test_uses_google_default_credential_discovery(self, client_class):
        client_class.return_value.bucket.return_value.blob.return_value.download_as_bytes.return_value = b"{}"

        self.assertEqual(download_ct_cornerstone_object(URI), b"{}")

        client_class.assert_called_once_with()

    @patch("apps.radiology.services.ct_cornerstone_storage.storage.Client")
    def test_normalizes_missing_adc_without_exposing_sdk_details(self, client_class):
        client_class.side_effect = DefaultCredentialsError("credential path should stay private")

        with self.assertRaisesRegex(CtCornerstoneStorageError, "credentials are unavailable") as raised:
            download_ct_cornerstone_object(URI)

        self.assertNotIn("credential path", str(raised.exception))
