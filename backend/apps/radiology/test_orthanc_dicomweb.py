from unittest.mock import patch

from django.test import SimpleTestCase

from apps.radiology.services.orthanc_dicomweb import (
    OrthancDicomWebError,
    is_valid_dicom_uid,
    retrieve_instance,
)


class IsValidDicomUidTests(SimpleTestCase):
    def test_accepts_well_formed_uids(self):
        self.assertTrue(is_valid_dicom_uid("1.2.840.10008.1.2.1"))
        self.assertTrue(is_valid_dicom_uid("1"))

    def test_rejects_non_numeric_or_unsafe_values(self):
        for value in [
            "",
            "a" * 65,
            "1.2.840/../etc",
            "1.2; DROP TABLE",
            "1.2\r\nHost: evil",
            None,
            123,
        ]:
            with self.subTest(value=value):
                self.assertFalse(is_valid_dicom_uid(value))


def _multipart_dicom_body(dicom_bytes, boundary="boundary123"):
    content_type_header = f'multipart/related; type="application/dicom"; boundary={boundary}'
    body = (
        f"--{boundary}\r\n"
        f"Content-Type: application/dicom\r\n"
        f"\r\n"
    ).encode("ascii") + dicom_bytes + f"\r\n--{boundary}--\r\n".encode("ascii")
    return content_type_header, body


class RetrieveInstanceMultipartTests(SimpleTestCase):
    STUDY_UID = "1.2.840.10008.1.1"
    SERIES_UID = "1.2.840.10008.1.2"
    INSTANCE_UID = "1.2.840.10008.1.3"

    @patch("apps.radiology.services.orthanc_dicomweb._request")
    def test_unwraps_the_dicom_part_from_a_multipart_response(self, request):
        content_type_header, body = _multipart_dicom_body(b"FAKE-DICOM-BYTES")
        request.return_value = (body, content_type_header)

        result = retrieve_instance(self.STUDY_UID, self.SERIES_UID, self.INSTANCE_UID)

        request.assert_called_once_with(
            f"/dicom-web/studies/{self.STUDY_UID}/series/{self.SERIES_UID}/instances/{self.INSTANCE_UID}",
            accept='multipart/related; type="application/dicom"',
        )
        self.assertEqual(result.content, b"FAKE-DICOM-BYTES")
        self.assertEqual(result.content_type, "application/dicom")

    @patch("apps.radiology.services.orthanc_dicomweb._request")
    def test_raises_when_the_response_is_not_multipart(self, request):
        request.return_value = (b"FAKE-DICOM-BYTES", "application/dicom")

        with self.assertRaises(OrthancDicomWebError):
            retrieve_instance(self.STUDY_UID, self.SERIES_UID, self.INSTANCE_UID)

    @patch("apps.radiology.services.orthanc_dicomweb._request")
    def test_raises_when_no_part_matches_the_expected_content_type(self, request):
        content_type_header = 'multipart/related; type="text/plain"; boundary=b1'
        body = b"--b1\r\nContent-Type: text/plain\r\n\r\nnot dicom\r\n--b1--\r\n"
        request.return_value = (body, content_type_header)

        with self.assertRaises(OrthancDicomWebError):
            retrieve_instance(self.STUDY_UID, self.SERIES_UID, self.INSTANCE_UID)

    def test_rejects_invalid_uids_without_calling_orthanc(self):
        with self.assertRaises(OrthancDicomWebError):
            retrieve_instance("not-a-uid", self.SERIES_UID, self.INSTANCE_UID)
