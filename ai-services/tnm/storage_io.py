from __future__ import annotations

from pathlib import Path

from google.cloud import storage


def split_gcs_uri(uri: str) -> tuple[str, str]:
    if not uri.startswith("gs://"):
        raise ValueError("GCS URI must start with gs://")
    bucket, separator, name = uri[5:].partition("/")
    if not bucket or not separator or not name:
        raise ValueError("GCS URI must include a bucket and object name")
    return bucket, name


def download_file(uri: str, destination: Path) -> Path:
    bucket, name = split_gcs_uri(uri)
    destination.parent.mkdir(parents=True, exist_ok=True)
    storage.Client().bucket(bucket).blob(name).download_to_filename(destination)
    return destination


def download_prefix(uri: str, destination: Path) -> Path:
    bucket_name, prefix = split_gcs_uri(uri.rstrip("/") + "/placeholder")
    prefix = prefix.rsplit("/", 1)[0].rstrip("/") + "/"
    client = storage.Client()
    found = False
    for blob in client.list_blobs(bucket_name, prefix=prefix):
        relative = blob.name[len(prefix) :]
        if not relative:
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(target)
        found = True
    if not found:
        raise FileNotFoundError(f"No objects found under {uri}")
    return destination


def upload_file(source: Path, uri: str) -> str:
    bucket, name = split_gcs_uri(uri)
    storage.Client().bucket(bucket).blob(name).upload_from_filename(source)
    return uri
