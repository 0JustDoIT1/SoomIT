import base64
import re
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


# DICOM UI value representation: numeric components joined by dots, max 64 chars.
_UID_PATTERN = re.compile(r"^[0-9]+(\.[0-9]+)*$")


class OrthancDicomWebError(RuntimeError):
    pass


@dataclass(frozen=True)
class DicomWebResponse:
    content: bytes
    content_type: str


def is_valid_dicom_uid(value):
    return isinstance(value, str) and 1 <= len(value) <= 64 and bool(_UID_PATTERN.fullmatch(value))


def _request(path, *, accept):
    token = base64.b64encode(
        f"{settings.ORTHANC_USERNAME}:{settings.ORTHANC_PASSWORD}".encode("utf-8"),
    ).decode("ascii")
    request = Request(
        f"{settings.ORTHANC_BASE_URL}{path}",
        headers={"Accept": accept, "Authorization": f"Basic {token}"},
    )
    try:
        with urlopen(request, timeout=settings.ORTHANC_TIMEOUT_SECONDS) as response:
            return DicomWebResponse(
                content=response.read(),
                content_type=response.headers.get_content_type(),
            )
    except HTTPError as exc:
        if exc.code == 404:
            raise OrthancDicomWebError("Orthanc에서 해당 DICOMweb 리소스를 찾을 수 없습니다.") from exc
        raise OrthancDicomWebError(f"Orthanc DICOMweb 요청이 실패했습니다. (HTTP {exc.code})") from exc
    except (URLError, TimeoutError) as exc:
        raise OrthancDicomWebError("Orthanc에 연결할 수 없습니다.") from exc


def get_series_metadata(study_instance_uid, series_instance_uid):
    """WADO-RS: DICOM JSON metadata for every instance in one Series."""
    if not is_valid_dicom_uid(study_instance_uid) or not is_valid_dicom_uid(series_instance_uid):
        raise OrthancDicomWebError("Invalid Study/Series UID.")
    return _request(
        f"/dicom-web/studies/{study_instance_uid}/series/{series_instance_uid}/metadata",
        accept="application/dicom+json",
    )


def list_series_instances(study_instance_uid, series_instance_uid):
    """QIDO-RS: the list of SOP Instance UIDs belonging to one Series."""
    if not is_valid_dicom_uid(study_instance_uid) or not is_valid_dicom_uid(series_instance_uid):
        raise OrthancDicomWebError("Invalid Study/Series UID.")
    return _request(
        f"/dicom-web/studies/{study_instance_uid}/series/{series_instance_uid}/instances",
        accept="application/dicom+json",
    )


def retrieve_instance(study_instance_uid, series_instance_uid, sop_instance_uid, *, accept):
    """WADO-RS: retrieve one Instance's pixel data, scoped to its own Study/Series."""
    if (
        not is_valid_dicom_uid(study_instance_uid)
        or not is_valid_dicom_uid(series_instance_uid)
        or not is_valid_dicom_uid(sop_instance_uid)
    ):
        raise OrthancDicomWebError("Invalid Study/Series/Instance UID.")
    return _request(
        f"/dicom-web/studies/{study_instance_uid}/series/{series_instance_uid}/instances/{sop_instance_uid}",
        accept=accept,
    )
