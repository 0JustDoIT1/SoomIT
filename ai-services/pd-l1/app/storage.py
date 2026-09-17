from pathlib import Path
from urllib.parse import urlparse

from google.cloud import storage


class InvalidGCSUri(ValueError):
    pass


def parse_gcs_uri(uri: str) -> tuple[str, str]:
    normalized = "gs://" + uri[6:] if uri.startswith("gcs://") else uri
    parsed = urlparse(normalized)
    if parsed.scheme != "gs" or not parsed.netloc or not parsed.path.strip("/"):
        raise InvalidGCSUri("wsi_gcs_uri must be a gs:// or gcs:// object URI")
    return parsed.netloc, parsed.path.lstrip("/")


def download_gcs_file(uri: str, destination: Path) -> None:
    bucket_name, object_name = parse_gcs_uri(uri)

    destination.parent.mkdir(parents=True, exist_ok=True)
    storage.Client().bucket(bucket_name).blob(object_name).download_to_filename(destination)


def upload_wsi_preview(*, wsi_uri: str, content: bytes) -> str:
    if not content:
        raise ValueError("WSI preview is empty")
    bucket_name, object_name = parse_gcs_uri(wsi_uri)
    preview_name = f"{object_name}.preview.jpg"
    blob = storage.Client().bucket(bucket_name).blob(preview_name)
    blob.cache_control = "private, max-age=3600"
    blob.upload_from_string(content, content_type="image/jpeg")
    return f"gs://{bucket_name}/{preview_name}"
