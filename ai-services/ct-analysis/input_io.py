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


def dicom_directory_to_nifti(
    dicom_root: Path,
    destination: Path,
    *,
    metadata_path: Path | None = None,
) -> Path:
    """Convert one raw CT DICOM series with the bundled training-compatible converter."""
    from packages.final_ct_analysis_deploy_ready.code.dicom_to_nifti import (
        convert_dicom_series,
    )

    try:
        convert_dicom_series(
            dicom_dir=dicom_root,
            output_nifti=destination,
            metadata_path=metadata_path,
        )
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        raise InvalidCtInput(str(exc)) from exc
    return destination
