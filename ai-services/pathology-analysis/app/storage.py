from __future__ import annotations

from pathlib import Path

from google.cloud import storage

from .artifacts import parse_gcs_uri


def download_wsi(uri: str, destination: Path, max_bytes: int) -> Path:
    bucket_name, object_name = parse_gcs_uri(uri)
    if not object_name.lower().endswith(".svs"):
        raise ValueError("wsi_gcs_uri must reference an .svs file")
    blob = storage.Client().bucket(bucket_name).blob(object_name)
    blob.reload()
    if blob.size is None or blob.size <= 0:
        raise ValueError("WSI object is empty")
    if blob.size > max_bytes:
        raise ValueError("WSI exceeds the configured size limit")
    destination.parent.mkdir(parents=True, exist_ok=True)
    blob.download_to_filename(destination)
    return destination


def upload_wsi_preview(*, wsi_uri: str, content: bytes) -> str:
    """Store a small browser preview beside its source WSI."""
    if not content:
        raise ValueError("WSI preview is empty")
    bucket_name, object_name = parse_gcs_uri(wsi_uri)
    preview_name = f"{object_name}.preview.jpg"
    blob = storage.Client().bucket(bucket_name).blob(preview_name)
    blob.cache_control = "private, max-age=3600"
    blob.upload_from_string(content, content_type="image/jpeg")
    return f"gs://{bucket_name}/{preview_name}"
