from urllib.parse import urlparse

from django.conf import settings
from google.api_core.exceptions import Forbidden, NotFound, Unauthorized
from google.auth.exceptions import GoogleAuthError
from google.cloud import storage


class XrayStorageError(RuntimeError):
    """Base error for X-ray GCS storage operations."""


class InvalidXrayObjectPath(XrayStorageError):
    pass


class XrayStorageCredentialError(XrayStorageError):
    pass


class XrayStorageAccessError(XrayStorageError):
    pass


class XrayStorageBucketNotFound(XrayStorageError):
    pass


class XrayStorageObjectNotFound(XrayStorageError):
    pass


class XrayStorageUploadError(XrayStorageError):
    pass


class XrayStorageDownloadError(XrayStorageError):
    pass


def _bucket_name():
    bucket_name = settings.XRAY_GCS_BUCKET.strip()
    if not bucket_name:
        raise XrayStorageError("XRAY_GCS_BUCKET 설정이 필요합니다.")
    return bucket_name


def _safe_component(value, field_name):
    value = str(value).strip()
    if not value or value in {".", ".."} or "/" in value or "\\" in value:
        raise InvalidXrayObjectPath(f"{field_name} 값이 올바르지 않습니다.")
    return value


def _safe_filename(filename):
    filename = _safe_component(filename, "filename")
    if filename.lower().endswith(".png"):
        return filename
    return f"{filename}.png"


def build_xray_object_path(*, hospital_id, case_id, order_id, filename):
    """Build the approved object name without altering an existing .png filename."""
    return "/".join(
        (
            "xray",
            _safe_component(hospital_id, "hospital_id"),
            _safe_component(case_id, "case_id"),
            _safe_component(order_id, "order_id"),
            _safe_filename(filename),
        )
    )


def _build_gs_uri(object_path):
    return f"gs://{_bucket_name()}/{object_path}"


def parse_xray_gs_uri(gs_uri):
    if not isinstance(gs_uri, str):
        raise InvalidXrayObjectPath("GCS URI가 올바르지 않습니다.")
    parsed = urlparse(gs_uri)
    if (
        parsed.scheme != "gs"
        or parsed.netloc != _bucket_name()
        or parsed.params
        or parsed.query
        or parsed.fragment
    ):
        raise InvalidXrayObjectPath("X-ray GCS URI가 올바르지 않습니다.")

    object_path = parsed.path.lstrip("/")
    parts = object_path.split("/")
    if (
        len(parts) != 5
        or parts[0] != "xray"
        or any(not part or part in {".", ".."} for part in parts)
        or not parts[-1].lower().endswith(".png")
    ):
        raise InvalidXrayObjectPath("X-ray GCS object path가 올바르지 않습니다.")
    return object_path


def _get_bucket():
    try:
        return storage.Client().bucket(_bucket_name())
    except GoogleAuthError as exc:
        raise XrayStorageCredentialError("GCS 인증 정보를 사용할 수 없습니다.") from exc
    except Exception as exc:
        raise XrayStorageCredentialError("GCS client를 초기화할 수 없습니다.") from exc


def upload_xray_png(png_bytes, *, hospital_id, case_id, order_id, filename):
    """Upload unmodified PNG bytes and return their approved gs:// URI."""
    if not isinstance(png_bytes, bytes) or not png_bytes:
        raise XrayStorageUploadError("비어 있지 않은 PNG bytes가 필요합니다.")

    object_path = build_xray_object_path(
        hospital_id=hospital_id,
        case_id=case_id,
        order_id=order_id,
        filename=filename,
    )
    try:
        _get_bucket().blob(object_path).upload_from_string(
            png_bytes,
            content_type="image/png",
        )
    except NotFound as exc:
        raise XrayStorageBucketNotFound("X-ray GCS bucket을 찾을 수 없습니다.") from exc
    except (Forbidden, Unauthorized) as exc:
        raise XrayStorageAccessError("X-ray GCS bucket 접근이 거부되었습니다.") from exc
    except XrayStorageError:
        raise
    except Exception as exc:
        raise XrayStorageUploadError("X-ray PNG를 GCS에 업로드할 수 없습니다.") from exc
    return _build_gs_uri(object_path)


def download_xray_png_bytes(gs_uri):
    """Download original PNG bytes from an approved gs:// X-ray object URI."""
    object_path = parse_xray_gs_uri(gs_uri)
    try:
        return _get_bucket().blob(object_path).download_as_bytes()
    except NotFound as exc:
        raise XrayStorageObjectNotFound("X-ray PNG object를 찾을 수 없습니다.") from exc
    except (Forbidden, Unauthorized) as exc:
        raise XrayStorageAccessError("X-ray GCS bucket 접근이 거부되었습니다.") from exc
    except XrayStorageError:
        raise
    except Exception as exc:
        raise XrayStorageDownloadError("X-ray PNG를 GCS에서 다운로드할 수 없습니다.") from exc


download_xray_png = download_xray_png_bytes
