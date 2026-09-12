from __future__ import annotations

import os
import shutil
import zipfile
from pathlib import Path


SUPPORTED_FILENAMES = (".nii", ".nii.gz", ".zip")


class InvalidCtInput(ValueError):
    pass


def validate_filename(filename: str) -> str:
    name = Path(filename).name
    if not name or name != filename:
        raise InvalidCtInput("filename must be a plain file name")
    lowered = name.lower()
    if not lowered.endswith(SUPPORTED_FILENAMES):
        raise InvalidCtInput("supported inputs are .nii, .nii.gz, and DICOM .zip")
    return name


async def stream_request_to_file(request, destination: Path, max_bytes: int) -> int:
    written = 0
    with destination.open("wb") as output:
        async for chunk in request.stream():
            written += len(chunk)
            if written > max_bytes:
                output.close()
                destination.unlink(missing_ok=True)
                raise InvalidCtInput("CT input exceeds the configured size limit")
            output.write(chunk)
    if written == 0:
        destination.unlink(missing_ok=True)
        raise InvalidCtInput("request body is empty")
    return written


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
        if not members:
            raise InvalidCtInput("DICOM zip archive is empty")
        if len(members) > max_files:
            raise InvalidCtInput("DICOM zip contains too many files")

        for member in members:
            total_size += member.file_size
            if total_size > max_uncompressed_bytes:
                raise InvalidCtInput("expanded DICOM input exceeds the configured size limit")

            target = (root / member.filename).resolve()
            if os.path.commonpath((str(root), str(target))) != str(root):
                raise InvalidCtInput("DICOM zip contains an unsafe path")
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)

    directories: dict[Path, int] = {}
    for file_path in root.rglob("*"):
        if file_path.is_file() and not file_path.name.startswith("."):
            directories[file_path.parent] = directories.get(file_path.parent, 0) + 1
    if not directories:
        raise InvalidCtInput("DICOM zip does not contain readable files")
    return max(directories, key=directories.get)


def prepare_ct_input(
    uploaded_path: Path,
    filename: str,
    work_dir: Path,
    *,
    max_dicom_files: int,
    max_uncompressed_bytes: int,
) -> Path:
    if filename.lower().endswith(".zip"):
        return extract_dicom_zip(
            uploaded_path,
            work_dir / "dicom",
            max_files=max_dicom_files,
            max_uncompressed_bytes=max_uncompressed_bytes,
        )
    return uploaded_path
