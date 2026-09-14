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


IMAGE_CONTENT_TYPES = {
    "image/png": (".png",),
    "image/jpeg": (".jpg", ".jpeg"),
}


def _bucket_name():
    bucket_name = settings.XRAY_GCS_BUCKET.strip()
    if not bucket_name:
        raise XrayStorageError("XRAY_GCS_BUCKET must be configured.")
    return bucket_name


def _safe_component(value, field_name):
    value = str(value).strip()
    if not value or value in {".", ".."} or "/" in value or "\\" in value:
        raise InvalidXrayObjectPath(f"Invalid {field_name}.")
    return value


def _safe_filename(filename, *, allowed_extensions=(".png",)):
    filename = _safe_component(filename, "filename")
    allowed_extensions = tuple(extension.lower() for extension in allowed_extensions)
    if filename.lower().endswith(allowed_extensions):
        return filename
    return f"{filename}{allowed_extensions[0]}"


def build_xray_object_path(*, hospital_id, case_id, order_id, filename, allowed_extensions=(".png",)):
    return "/".join(
        (
            "xray",
            _safe_component(hospital_id, "hospital_id"),
            _safe_component(case_id, "case_id"),
            _safe_component(order_id, "order_id"),
            _safe_filename(filename, allowed_extensions=allowed_extensions),
        )
    )


def _build_gs_uri(object_path):
    return f"gs://{_bucket_name()}/{object_path}"


def parse_xray_gs_uri(gs_uri, *, allowed_extensions=(".png",)):
    if not isinstance(gs_uri, str):
        raise InvalidXrayObjectPath("Invalid GCS URI.")
    parsed = urlparse(gs_uri)
    if (
        parsed.scheme != "gs"
        or parsed.netloc != _bucket_name()
        or parsed.params
        or parsed.query
        or parsed.fragment
    ):
        raise InvalidXrayObjectPath("Invalid X-ray GCS URI.")

    object_path = parsed.path.lstrip("/")
    parts = object_path.split("/")
    allowed_extensions = tuple(extension.lower() for extension in allowed_extensions)
    if (
        len(parts) != 5
        or parts[0] != "xray"
        or any(not part or part in {".", ".."} for part in parts)
        or not parts[-1].lower().endswith(allowed_extensions)
    ):
        raise InvalidXrayObjectPath("Invalid X-ray GCS object path.")
    return object_path


def _get_bucket():
    try:
        return storage.Client().bucket(_bucket_name())
    except GoogleAuthError as exc:
        raise XrayStorageCredentialError("GCS credentials are unavailable.") from exc
    except Exception as exc:
        raise XrayStorageCredentialError("The GCS client could not be initialized.") from exc


def _upload(image_bytes, *, content_type, object_path):
    try:
        _get_bucket().blob(object_path).upload_from_string(image_bytes, content_type=content_type)
    except NotFound as exc:
        raise XrayStorageBucketNotFound("X-ray GCS bucket was not found.") from exc
    except (Forbidden, Unauthorized) as exc:
        raise XrayStorageAccessError("Access to the X-ray GCS bucket was denied.") from exc
    except XrayStorageError:
        raise
    except Exception as exc:
        raise XrayStorageUploadError("The X-ray image could not be uploaded to GCS.") from exc
    return _build_gs_uri(object_path)


def upload_xray_image(image_bytes, *, content_type, hospital_id, case_id, order_id, filename):
    """Upload original PNG or JPEG bytes and return their approved gs:// URI."""
    if content_type not in IMAGE_CONTENT_TYPES:
        raise XrayStorageUploadError("Only PNG or JPEG X-ray images are supported.")
    if not isinstance(image_bytes, bytes) or not image_bytes:
        raise XrayStorageUploadError("Non-empty image bytes are required.")
    object_path = build_xray_object_path(
        hospital_id=hospital_id,
        case_id=case_id,
        order_id=order_id,
        filename=filename,
        allowed_extensions=IMAGE_CONTENT_TYPES[content_type],
    )
    return _upload(image_bytes, content_type=content_type, object_path=object_path)


def upload_xray_png(png_bytes, *, hospital_id, case_id, order_id, filename):
    return upload_xray_image(
        png_bytes,
        content_type="image/png",
        hospital_id=hospital_id,
        case_id=case_id,
        order_id=order_id,
        filename=filename,
    )


def _download(gs_uri, *, allowed_extensions):
    object_path = parse_xray_gs_uri(gs_uri, allowed_extensions=allowed_extensions)
    try:
        return _get_bucket().blob(object_path).download_as_bytes()
    except NotFound as exc:
        raise XrayStorageObjectNotFound("X-ray image object was not found.") from exc
    except (Forbidden, Unauthorized) as exc:
        raise XrayStorageAccessError("Access to the X-ray GCS bucket was denied.") from exc
    except XrayStorageError:
        raise
    except Exception as exc:
        raise XrayStorageDownloadError("The X-ray image could not be downloaded from GCS.") from exc


def download_xray_image_bytes(gs_uri):
    return _download(gs_uri, allowed_extensions=(".png", ".jpg", ".jpeg"))


def delete_xray_image(gs_uri):
    """Best-effort cleanup for an object uploaded before its DB asset could be created."""
    object_path = parse_xray_gs_uri(gs_uri, allowed_extensions=(".png", ".jpg", ".jpeg"))
    try:
        _get_bucket().blob(object_path).delete()
    except Exception as exc:
        raise XrayStorageUploadError("The uploaded X-ray image could not be cleaned up.") from exc


def download_xray_png_bytes(gs_uri):
    return _download(gs_uri, allowed_extensions=(".png",))


download_xray_png = download_xray_png_bytes
