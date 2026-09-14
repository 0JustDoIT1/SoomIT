from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase, override_settings
from google.api_core.exceptions import NotFound
from google.auth.exceptions import DefaultCredentialsError

from apps.radiology.services.xray_storage import (
    InvalidXrayObjectPath,
    XrayStorageBucketNotFound,
    XrayStorageCredentialError,
    XrayStorageObjectNotFound,
    XrayStorageUploadError,
    build_xray_object_path,
    download_xray_png_bytes,
    parse_xray_gs_uri,
    upload_xray_png,
)


@override_settings(XRAY_GCS_BUCKET="soomit-bucket")
class XrayStorageTests(SimpleTestCase):
    def test_builds_approved_path_without_duplicate_png_extension(self):
        self.assertEqual(
            build_xray_object_path(
                hospital_id="hospital-id",
                case_id="case-id",
                order_id="order-id",
                filename="chest_xray.png",
            ),
            "xray/hospital-id/case-id/order-id/chest_xray.png",
        )
        self.assertEqual(
            build_xray_object_path(
                hospital_id="hospital-id",
                case_id="case-id",
                order_id="order-id",
                filename="chest_xray",
            ),
            "xray/hospital-id/case-id/order-id/chest_xray.png",
        )

    def test_rejects_path_traversal_and_invalid_gs_uri(self):
        for filename in ("", "../chest", "folder/chest", "folder\\chest"):
            with self.subTest(filename=filename), self.assertRaises(InvalidXrayObjectPath):
                build_xray_object_path(
                    hospital_id="hospital-id",
                    case_id="case-id",
                    order_id="order-id",
                    filename=filename,
                )
        for uri in (
            "https://soomit-bucket/xray/a/b/c/chest.png",
            "gs://other-bucket/xray/a/b/c/chest.png",
            "gs://soomit-bucket/xray/a/b/chest.png",
            "gs://soomit-bucket/xray/a/b/c/chest.jpg",
        ):
            with self.subTest(uri=uri), self.assertRaises(InvalidXrayObjectPath):
                parse_xray_gs_uri(uri)

    @patch("apps.radiology.services.xray_storage.storage.Client")
    def test_upload_preserves_bytes_content_type_and_returns_uri(self, client_class):
        blob = MagicMock()
        client_class.return_value.bucket.return_value.blob.return_value = blob
        original_png = b"\x89PNG\r\n\x1a\noriginal-png-bytes"

        uri = upload_xray_png(
            original_png,
            hospital_id="hospital-id",
            case_id="case-id",
            order_id="order-id",
            filename="chest_xray.png",
        )

        client_class.return_value.bucket.assert_called_once_with("soomit-bucket")
        blob.upload_from_string.assert_called_once_with(original_png, content_type="image/png")
        self.assertEqual(uri, "gs://soomit-bucket/xray/hospital-id/case-id/order-id/chest_xray.png")

    @patch("apps.radiology.services.xray_storage.storage.Client")
    def test_download_returns_original_bytes(self, client_class):
        original_png = b"\x89PNG\r\n\x1a\noriginal-png-bytes"
        blob = client_class.return_value.bucket.return_value.blob.return_value
        blob.download_as_bytes.return_value = original_png

        actual = download_xray_png_bytes(
            "gs://soomit-bucket/xray/hospital-id/case-id/order-id/chest_xray.png"
        )

        self.assertIs(actual, original_png)
        blob.download_as_bytes.assert_called_once_with()

    @patch("apps.radiology.services.xray_storage.storage.Client")
    def test_empty_png_and_sdk_errors_are_safe(self, client_class):
        with self.assertRaises(XrayStorageUploadError):
            upload_xray_png(
                b"", hospital_id="h", case_id="c", order_id="o", filename="x"
            )
        client_class.side_effect = DefaultCredentialsError("secret credential detail")
        with self.assertRaises(XrayStorageCredentialError):
            upload_xray_png(
                b"png", hospital_id="h", case_id="c", order_id="o", filename="x"
            )

    @patch("apps.radiology.services.xray_storage.storage.Client")
    def test_not_found_is_classified_for_upload_and_download(self, client_class):
        blob = client_class.return_value.bucket.return_value.blob.return_value
        blob.upload_from_string.side_effect = NotFound("bucket missing")
        with self.assertRaises(XrayStorageBucketNotFound):
            upload_xray_png(
                b"png", hospital_id="h", case_id="c", order_id="o", filename="x"
            )

        blob.upload_from_string.side_effect = None
        blob.download_as_bytes.side_effect = NotFound("object missing")
        with self.assertRaises(XrayStorageObjectNotFound):
            download_xray_png_bytes("gs://soomit-bucket/xray/h/c/o/x.png")
