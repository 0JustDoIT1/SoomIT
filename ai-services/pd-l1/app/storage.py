from pathlib import Path
from urllib.parse import urlparse

from google.cloud import storage


class InvalidGCSUri(ValueError):
    pass


def download_gcs_file(uri: str, destination: Path) -> None:
    normalized = "gs://" + uri[6:] if uri.startswith("gcs://") else uri
    parsed = urlparse(normalized)
    if parsed.scheme != "gs" or not parsed.netloc or not parsed.path.strip("/"):
        raise InvalidGCSUri("wsi_gcs_uri must be a gs:// or gcs:// object URI")

    destination.parent.mkdir(parents=True, exist_ok=True)
    storage.Client().bucket(parsed.netloc).blob(parsed.path.lstrip("/")).download_to_filename(
        destination
    )
