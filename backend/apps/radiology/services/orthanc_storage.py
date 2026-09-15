from dataclasses import dataclass

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class OrthancError(RuntimeError):
    """Base error for Orthanc CT series storage operations."""


class OrthancUploadError(OrthancError):
    pass


class OrthancSeriesConsistencyError(OrthancError):
    pass


@dataclass(frozen=True)
class OrthancSeriesUploadResult:
    orthanc_study_id: str
    orthanc_series_id: str
    instance_ids: list[str]


def _build_session():
    """A pooled, retrying session for bulk instance uploads to one Orthanc host.

    A CT series can be hundreds of sequential requests; without connection reuse
    and retries, a single transient reset (observed against the small Orthanc VM
    under sustained load) aborts the whole upload. Orthanc's POST /instances is
    idempotent per DICOM instance (a re-sent instance is just reported as already
    stored), so retrying POITs is safe here.
    """
    session = requests.Session()
    session.auth = (settings.ORTHANC_USERNAME, settings.ORTHANC_PASSWORD)
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        backoff_factor=1.5,
        status_forcelist=[502, 503, 504],
        allowed_methods=frozenset(["GET", "POST", "DELETE"]),
    )
    adapter = HTTPAdapter(pool_connections=1, pool_maxsize=1, max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def _upload_instance(session, dicom_bytes):
    """Upload one DICOM Part10 file via Orthanc's REST API and return its JSON response."""
    try:
        response = session.post(
            f"{settings.ORTHANC_BASE_URL}/instances",
            data=dicom_bytes,
            headers={"Content-Type": "application/dicom"},
            timeout=settings.ORTHANC_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else "?"
        raise OrthancUploadError(f"Orthanc 업로드가 실패했습니다. (HTTP {status_code})") from exc
    except requests.RequestException as exc:
        raise OrthancUploadError("Orthanc에 연결할 수 없습니다.") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise OrthancUploadError("Orthanc 업로드 응답이 올바른 JSON이 아닙니다.") from exc

    required = {"ID", "ParentSeries", "ParentStudy"}
    if not isinstance(payload, dict) or not required.issubset(payload):
        raise OrthancUploadError("Orthanc 업로드 응답에 필수 정보가 없습니다.")
    return payload


def upload_ct_series(dicom_files):
    """Upload every instance of one CT Series to Orthanc, returning its Study/Series IDs.

    Raises OrthancSeriesConsistencyError if Orthanc assigns the uploaded instances to
    more than one Study/Series (should not happen since callers pre-validate the
    Series/StudyInstanceUID consistency of `dicom_files` before calling this).
    """
    instance_ids = []
    study_ids = set()
    series_ids = set()
    with _build_session() as session:
        for dicom_bytes in dicom_files:
            result = _upload_instance(session, dicom_bytes)
            instance_ids.append(result["ID"])
            study_ids.add(result["ParentStudy"])
            series_ids.add(result["ParentSeries"])

    if len(study_ids) != 1 or len(series_ids) != 1:
        raise OrthancSeriesConsistencyError(
            "업로드된 DICOM 파일들이 Orthanc에서 서로 다른 Study/Series로 저장되었습니다.",
        )

    return OrthancSeriesUploadResult(
        orthanc_study_id=study_ids.pop(),
        orthanc_series_id=series_ids.pop(),
        instance_ids=instance_ids,
    )


def delete_orthanc_series(orthanc_series_id):
    """Best-effort cleanup for a Series uploaded before its DB asset could be created."""
    try:
        with _build_session() as session:
            response = session.delete(
                f"{settings.ORTHANC_BASE_URL}/series/{orthanc_series_id}",
                timeout=settings.ORTHANC_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
    except requests.RequestException as exc:
        raise OrthancUploadError("업로드된 Orthanc Series를 정리하지 못했습니다.") from exc
