import base64
import email
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
    """Return (body_bytes, raw Content-Type header) for one authenticated Orthanc call."""
    token = base64.b64encode(
        f"{settings.ORTHANC_USERNAME}:{settings.ORTHANC_PASSWORD}".encode("utf-8"),
    ).decode("ascii")
    request = Request(
        f"{settings.ORTHANC_BASE_URL}{path}",
        headers={"Accept": accept, "Authorization": f"Basic {token}"},
    )
    try:
        with urlopen(request, timeout=settings.ORTHANC_TIMEOUT_SECONDS) as response:
            return response.read(), response.headers.get("Content-Type", "")
    except HTTPError as exc:
        if exc.code == 404:
            raise OrthancDicomWebError("Orthanc에서 해당 DICOMweb 리소스를 찾을 수 없습니다.") from exc
        raise OrthancDicomWebError(f"Orthanc DICOMweb 요청이 실패했습니다. (HTTP {exc.code})") from exc
    except (URLError, TimeoutError) as exc:
        raise OrthancDicomWebError("Orthanc에 연결할 수 없습니다.") from exc


def _extract_dicom_part(content_type_header, body):
    """Unwrap a WADO-RS multipart/related response and return the raw DICOM bytes.

    Orthanc's DICOMweb plugin rejects a bare `application/dicom` Accept for single
    Instance retrieval (HTTP 400) and only serves the DICOM-standard multipart/related
    envelope, so every caller of retrieve_instance() gets plain DICOM bytes back
    without needing to know about MIME parts themselves.
    """
    message = email.message_from_bytes(
        f"Content-Type: {content_type_header}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body,
    )
    if not message.is_multipart():
        raise OrthancDicomWebError("Orthanc DICOMweb 응답이 multipart 형식이 아닙니다.")
    for part in message.walk():
        if part.get_content_type() in ("application/dicom", "application/octet-stream"):
            payload = part.get_payload(decode=True)
            if payload:
                return payload
    raise OrthancDicomWebError("Orthanc DICOMweb 응답에서 DICOM part를 찾지 못했습니다.")


def get_series_metadata(study_instance_uid, series_instance_uid):
    """WADO-RS: DICOM JSON metadata for every instance in one Series."""
    if not is_valid_dicom_uid(study_instance_uid) or not is_valid_dicom_uid(series_instance_uid):
        raise OrthancDicomWebError("Invalid Study/Series UID.")
    content, content_type_header = _request(
        f"/dicom-web/studies/{study_instance_uid}/series/{series_instance_uid}/metadata",
        accept="application/dicom+json",
    )
    return DicomWebResponse(content=content, content_type=content_type_header.split(";")[0].strip())


def list_series_instances(study_instance_uid, series_instance_uid):
    """QIDO-RS: the list of SOP Instance UIDs belonging to one Series."""
    if not is_valid_dicom_uid(study_instance_uid) or not is_valid_dicom_uid(series_instance_uid):
        raise OrthancDicomWebError("Invalid Study/Series UID.")
    content, content_type_header = _request(
        f"/dicom-web/studies/{study_instance_uid}/series/{series_instance_uid}/instances",
        accept="application/dicom+json",
    )
    return DicomWebResponse(content=content, content_type=content_type_header.split(";")[0].strip())


def retrieve_instance(study_instance_uid, series_instance_uid, sop_instance_uid):
    """WADO-RS: retrieve one Instance's pixel data, scoped to its own Study/Series.

    Always requests the DICOM-standard multipart/related envelope from Orthanc (the
    only form its DICOMweb plugin accepts for a single Instance) and unwraps it, so
    callers always receive plain `application/dicom` bytes.
    """
    if (
        not is_valid_dicom_uid(study_instance_uid)
        or not is_valid_dicom_uid(series_instance_uid)
        or not is_valid_dicom_uid(sop_instance_uid)
    ):
        raise OrthancDicomWebError("Invalid Study/Series/Instance UID.")
    content, content_type_header = _request(
        f"/dicom-web/studies/{study_instance_uid}/series/{series_instance_uid}/instances/{sop_instance_uid}",
        accept='multipart/related; type="application/dicom"',
    )
    dicom_bytes = _extract_dicom_part(content_type_header, content)
    return DicomWebResponse(content=dicom_bytes, content_type="application/dicom")
