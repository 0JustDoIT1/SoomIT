from __future__ import annotations

import hashlib
from pathlib import Path

from google.cloud import storage


def parse_gcs_uri(uri: str) -> tuple[str, str]:
    if not uri.startswith("gs://"):
        raise ValueError("GCS URI must start with gs://")
    bucket, separator, name = uri[5:].partition("/")
    if not bucket or not separator or not name:
        raise ValueError("GCS URI must include a bucket and object name")
    return bucket, name


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_artifact(uri: str, destination: Path, expected_sha256: str) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.is_file() or sha256(destination) != expected_sha256.lower():
        bucket_name, object_name = parse_gcs_uri(uri)
        storage.Client().bucket(bucket_name).blob(object_name).download_to_filename(
            destination
        )
    actual = sha256(destination)
    if actual != expected_sha256.lower():
        destination.unlink(missing_ok=True)
        raise RuntimeError(f"SHA-256 mismatch for {destination.name}: {actual}")
    return actual
