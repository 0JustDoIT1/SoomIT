import uuid
from urllib.parse import urlparse

from django.conf import settings
from google.api_core.exceptions import Forbidden, NotFound, Unauthorized
from google.auth.exceptions import GoogleAuthError
from google.cloud import storage


class DoctorProfileStorageError(RuntimeError):
    """Base error for doctor profile image GCS storage operations."""


class InvalidDoctorProfileImagePath(DoctorProfileStorageError):
    pass


class DoctorProfileStorageCredentialError(DoctorProfileStorageError):
    pass


class DoctorProfileStorageAccessError(DoctorProfileStorageError):
    pass


class DoctorProfileStorageBucketNotFound(DoctorProfileStorageError):
    pass


class DoctorProfileStorageObjectNotFound(DoctorProfileStorageError):
    pass


class DoctorProfileStorageUploadError(DoctorProfileStorageError):
    pass


class DoctorProfileStorageDownloadError(DoctorProfileStorageError):
    pass


# jpg/jpeg, png, webp only - matches the profile photo picker's accepted types.
IMAGE_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
_EXTENSION_TO_CONTENT_TYPE = {extension: content_type for content_type, extension in IMAGE_CONTENT_TYPES.items()}


def _bucket_name():
    bucket_name = settings.DOCTOR_PROFILE_GCS_BUCKET.strip()
    if not bucket_name:
        raise DoctorProfileStorageError("DOCTOR_PROFILE_GCS_BUCKET must be configured.")
    return bucket_name


def _safe_component(value, field_name):
    value = str(value).strip()
    if not value or value in {".", ".."} or "/" in value or "\\" in value:
        raise InvalidDoctorProfileImagePath(f"Invalid {field_name}.")
    return value


def build_doctor_profile_object_path(*, hospital_id, user_id, content_type):
    extension = IMAGE_CONTENT_TYPES[content_type]
    filename = f"{uuid.uuid4()}{extension}"
    return "/".join(
        (
            "doctor-profile",
            _safe_component(hospital_id, "hospital_id"),
            _safe_component(user_id, "user_id"),
            filename,
        )
    )


def _build_gs_uri(object_path):
    return f"gs://{_bucket_name()}/{object_path}"


def parse_doctor_profile_gs_uri(gs_uri):
    if not isinstance(gs_uri, str):
        raise InvalidDoctorProfileImagePath("Invalid GCS URI.")
    parsed = urlparse(gs_uri)
    if (
        parsed.scheme != "gs"
        or parsed.netloc != _bucket_name()
        or parsed.params
        or parsed.query
        or parsed.fragment
    ):
        raise InvalidDoctorProfileImagePath("Invalid doctor profile image GCS URI.")

    object_path = parsed.path.lstrip("/")
    parts = object_path.split("/")
    extension = "." + parts[-1].rsplit(".", 1)[-1].lower() if parts and "." in parts[-1] else ""
    if (
        len(parts) != 4
        or parts[0] != "doctor-profile"
        or any(not part or part in {".", ".."} for part in parts)
        or extension not in _EXTENSION_TO_CONTENT_TYPE
    ):
        raise InvalidDoctorProfileImagePath("Invalid doctor profile image GCS object path.")
    return object_path, _EXTENSION_TO_CONTENT_TYPE[extension]


def _get_bucket():
    try:
        return storage.Client().bucket(_bucket_name())
    except GoogleAuthError as exc:
        raise DoctorProfileStorageCredentialError("GCS credentials are unavailable.") from exc
    except Exception as exc:
        raise DoctorProfileStorageCredentialError("The GCS client could not be initialized.") from exc


def upload_doctor_profile_image(image_bytes, *, content_type, hospital_id, user_id):
    """Upload a doctor's profile image and return its gs:// URI."""
    if content_type not in IMAGE_CONTENT_TYPES:
        raise DoctorProfileStorageUploadError("Only JPEG, PNG, or WebP images are supported.")
    if not isinstance(image_bytes, bytes) or not image_bytes:
        raise DoctorProfileStorageUploadError("Non-empty image bytes are required.")
    object_path = build_doctor_profile_object_path(
        hospital_id=hospital_id, user_id=user_id, content_type=content_type,
    )
    try:
        _get_bucket().blob(object_path).upload_from_string(image_bytes, content_type=content_type)
    except NotFound as exc:
        raise DoctorProfileStorageBucketNotFound("Doctor profile image GCS bucket was not found.") from exc
    except (Forbidden, Unauthorized) as exc:
        raise DoctorProfileStorageAccessError("Access to the doctor profile image GCS bucket was denied.") from exc
    except DoctorProfileStorageError:
        raise
    except Exception as exc:
        raise DoctorProfileStorageUploadError("The profile image could not be uploaded to GCS.") from exc
    return _build_gs_uri(object_path)


def download_doctor_profile_image_bytes(gs_uri):
    """Return (image_bytes, content_type) for a stored gs:// doctor profile image URI."""
    object_path, content_type = parse_doctor_profile_gs_uri(gs_uri)
    try:
        image_bytes = _get_bucket().blob(object_path).download_as_bytes()
    except NotFound as exc:
        raise DoctorProfileStorageObjectNotFound("Doctor profile image object was not found.") from exc
    except (Forbidden, Unauthorized) as exc:
        raise DoctorProfileStorageAccessError("Access to the doctor profile image GCS bucket was denied.") from exc
    except DoctorProfileStorageError:
        raise
    except Exception as exc:
        raise DoctorProfileStorageDownloadError("The profile image could not be downloaded from GCS.") from exc
    return image_bytes, content_type
