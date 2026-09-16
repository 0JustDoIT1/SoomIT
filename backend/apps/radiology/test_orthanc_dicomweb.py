from django.test import SimpleTestCase

from apps.radiology.services.orthanc_dicomweb import is_valid_dicom_uid


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
