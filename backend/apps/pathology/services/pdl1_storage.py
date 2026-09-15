from urllib.parse import urlparse

from django.conf import settings
from google.api_core.exceptions import Forbidden, NotFound, Unauthorized
from google.auth.exceptions import GoogleAuthError
from google.cloud import storage


class PDL1StorageError(RuntimeError):
    pass


WSI_EXTENSIONS = (".svs", ".tif", ".tiff")
ANNOTATION_EXTENSION = ".annotations"


def _bucket_name():
    bucket_name = settings.PDL1_GCS_BUCKET.strip()
    if not bucket_name:
        raise PDL1StorageError("PDL1_GCS_BUCKET must be configured.")
    return bucket_name


def _safe_component(value, field_name):
    value = str(value).strip()
    if not value or value in {".", ".."} or "/" in value or "\\" in value:
        raise PDL1StorageError(f"Invalid {field_name}.")
    return value


def _safe_filename(filename, extensions):
    filename = _safe_component(filename, "filename")
    if not filename.lower().endswith(extensions):
        raise PDL1StorageError("Unsupported PD-L1 input file extension.")
    return filename


def build_pdl1_object_path(*, hospital_id, case_id, order_id, kind, filename):
    if kind not in {"wsi", "annotation"}:
        raise PDL1StorageError("Invalid PD-L1 input kind.")
    extensions = WSI_EXTENSIONS if kind == "wsi" else (ANNOTATION_EXTENSION,)
    return "/".join((
        "pathology", "pdl1", _safe_component(hospital_id, "hospital_id"),
        _safe_component(case_id, "case_id"), _safe_component(order_id, "order_id"),
        kind, _safe_filename(filename, extensions),
    ))


def _client():
    try:
        return storage.Client()
    except GoogleAuthError as exc:
        raise PDL1StorageError("PD-L1 GCS credentials are unavailable.") from exc
    except Exception as exc:
        raise PDL1StorageError("PD-L1 GCS client could not be initialized.") from exc


def _upload(data, *, object_path, content_type):
    if not isinstance(data, bytes) or not data:
        raise PDL1StorageError("PD-L1 input bytes are required.")
    try:
        _client().bucket(_bucket_name()).blob(object_path).upload_from_string(data, content_type=content_type)
    except (Forbidden, Unauthorized) as exc:
        raise PDL1StorageError("PD-L1 GCS upload access was denied.") from exc
    except Exception as exc:
        raise PDL1StorageError("PD-L1 input could not be uploaded.") from exc
    return f"gs://{_bucket_name()}/{object_path}"


def upload_pdl1_input(*, data, hospital_id, case_id, order_id, kind, filename, content_type):
    return _upload(
        data,
        object_path=build_pdl1_object_path(
            hospital_id=hospital_id, case_id=case_id, order_id=order_id, kind=kind, filename=filename,
        ),
        content_type=content_type or "application/octet-stream",
    )


def _parse_gcs_uri(gs_uri):
    if not isinstance(gs_uri, str):
        raise PDL1StorageError("Invalid PD-L1 annotation GCS URI.")
    parsed = urlparse(gs_uri)
    object_path = parsed.path.lstrip("/")
    if parsed.scheme != "gs" or parsed.netloc != _bucket_name() or not object_path:
        raise PDL1StorageError("Invalid PD-L1 annotation GCS URI.")
    return object_path


def download_pdl1_annotation_bytes(gs_uri):
    object_path = _parse_gcs_uri(gs_uri)
    try:
        return _client().bucket(_bucket_name()).blob(object_path).download_as_bytes()
    except (Forbidden, Unauthorized, NotFound) as exc:
        raise PDL1StorageError("PD-L1 annotation could not be read.") from exc
    except Exception as exc:
        raise PDL1StorageError("PD-L1 annotation could not be downloaded.") from exc


def delete_pdl1_input(gs_uri):
    object_path = _parse_gcs_uri(gs_uri)
    try:
        _client().bucket(_bucket_name()).blob(object_path).delete()
    except Exception:
        pass
