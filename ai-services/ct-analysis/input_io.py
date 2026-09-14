from __future__ import annotations

import shutil
import zipfile
from pathlib import Path


class InvalidCtInput(ValueError):
    pass


def extract_dicom_zip(
    archive_path: Path,
    destination: Path,
    *,
    max_files: int,
    max_uncompressed_bytes: int,
) -> Path:
    destination.mkdir(parents=True, exist_ok=True)
    root = destination.resolve()
    total_size = 0
    try:
        archive = zipfile.ZipFile(archive_path)
    except zipfile.BadZipFile as exc:
        raise InvalidCtInput("invalid DICOM zip archive") from exc

    with archive:
        members = [member for member in archive.infolist() if not member.is_dir()]
        if not members or len(members) > max_files:
            raise InvalidCtInput("DICOM zip is empty or contains too many files")
        for member in members:
            total_size += member.file_size
            if total_size > max_uncompressed_bytes:
                raise InvalidCtInput("expanded DICOM input exceeds the configured limit")
            target = (root / member.filename).resolve()
            if root not in target.parents:
                raise InvalidCtInput("DICOM zip contains an unsafe path")
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
    return root


def dicom_directory_to_nifti(dicom_root: Path, destination: Path) -> Path:
    import SimpleITK as sitk

    candidates: list[list[str]] = []
    for directory in {path.parent for path in dicom_root.rglob("*") if path.is_file()}:
        for series_id in sitk.ImageSeriesReader.GetGDCMSeriesIDs(str(directory)) or []:
            names = sitk.ImageSeriesReader.GetGDCMSeriesFileNames(str(directory), series_id)
            if names:
                candidates.append(list(names))
    if not candidates:
        raise InvalidCtInput("DICOM archive does not contain a readable image series")
    files = max(candidates, key=len)
    reader = sitk.ImageSeriesReader()
    reader.SetFileNames(files)
    image = reader.Execute()
    destination.parent.mkdir(parents=True, exist_ok=True)
    sitk.WriteImage(image, str(destination), True)
    return destination
