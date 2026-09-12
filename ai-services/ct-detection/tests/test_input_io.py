from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path

from input_io import InvalidCtInput, extract_dicom_zip, validate_filename


class InputIoTests(unittest.TestCase):
    def test_accepts_supported_names(self):
        self.assertEqual(validate_filename("scan.nii.gz"), "scan.nii.gz")
        self.assertEqual(validate_filename("dicom.zip"), "dicom.zip")

    def test_rejects_paths_and_unknown_extensions(self):
        with self.assertRaises(InvalidCtInput):
            validate_filename("../scan.nii")
        with self.assertRaises(InvalidCtInput):
            validate_filename("scan.exe")

    def test_rejects_zip_slip(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_path = root / "input.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("../escape.dcm", b"not-a-real-dicom")
            with self.assertRaises(InvalidCtInput):
                extract_dicom_zip(
                    archive_path,
                    root / "out",
                    max_files=10,
                    max_uncompressed_bytes=1024,
                )

    def test_selects_directory_containing_dicom_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_path = root / "input.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("study/series/001.dcm", b"one")
                archive.writestr("study/series/002.dcm", b"two")
            selected = extract_dicom_zip(
                archive_path,
                root / "out",
                max_files=10,
                max_uncompressed_bytes=1024,
            )
            self.assertEqual(selected.name, "series")


if __name__ == "__main__":
    unittest.main()
