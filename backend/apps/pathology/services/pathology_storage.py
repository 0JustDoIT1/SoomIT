from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
import re
import struct
import tempfile
from uuid import uuid4
from urllib.parse import urlparse

from django.conf import settings
from google.cloud import storage


class PathologyStorageError(RuntimeError):
    pass


def read_svs_mpp(uploaded_file):
    """Read the explicitly recorded Aperio MPP value from an SVS TIFF header."""
    original_position = uploaded_file.tell()
    try:
        uploaded_file.seek(0)
        header = uploaded_file.read(8)
        if len(header) != 8 or header[:2] not in (b"II", b"MM"):
            return None

        endian = "<" if header[:2] == b"II" else ">"
        magic, ifd_offset = struct.unpack(f"{endian}HI", header[2:])
        if magic != 42:
            return None

        uploaded_file.seek(ifd_offset)
        count_bytes = uploaded_file.read(2)
        if len(count_bytes) != 2:
            return None
        entry_count = struct.unpack(f"{endian}H", count_bytes)[0]

        for _ in range(entry_count):
            entry = uploaded_file.read(12)
            if len(entry) != 12:
                return None
            tag, field_type, value_count = struct.unpack(f"{endian}HHI", entry[:8])
            if tag != 270 or field_type != 2 or value_count == 0:
                continue

            value = entry[8:12] if value_count <= 4 else None
            if value is None:
                description_offset = struct.unpack(f"{endian}I", entry[8:12])[0]
                uploaded_file.seek(description_offset)
                value = uploaded_file.read(min(value_count, 1024 * 1024))
            match = re.search(rb"(?:^|[|\s])MPP\s*=\s*([0-9]+(?:\.[0-9]+)?)", value, re.IGNORECASE)
            if match:
                return match.group(1).decode("ascii")
            return None
        return None
    except (OSError, struct.error, ValueError):
        return None
    finally:
        uploaded_file.seek(original_position)


def download_pathology_wsi_preview(wsi_uri):
    if not wsi_uri.startswith("gs://"):
        raise PathologyStorageError("Pathology WSI must be stored in GCS.")
    bucket_name, separator, object_name = wsi_uri[5:].partition("/")
    if not bucket_name or not separator or not object_name:
        raise PathologyStorageError("Invalid pathology WSI storage URI.")
    try:
        blob = storage.Client().bucket(bucket_name).blob(_preview_object_name(object_name))
        if not blob.exists():
            raise PathologyStorageError("WSI preview is not available yet.")
        return blob.download_as_bytes(), "image/jpeg"
    except PathologyStorageError:
        raise
    except Exception as exc:
        raise PathologyStorageError("Failed to download pathology WSI preview.") from exc


def _preview_object_name(object_name):
    return f"{object_name}.preview.jpg"


@contextmanager
def _local_wsi_path(source):
    if hasattr(source, "temporary_file_path"):
        yield Path(source.temporary_file_path())
        return

    with tempfile.TemporaryDirectory(prefix="pathology-wsi-preview-") as temporary_directory:
        local_path = Path(temporary_directory) / "source-wsi"
        if isinstance(source, (bytes, bytearray, memoryview)):
            local_path.write_bytes(source)
        else:
            original_position = source.tell()
            try:
                source.seek(0)
                with local_path.open("wb") as destination:
                    while chunk := source.read(8 * 1024 * 1024):
                        destination.write(chunk)
            finally:
                source.seek(original_position)
        yield local_path


def _create_wsi_preview_jpeg(source, max_size=1200):
    # Import lazily so environments without the OpenSlide native library can
    # still start; callers intentionally keep preview failures non-fatal.
    import openslide

    with _local_wsi_path(source) as local_path:
        slide = openslide.OpenSlide(str(local_path))
        try:
            thumbnail = slide.get_thumbnail((max_size, max_size)).convert("RGB")
            output = BytesIO()
            thumbnail.save(output, format="JPEG", quality=85, optimize=True)
            content = output.getvalue()
            if not content:
                raise PathologyStorageError("Generated WSI preview is empty.")
            return content
        finally:
            slide.close()


def create_and_upload_wsi_preview(*, wsi_uri, wsi_source):
    """Create a bounded JPEG preview beside a GCS WSI using the existing naming rule."""
    parsed = urlparse(wsi_uri)
    if parsed.scheme != "gs" or not parsed.netloc or not parsed.path.strip("/"):
        raise PathologyStorageError("Invalid pathology WSI storage URI.")
    bucket_name = parsed.netloc
    object_name = parsed.path.lstrip("/")
    try:
        content = _create_wsi_preview_jpeg(wsi_source, max_size=1200)
        preview_blob = storage.Client().bucket(bucket_name).blob(_preview_object_name(object_name))
        preview_blob.cache_control = "private, max-age=3600"
        preview_blob.upload_from_string(content, content_type="image/jpeg")
        return f"gs://{bucket_name}/{_preview_object_name(object_name)}"
    except Exception as exc:
        raise PathologyStorageError("Failed to generate or upload pathology WSI preview.") from exc


def upload_pathology_wsi(*, hospital_id, case_id, order_id, uploaded_file):
    bucket_name = settings.PATHOLOGY_GCS_BUCKET
    if not bucket_name:
        raise PathologyStorageError(
            "PATHOLOGY_GCS_BUCKET is not configured."
        )

    extension = Path(uploaded_file.name).suffix.lower()
    if extension != ".svs":
        raise PathologyStorageError(
            "Pathology H&E WSI must be an SVS file."
        )

    object_name = (
        f"pathology/{case_id}/"
        f"{uuid4().hex}{extension}"
    )

    try:
        client = storage.Client()
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(object_name)

        uploaded_file.seek(0)
        blob.upload_from_file(
            uploaded_file,
            content_type=uploaded_file.content_type
            or "application/octet-stream",
        )
    except Exception as exc:
        raise PathologyStorageError(
            "Failed to upload pathology H&E WSI to GCS."
        ) from exc

    return f"gs://{bucket_name}/{object_name}"
