from __future__ import annotations

import base64
import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ORTHANC_ID_PATTERN = re.compile(r"^[0-9a-fA-F]{40}$")


class OrthancDownloadError(RuntimeError):
    pass


def validate_orthanc_series_id(series_id: str) -> str:
    if not ORTHANC_ID_PATTERN.fullmatch(series_id):
        raise OrthancDownloadError("invalid Orthanc series ID")
    return series_id.lower()


def _authorization_header(username: str, password: str) -> str:
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return f"Basic {token}"


def _open(base_url: str, path: str, *, username: str, password: str, timeout: float):
    request = Request(
        f"{base_url.rstrip('/')}{path}",
        headers={
            "Accept": "application/json, application/zip",
            "Authorization": _authorization_header(username, password),
        },
    )
    try:
        return urlopen(request, timeout=timeout)
    except HTTPError as exc:
        if exc.code == 404:
            raise OrthancDownloadError("Orthanc series was not found") from exc
        raise OrthancDownloadError(f"Orthanc request failed (HTTP {exc.code})") from exc
    except (URLError, TimeoutError) as exc:
        raise OrthancDownloadError("could not connect to Orthanc") from exc


def download_orthanc_series(
    *,
    base_url: str,
    username: str,
    password: str,
    series_id: str,
    destination: Path,
    timeout: float,
    max_bytes: int,
    expected_series_uid: str | None = None,
) -> tuple[int, str | None]:
    series_id = validate_orthanc_series_id(series_id)

    with _open(
        base_url,
        f"/series/{series_id}",
        username=username,
        password=password,
        timeout=timeout,
    ) as response:
        try:
            metadata = json.loads(response.read().decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise OrthancDownloadError("Orthanc returned invalid series metadata") from exc

    series_uid = (metadata.get("MainDicomTags") or {}).get("SeriesInstanceUID")
    if expected_series_uid and series_uid != expected_series_uid:
        raise OrthancDownloadError("Orthanc series UID does not match the requested DICOM series UID")

    written = 0
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with _open(
            base_url,
            f"/series/{series_id}/archive",
            username=username,
            password=password,
            timeout=timeout,
        ) as response, destination.open("wb") as output:
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > max_bytes:
                raise OrthancDownloadError("Orthanc series archive exceeds the configured size limit")
            while chunk := response.read(1024 * 1024):
                written += len(chunk)
                if written > max_bytes:
                    raise OrthancDownloadError("Orthanc series archive exceeds the configured size limit")
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    if written == 0:
        destination.unlink(missing_ok=True)
        raise OrthancDownloadError("Orthanc returned an empty series archive")
    return written, series_uid
