from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from apps.pathology.services.pdl1_storage import (
    PDL1StorageError,
    build_pdl1_object_path,
    download_pdl1_annotation_bytes,
    upload_pdl1_input,
)


@override_settings(PDL1_GCS_BUCKET="test-pdl1-bucket")
class PDL1StorageTestCase(SimpleTestCase):
    def test_builds_distinct_wsi_and_annotation_paths(self):
        self.assertEqual(
            build_pdl1_object_path(hospital_id="hospital", case_id="case", order_id="order", kind="wsi", filename="slide.svs"),
            "pathology/pdl1/hospital/case/order/wsi/slide.svs",
        )
        self.assertEqual(
            build_pdl1_object_path(hospital_id="hospital", case_id="case", order_id="order", kind="annotation", filename="slide.annotations"),
            "pathology/pdl1/hospital/case/order/annotation/slide.annotations",
        )

    @patch("apps.pathology.services.pdl1_storage.storage.Client")
    def test_uploads_original_bytes_without_transforming_them(self, client_class):
        blob = Mock()
        client_class.return_value.bucket.return_value.blob.return_value = blob
        uri = upload_pdl1_input(data=b"original-bytes", hospital_id="hospital", case_id="case", order_id="order", kind="wsi", filename="slide.svs", content_type="application/octet-stream")
        self.assertEqual(uri, "gs://test-pdl1-bucket/pathology/pdl1/hospital/case/order/wsi/slide.svs")
        blob.upload_from_string.assert_called_once_with(b"original-bytes", content_type="application/octet-stream")

    @patch("apps.pathology.services.pdl1_storage.storage.Client")
    def test_downloads_only_annotation_bytes(self, client_class):
        blob = Mock()
        blob.download_as_bytes.return_value = b"<Annotations />"
        client_class.return_value.bucket.return_value.blob.return_value = blob
        self.assertEqual(download_pdl1_annotation_bytes("gs://test-pdl1-bucket/pathology/pdl1/hospital/case/order/annotation/slide.annotations"), b"<Annotations />")

    def test_rejects_invalid_annotation_uri(self):
        with self.assertRaises(PDL1StorageError):
            download_pdl1_annotation_bytes("gs://another-bucket/file.annotations")
