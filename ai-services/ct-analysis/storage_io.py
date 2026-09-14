from __future__ import annotations

import mimetypes
from pathlib import Path


def parse_gcs_uri(uri: str) -> tuple[str, str]:
    if not uri.startswith("gs://"):
        raise ValueError(f"invalid GCS URI: {uri}")
    bucket, separator, blob = uri[5:].partition("/")
    if not separator or not bucket or not blob:
        raise ValueError(f"invalid GCS URI: {uri}")
    return bucket, blob.strip("/")


def download_file(uri: str, destination: Path) -> Path:
    from google.cloud import storage

    bucket_name, blob_name = parse_gcs_uri(uri)
    destination.parent.mkdir(parents=True, exist_ok=True)
    storage.Client().bucket(bucket_name).blob(blob_name).download_to_filename(destination)
    return destination


def download_prefix(uri: str, destination: Path) -> Path:
    from google.cloud import storage

    bucket_name, prefix = parse_gcs_uri(uri)
    prefix = prefix.rstrip("/") + "/"
    destination.mkdir(parents=True, exist_ok=True)
    client = storage.Client()
    found = False
    for blob in client.list_blobs(bucket_name, prefix=prefix):
        relative = blob.name[len(prefix):]
        if not relative:
            continue
        found = True
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(target)
    if not found:
        raise FileNotFoundError(f"GCS prefix is empty: {uri}")
    return destination


def upload_tree(source: Path, destination_uri: str) -> str:
    from google.cloud import storage

    bucket_name, prefix = parse_gcs_uri(destination_uri)
    prefix = prefix.rstrip("/")
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    uploaded = False
    for path in source.rglob("*"):
        if not path.is_file():
            continue
        uploaded = True
        relative = path.relative_to(source).as_posix()
        blob = bucket.blob(f"{prefix}/{relative}")
        content_type, _ = mimetypes.guess_type(path.name)
        blob.upload_from_filename(path, content_type=content_type)
    if not uploaded:
        raise ValueError(f"nothing to upload from {source}")
    return f"gs://{bucket_name}/{prefix}/"
