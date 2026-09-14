from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ModelArtifact:
    name: str
    path: Path
    gcs_uri: str
    sha256: str = ""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_artifact(artifact: ModelArtifact) -> str:
    expected = artifact.sha256.strip().lower()
    if artifact.path.is_file():
        actual = sha256_file(artifact.path)
        if not expected or actual == expected:
            return actual

    if not artifact.gcs_uri.startswith("gs://"):
        raise FileNotFoundError(
            f"{artifact.name} is missing and its GCS URI is not configured"
        )

    from google.cloud import storage
    from storage_io import parse_gcs_uri

    bucket_name, blob_name = parse_gcs_uri(artifact.gcs_uri)
    artifact.path.parent.mkdir(parents=True, exist_ok=True)
    temporary = artifact.path.with_name(f".{artifact.path.name}.download")
    temporary.unlink(missing_ok=True)
    try:
        storage.Client().bucket(bucket_name).blob(blob_name).download_to_filename(temporary)
        actual = sha256_file(temporary)
        if expected and actual != expected:
            raise RuntimeError(
                f"{artifact.name} SHA-256 mismatch: expected {expected}, received {actual}"
            )
        os.replace(temporary, artifact.path)
        return actual
    finally:
        temporary.unlink(missing_ok=True)
