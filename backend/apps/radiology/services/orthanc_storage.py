import base64
import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


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


def _auth_header():
    token = base64.b64encode(
        f"{settings.ORTHANC_USERNAME}:{settings.ORTHANC_PASSWORD}".encode("utf-8"),
    ).decode("ascii")
    return f"Basic {token}"


def _upload_instance(dicom_bytes):
    """Upload one DICOM Part10 file via Orthanc's REST API and return its JSON response."""
    request = Request(
        f"{settings.ORTHANC_BASE_URL}/instances",
        data=dicom_bytes,
        method="POST",
        headers={
            "Content-Type": "application/dicom",
            "Authorization": _auth_header(),
        },
    )
    try:
        with urlopen(request, timeout=settings.ORTHANC_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise OrthancUploadError(f"Orthanc 업로드가 실패했습니다. (HTTP {exc.code})") from exc
    except (URLError, TimeoutError) as exc:
        raise OrthancUploadError("Orthanc에 연결할 수 없습니다.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
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
    for dicom_bytes in dicom_files:
        result = _upload_instance(dicom_bytes)
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
    request = Request(
        f"{settings.ORTHANC_BASE_URL}/series/{orthanc_series_id}",
        method="DELETE",
        headers={"Authorization": _auth_header()},
    )
    try:
        with urlopen(request, timeout=settings.ORTHANC_TIMEOUT_SECONDS):
            pass
    except (HTTPError, URLError, TimeoutError) as exc:
        raise OrthancUploadError("업로드된 Orthanc Series를 정리하지 못했습니다.") from exc
