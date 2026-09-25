"""Asynchronous GCS WSI to Orthanc registration.

The converter itself runs in the dedicated ``wsi-dicomizer`` Compose service.
This module deliberately only stages one slide, waits for that service, and
persists identifiers returned by Orthanc.  It is never used by AI inference.
"""

from __future__ import annotations

import base64
import json
import logging
import time
from contextlib import contextmanager
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from django.conf import settings
from django.db import transaction
from google.cloud import storage

from ..models import WholeSlideImage


logger = logging.getLogger(__name__)

STAGING_DIRECTORY = Path("/wsi-staging")
POLL_SECONDS = 2
TIMEOUT_SECONDS = 30 * 60


class WsiOrthancRegistrationError(RuntimeError):
    def __init__(self, message, *, upstream_status=None):
        super().__init__(message)
        self.upstream_status = upstream_status


def _orthanc_request(path: str):
    credentials = base64.b64encode(
        f"{settings.ORTHANC_USERNAME}:{settings.ORTHANC_PASSWORD}".encode("utf-8")
    ).decode("ascii")
    request = Request(
        f"{settings.ORTHANC_BASE_URL}{path}",
        headers={"Accept": "application/json", "Authorization": f"Basic {credentials}"},
    )
    try:
        with urlopen(request, timeout=settings.ORTHANC_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise WsiOrthancRegistrationError(
            f"Orthanc request failed for {path}.",
            upstream_status=exc.code,
        ) from exc
    except Exception as exc:
        raise WsiOrthancRegistrationError(f"Orthanc request failed for {path}.") from exc


def _download_gcs_wsi(storage_uri: str, destination: Path) -> None:
    parsed = urlparse(storage_uri)
    object_name = parsed.path.lstrip("/")
    if parsed.scheme != "gs" or not parsed.netloc or not object_name:
        raise WsiOrthancRegistrationError("WSI source must be a valid GCS URI.")
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        storage.Client().bucket(parsed.netloc).blob(object_name).download_to_filename(destination)
    except Exception as exc:
        raise WsiOrthancRegistrationError("Failed to download WSI from GCS.") from exc


@contextmanager
def _registration_lock():
    """Serialize converter use so a new Orthanc series can be attributed safely."""
    STAGING_DIRECTORY.mkdir(parents=True, exist_ok=True)
    lock_path = STAGING_DIRECTORY / ".registration.lock"
    with lock_path.open("a+") as lock_file:
        try:
            import fcntl
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        except ImportError:  # pragma: no cover - deployment runs on Linux
            pass
        try:
            yield
        finally:
            try:
                import fcntl
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
            except ImportError:  # pragma: no cover
                pass


def _wait_for_converter(source_path: Path) -> None:
    ready_path = source_path.with_suffix(source_path.suffix + ".ready")
    done_path = source_path.with_suffix(source_path.suffix + ".done")
    failed_path = source_path.with_suffix(source_path.suffix + ".failed")
    log_path = source_path.with_suffix(source_path.suffix + ".log")
    for path in (done_path, failed_path, log_path):
        path.unlink(missing_ok=True)
    ready_path.touch()
    deadline = time.monotonic() + TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if done_path.exists():
            return
        if failed_path.exists():
            detail = log_path.read_text(errors="replace")[-2000:] if log_path.exists() else ""
            raise WsiOrthancRegistrationError(f"OrthancWSIDicomizer failed. {detail}")
        time.sleep(POLL_SECONDS)
    raise WsiOrthancRegistrationError("Timed out waiting for OrthancWSIDicomizer.")


def _persist_new_series(*, wsi_id: str, before_series_ids: set[str]) -> str:
    after_series_ids = set(_orthanc_request("/series"))
    new_series_ids = after_series_ids - before_series_ids
    if len(new_series_ids) != 1:
        raise WsiOrthancRegistrationError(
            "Could not identify exactly one Orthanc series created for this WSI."
        )
    series_id = new_series_ids.pop()
    series = _orthanc_request(f"/series/{series_id}")
    instances = series.get("Instances") if isinstance(series, dict) else None
    if not isinstance(instances, list) or not instances:
        raise WsiOrthancRegistrationError("Registered Orthanc WSI series has no instance.")
    instance_id = instances[0]
    instance = _orthanc_request(f"/instances/{instance_id}")
    tags = instance.get("MainDicomTags", {}) if isinstance(instance, dict) else {}
    series_tags = series.get("MainDicomTags", {}) if isinstance(series, dict) else {}

    with transaction.atomic():
        wsi = WholeSlideImage.objects.select_for_update().get(id=wsi_id)
        if wsi.orthanc_series_id:
            return wsi.orthanc_series_id
        wsi.orthanc_series_id = series_id
        wsi.orthanc_instance_id = instance_id
        wsi.study_instance_uid = tags.get("StudyInstanceUID")
        wsi.series_instance_uid = series_tags.get("SeriesInstanceUID") or tags.get("SeriesInstanceUID")
        wsi.sop_instance_uid = tags.get("SOPInstanceUID")
        wsi.save(update_fields=[
            "orthanc_series_id", "orthanc_instance_id", "study_instance_uid",
            "series_instance_uid", "sop_instance_uid", "updated_at",
        ])
    return series_id


def register_wsi_with_orthanc(wsi_id: str) -> str:
    """Register one WSI and return a status; errors are handled by the caller."""
    with _registration_lock():
        wsi = WholeSlideImage.objects.select_related("image_asset").get(id=wsi_id)
        if wsi.orthanc_series_id:
            stale_series_id = wsi.orthanc_series_id
            try:
                _orthanc_request(f"/series/{stale_series_id}")
            except WsiOrthancRegistrationError as exc:
                if exc.upstream_status != 404:
                    raise
                with transaction.atomic():
                    locked = WholeSlideImage.objects.select_for_update().get(id=wsi_id)
                    if locked.orthanc_series_id == stale_series_id:
                        locked.orthanc_series_id = None
                        locked.orthanc_instance_id = None
                        locked.save(update_fields=[
                            "orthanc_series_id",
                            "orthanc_instance_id",
                            "updated_at",
                        ])
                wsi.refresh_from_db()
            else:
                return "already_registered"
        source_path = STAGING_DIRECTORY / f"{wsi.id}.svs"
        try:
            _download_gcs_wsi(wsi.image_asset.storage_uri, source_path)
            before_series_ids = set(_orthanc_request("/series"))
            _wait_for_converter(source_path)
            series_id = _persist_new_series(wsi_id=str(wsi.id), before_series_ids=before_series_ids)
            logger.info("Registered WSI %s in Orthanc series %s", wsi.id, series_id)
            return "registered"
        finally:
            for suffix in ("", ".ready", ".processing", ".done", ".failed", ".log"):
                (Path(f"{source_path}{suffix}")).unlink(missing_ok=True)
