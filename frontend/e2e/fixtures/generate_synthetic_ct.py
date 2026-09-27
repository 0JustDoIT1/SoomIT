"""Generate tiny, wholly synthetic CT slices for browser rendering QA (no PHI)."""
from pathlib import Path

import numpy as np
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian

output = Path(__file__).parent / "synthetic-ct"
output.mkdir(exist_ok=True)
for index in range(8):
    uid = f"1.2.826.0.1.3680043.10.999.1.{index + 1}"
    meta = FileMetaDataset()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    meta.MediaStorageSOPClassUID = CTImageStorage
    meta.MediaStorageSOPInstanceUID = uid
    dataset = FileDataset(None, {}, file_meta=meta, preamble=b"\0" * 128)
    dataset.SOPClassUID = CTImageStorage
    dataset.SOPInstanceUID = uid
    dataset.StudyInstanceUID = "1.2.826.0.1.3680043.10.999.2"
    dataset.SeriesInstanceUID = "1.2.826.0.1.3680043.10.999.3"
    dataset.FrameOfReferenceUID = "1.2.826.0.1.3680043.10.999.4"
    dataset.PatientName = "SYNTHETIC^QA"
    dataset.PatientID = "SYNTHETIC-QA"
    dataset.Modality = "CT"
    dataset.InstanceNumber = index + 1
    dataset.Rows = dataset.Columns = 64
    dataset.PixelSpacing = [1, 1]
    dataset.SliceThickness = 1
    dataset.ImagePositionPatient = [0, 0, index]
    dataset.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    dataset.SamplesPerPixel = 1
    dataset.PhotometricInterpretation = "MONOCHROME2"
    dataset.BitsAllocated = dataset.BitsStored = 16
    dataset.HighBit = 15
    dataset.PixelRepresentation = 1
    dataset.RescaleIntercept = 0
    dataset.RescaleSlope = 1
    dataset.WindowCenter = -500
    dataset.WindowWidth = 1500
    y, x = np.ogrid[:64, :64]
    pixels = np.full((64, 64), -1000, dtype=np.int16)
    pixels[(x - 32) ** 2 + (y - 32) ** 2 < (20 + index % 3) ** 2] = 100
    dataset.PixelData = pixels.tobytes()
    dataset.save_as(output / f"{index + 1}.dcm", enforce_file_format=True)
