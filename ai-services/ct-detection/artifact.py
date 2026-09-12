from __future__ import annotations

import hashlib
import os
from pathlib import Path


def verify_sha256(path: Path, expected_sha256: str) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"model checkpoint does not exist: {path}")

    digest = hashlib.sha256()
    with path.open("rb") as checkpoint:
        for chunk in iter(lambda: checkpoint.read(1024 * 1024), b""):
            digest.update(chunk)

    actual = digest.hexdigest()
    expected = expected_sha256.strip().lower()
    if expected and actual != expected:
        raise RuntimeError(
            "model checkpoint SHA-256 mismatch: "
            f"expected {expected}, received {actual}"
        )
    return actual


def ensure_gcs_artifact(gcs_uri: str | None, path: Path, expected_sha256: str) -> str:
    if path.is_file():
        try:
            return verify_sha256(path, expected_sha256)
        except RuntimeError:
            if not gcs_uri:
                raise

    if not gcs_uri or not gcs_uri.startswith("gs://"):
        raise FileNotFoundError(
            f"model checkpoint is missing at {path} and MODEL_GCS_URI is not configured"
        )

    bucket_name, separator, blob_name = gcs_uri[5:].partition("/")
    if not separator or not bucket_name or not blob_name:
        raise ValueError(f"invalid GCS model URI: {gcs_uri}")

    from google.cloud import storage

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.download")
    temporary.unlink(missing_ok=True)
    try:
        storage.Client().bucket(bucket_name).blob(blob_name).download_to_filename(temporary)
        actual = verify_sha256(temporary, expected_sha256)
        os.replace(temporary, path)
        return actual
    finally:
        temporary.unlink(missing_ok=True)
