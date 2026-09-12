import io
import json
from email.message import Message
from pathlib import Path
from unittest.mock import patch

import pytest

from orthanc_client import (
    OrthancDownloadError,
    download_orthanc_series,
    validate_orthanc_series_id,
)


class FakeResponse(io.BytesIO):
    def __init__(self, content: bytes, *, content_length: int | None = None):
        super().__init__(content)
        self.headers = Message()
        if content_length is not None:
            self.headers["Content-Length"] = str(content_length)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def test_validate_orthanc_series_id_rejects_paths():
    with pytest.raises(OrthancDownloadError, match="invalid Orthanc series ID"):
        validate_orthanc_series_id("../../instances")


def test_download_orthanc_series_checks_uid_and_writes_archive(tmp_path: Path):
    series_uid = "1.2.840.113619.2.1"
    metadata = json.dumps({"MainDicomTags": {"SeriesInstanceUID": series_uid}}).encode()
    archive = b"PK\x03\x04dicom-archive"
    with patch(
        "orthanc_client._open",
        side_effect=[FakeResponse(metadata), FakeResponse(archive, content_length=len(archive))],
    ):
        destination = tmp_path / "series.zip"
        size, actual_uid = download_orthanc_series(
            base_url="https://orthanc.example",
            username="reader",
            password="secret",
            series_id="a" * 40,
            destination=destination,
            timeout=10,
            max_bytes=1024,
            expected_series_uid=series_uid,
        )
    assert size == len(archive)
    assert actual_uid == series_uid
    assert destination.read_bytes() == archive


def test_download_orthanc_series_rejects_mismatched_uid(tmp_path: Path):
    metadata = json.dumps({"MainDicomTags": {"SeriesInstanceUID": "1.2.3"}}).encode()
    with patch("orthanc_client._open", return_value=FakeResponse(metadata)):
        with pytest.raises(OrthancDownloadError, match="does not match"):
            download_orthanc_series(
                base_url="https://orthanc.example",
                username="reader",
                password="secret",
                series_id="b" * 40,
                destination=tmp_path / "series.zip",
                timeout=10,
                max_bytes=1024,
                expected_series_uid="9.9.9",
            )
