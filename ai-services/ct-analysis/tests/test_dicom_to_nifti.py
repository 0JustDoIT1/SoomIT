from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import nibabel as nib
import numpy as np
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian, generate_uid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from input_io import dicom_directory_to_nifti


class DicomToNiftiTest(unittest.TestCase):
    def test_converts_sorted_slices_to_hu_nifti_and_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            dicom_dir = root / "dicom"
            dicom_dir.mkdir()
            series_uid = generate_uid()
            study_uid = generate_uid()

            for instance, z, stored_value in ((3, 5.0, 30), (1, 1.0, 10), (2, 3.0, 20)):
                file_meta = FileMetaDataset()
                file_meta.MediaStorageSOPClassUID = CTImageStorage
                file_meta.MediaStorageSOPInstanceUID = generate_uid()
                file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
                dataset = FileDataset(
                    str(dicom_dir / f"slice-{instance}.dcm"),
                    {},
                    file_meta=file_meta,
                    preamble=b"\0" * 128,
                )
                dataset.SOPClassUID = CTImageStorage
                dataset.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
                dataset.StudyInstanceUID = study_uid
                dataset.SeriesInstanceUID = series_uid
                dataset.Modality = "CT"
                dataset.PatientID = "TEST"
                dataset.Rows = 2
                dataset.Columns = 3
                dataset.SamplesPerPixel = 1
                dataset.PhotometricInterpretation = "MONOCHROME2"
                dataset.PixelRepresentation = 1
                dataset.BitsAllocated = 16
                dataset.BitsStored = 16
                dataset.HighBit = 15
                dataset.InstanceNumber = instance
                dataset.ImagePositionPatient = [0.0, 0.0, z]
                dataset.ImageOrientationPatient = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
                dataset.PixelSpacing = [0.7, 0.8]
                dataset.SliceThickness = 2.0
                dataset.RescaleSlope = 2.0
                dataset.RescaleIntercept = -1000.0
                pixels = np.full((2, 3), stored_value, dtype=np.int16)
                dataset.PixelData = pixels.tobytes()
                dataset.save_as(dataset.filename, write_like_original=False)

            output = root / "CASE001_0000.nii.gz"
            metadata = root / "dicom_to_nifti_metadata.json"
            dicom_directory_to_nifti(dicom_dir, output, metadata_path=metadata)

            image = nib.load(str(output))
            volume = image.get_fdata()
            self.assertEqual(volume.shape, (3, 2, 3))
            np.testing.assert_allclose(volume[0, 0, :], [-980.0, -960.0, -940.0])
            np.testing.assert_allclose(image.header.get_zooms(), (0.8, 0.7, 2.0))

            payload = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(payload["source"]["series_instance_uid"], series_uid)
            self.assertEqual(payload["validation"]["slice_count"], 3)
            self.assertFalse(payload["validation"]["duplicate_slice_position"])


if __name__ == "__main__":
    unittest.main()
