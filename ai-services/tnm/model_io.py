from __future__ import annotations

import hashlib
import json
from pathlib import Path

from storage_io import download_file


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().lower()


def ensure_file(uri: str, destination: Path, expected_sha256: str | None = None) -> str:
    if not destination.is_file():
        download_file(uri, destination)
    actual = sha256(destination)
    if expected_sha256 and actual != expected_sha256.lower():
        destination.unlink(missing_ok=True)
        raise RuntimeError(f"SHA-256 mismatch for {uri}: {actual}")
    return actual


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))
